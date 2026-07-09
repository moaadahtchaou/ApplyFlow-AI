import { chromium, type Browser, type Page } from 'playwright';
import { enrichPublicEmails } from './enrich';
import {
  cleanMapsText,
  coordinatesFromMapsUrl,
  isAbortError,
  normalizeUrl,
  parseRating,
  parseReviewCount
} from './utils';
import type { ScrapedLead } from './types';

type SearchInput = {
  keyword: string;
  area: string;
  limit: number;
  maxScan?: number;
  enrichEmails: boolean;
  headed?: boolean;
};

type SearchCallbacks = {
  signal?: AbortSignal;
  onProgress?: (event: { message: string; current?: number; total?: number }) => void | Promise<void>;
  shouldVisitLink?: (sourceUrl: string) => boolean | void | Promise<boolean | void>;
  onLead?: (lead: ScrapedLead) => boolean | void | Promise<boolean | void>;
};

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Search cancelled.', 'AbortError');
}

async function firstText(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        const text = cleanMapsText(await locator.innerText({ timeout: 2_000 }));
        if (text) return text;
      }
    } catch {
      // Google Maps selectors vary by rollout; continue through fallbacks.
    }
  }
  return undefined;
}

async function dismissConsent(page: Page) {
  for (const label of ['Accept all', 'Tout accepter', 'Accepter tout', "J'accepte", 'I agree', 'قبول الكل']) {
    try {
      const button = page.getByRole('button', { name: label, exact: true }).first();
      if (await button.count() && await button.isVisible()) {
        await button.click({ timeout: 2_000 });
        await page.waitForTimeout(700);
        return;
      }
    } catch {
      // No consent dialog in this locale/session.
    }
  }
}

async function detectGoogleBlock(page: Page) {
  const title = await page.title().catch(() => '');
  const body = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '');
  if (/unusual traffic|verify you are human|not a robot|before you continue/i.test(`${title}\n${body}`)) {
    throw new Error('Google Maps requested verification. Retry with "Show browser" enabled.');
  }
}

async function collectPlaceLinks(page: Page, input: SearchInput, signal?: AbortSignal) {
  const scanLimit = Math.min(50, Math.max(input.limit, input.maxScan ?? input.limit));
  const query = encodeURIComponent(`${input.keyword} in ${input.area}`);
  await page.goto(`https://www.google.com/maps/search/${query}?hl=en`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissConsent(page);
  await detectGoogleBlock(page);

  await page.locator('div[role="feed"]').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
  const links: string[] = [];
  const seen = new Set<string>();
  let unchangedRounds = 0;

  while (links.length < scanLimit && unchangedRounds < 6) {
    assertNotAborted(signal);
    const before = links.length;
    const locators = page.locator('a[href*="/maps/place/"]');
    const count = await locators.count();
    for (let index = 0; index < count && links.length < scanLimit; index += 1) {
      const href = await locators.nth(index).getAttribute('href').catch(() => null);
      if (!href) continue;
      const stableHref = href.split('&ved=')[0];
      if (!seen.has(stableHref)) {
        seen.add(stableHref);
        links.push(stableHref);
      }
    }
    unchangedRounds = links.length === before ? unchangedRounds + 1 : 0;
    const feed = page.locator('div[role="feed"]').first();
    if (await feed.count()) {
      await feed.evaluate((element) => element.scrollBy(0, element.scrollHeight)).catch(() => undefined);
    } else {
      await page.mouse.wheel(0, 5_000);
    }
    await page.waitForTimeout(1_100);
  }

  if (!links.length && page.url().includes('/maps/place/')) links.push(page.url());
  if (!links.length) {
    throw new Error('No Google Maps results were found. Try a broader keyword or enable "Show browser".');
  }
  return links.slice(0, scanLimit);
}

async function extractReviewCount(page: Page) {
  for (const selector of [
    'button[jsaction*="moreReviews"]',
    'button[aria-label*="review" i]',
    '[aria-label*="reviews" i]'
  ]) {
    try {
      const locator = page.locator(selector).first();
      if (!await locator.count()) continue;
      const value = await locator.getAttribute('aria-label') ?? await locator.innerText({ timeout: 1_000 });
      const count = parseReviewCount(value);
      if (count !== undefined) return count;
    } catch {
      // Try the next selector.
    }
  }
  return undefined;
}

async function extractPlace(page: Page, sourceUrl: string): Promise<ScrapedLead | null> {
  const name = await firstText(page, ['h1']);
  if (!name) return null;

  const category = await firstText(page, [
    'button[jsaction*="pane.rating.category"]',
    'button[jsaction*="category"]'
  ]);
  const address = await firstText(page, [
    '[data-item-id="address"]',
    'button[data-item-id*="address"]'
  ]);
  const phone = await firstText(page, [
    'button[data-item-id^="phone:tel:"]',
    '[data-item-id*="phone"]'
  ]);
  const ratingText = await firstText(page, ['.F7nice span[aria-hidden="true"]', '.F7nice']);

  let website: string | undefined;
  for (const selector of ['a[data-item-id="authority"]', 'a[aria-label*="Website" i]']) {
    const locator = page.locator(selector).first();
    if (!await locator.count()) continue;
    website = normalizeUrl(await locator.getAttribute('href'));
    if (website) break;
  }

  const finalUrl = page.url().includes('/maps/place/') ? page.url() : sourceUrl;
  return {
    name,
    category,
    address,
    phone,
    website,
    rating: parseRating(ratingText),
    reviewCount: await extractReviewCount(page),
    ...coordinatesFromMapsUrl(finalUrl),
    sourceUrl: finalUrl
  };
}

export async function searchGoogleMaps(input: SearchInput, callbacks: SearchCallbacks = {}) {
  let browser: Browser | undefined;
  const closeOnAbort = () => {
    void browser?.close().catch(() => undefined);
  };
  callbacks.signal?.addEventListener('abort', closeOnAbort, { once: true });

  try {
    browser = await chromium.launch({ headless: !input.headed });
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);

    await callbacks.onProgress?.({ message: 'Opening Google Maps…' });
    const links = await collectPlaceLinks(page, input, callbacks.signal);
    await callbacks.onProgress?.({
      message: `Google Maps returned ${links.length} places to scan.`,
      current: 0,
      total: links.length
    });

    const seen = new Set<string>();
    const results: ScrapedLead[] = [];
    let acceptedCount = 0;
    for (let index = 0; index < links.length; index += 1) {
      assertNotAborted(callbacks.signal);
      await callbacks.onProgress?.({
        message: `Reading place ${index + 1} of ${links.length} (${acceptedCount}/${input.limit} unique accepted)…`,
        current: index + 1,
        total: links.length
      });

      try {
        const shouldVisit = await callbacks.shouldVisitLink?.(links[index]);
        if (shouldVisit === false) continue;

        await page.goto(links[index], { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await dismissConsent(page);
        await detectGoogleBlock(page);
        await page.locator('h1').first().waitFor({ state: 'visible', timeout: 12_000 });
        await page.waitForTimeout(450);
        const lead = await extractPlace(page, links[index]);
        if (!lead) continue;
        const localKey = `${lead.name.toLowerCase()}|${lead.address?.toLowerCase() ?? ''}`;
        if (seen.has(localKey)) continue;
        seen.add(localKey);

        if (input.enrichEmails && lead.website) {
          await callbacks.onProgress?.({
            message: `Checking ${lead.name} for public email addresses…`,
            current: index + 1,
            total: links.length
          });
          const emails = await enrichPublicEmails(lead.website, { signal: callbacks.signal });
          lead.email = emails[0];
        }

        const accepted = await callbacks.onLead?.(lead);
        if (accepted === false) continue;

        results.push(lead);
        acceptedCount += 1;
        if (acceptedCount >= input.limit) break;
      } catch (error) {
        if (isAbortError(error) || callbacks.signal?.aborted) throw error;
        await callbacks.onProgress?.({
          message: `Skipped one unavailable place (${index + 1}/${links.length}).`,
          current: index + 1,
          total: links.length
        });
      }
      await page.waitForTimeout(650);
    }

    await context.close();
    return results;
  } finally {
    callbacks.signal?.removeEventListener('abort', closeOnAbort);
    await browser?.close().catch(() => undefined);
  }
}
