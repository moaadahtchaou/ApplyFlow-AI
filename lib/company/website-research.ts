import dns from 'node:dns/promises';
import net from 'node:net';

export const WEBSITE_RESEARCH_LIMITS = {
  maxPages: 6,
  maxRedirects: 3,
  maxBytesPerPage: 600_000,
  maxTextPerPage: 14_000,
  maxTotalText: 55_000,
  timeoutMs: 10_000
} as const;

const relevantPath = /\b(about|company|services?|products?|solutions?|industr(?:y|ies)|careers?|jobs?|projects?|case-?stud(?:y|ies)|contact)\b/i;
const blockedExtensions = /\.(?:pdf|docx?|xlsx?|zip|rar|7z|png|jpe?g|gif|webp|svg|mp4|mp3|avi|exe|dmg)(?:$|[?#])/i;

export class WebsiteResearchError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = 'WebsiteResearchError';
  }
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return net.isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  return false;
}

export function isPrivateAddress(ip: string) {
  const version = net.isIP(ip);
  return version === 4 ? isPrivateIpv4(ip) : version === 6 ? isPrivateIpv6(ip) : true;
}

export async function validatePublicUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WebsiteResearchError('INVALID_URL', 'Enter a valid public company website URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new WebsiteResearchError('UNSUPPORTED_PROTOCOL', 'Only HTTP and HTTPS company websites are supported.');
  }
  if (url.username || url.password) {
    throw new WebsiteResearchError('URL_CREDENTIALS_REJECTED', 'Website URLs containing credentials are not allowed.');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new WebsiteResearchError('LOCALHOST_REJECTED', 'Local and internal website addresses are not allowed.');
  }
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new WebsiteResearchError('PRIVATE_ADDRESS_REJECTED', 'Private, loopback, and link-local addresses are not allowed.');
    }
  } else {
    let addresses: Array<{ address: string }>;
    try {
      addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new WebsiteResearchError('DNS_FAILED', 'The company website hostname could not be resolved.', 422);
    }
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new WebsiteResearchError('PRIVATE_ADDRESS_REJECTED', 'The website resolves to a private or internal address.');
    }
  }
  url.hash = '';
  return url;
}

function decodeHtml(text: string) {
  const entities: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '
  };
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => entities[name.toLowerCase()] ?? match);
}

export function extractReadableHtml(html: string) {
  const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    .replace(/\s+/g, ' ').trim().slice(0, 300);
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|canvas|noscript|template|iframe|form|nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|p|div|section|article|main|li|h[1-6]|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const lines = decodeHtml(withoutNoise)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 3 && !/^(accept|reject|cookie settings?|privacy policy|all rights reserved)$/i.test(line));
  const seen = new Set<string>();
  const text = lines.filter((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join('\n').slice(0, WEBSITE_RESEARCH_LIMITS.maxTextPerPage);
  return { title: title || undefined, text };
}

function discoverLinks(html: string, baseUrl: URL) {
  const links: URL[] = [];
  const regex = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl);
      url.hash = '';
      if (
        url.origin === baseUrl.origin &&
        ['http:', 'https:'].includes(url.protocol) &&
        relevantPath.test(`${url.pathname} ${url.search}`) &&
        !blockedExtensions.test(url.pathname)
      ) links.push(url);
    } catch {
      // Ignore malformed page links.
    }
  }
  return [...new Map(links.map((url) => [url.href.replace(/\/$/, ''), url])).values()]
    .sort((a, b) => {
      const rank = (url: URL) => /about|services|products|solutions/.test(url.pathname) ? 0 : /careers|jobs/.test(url.pathname) ? 1 : 2;
      return rank(a) - rank(b);
    });
}

async function readLimitedBody(response: Response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > WEBSITE_RESEARCH_LIMITS.maxBytesPerPage) {
      await reader.cancel();
      throw new WebsiteResearchError('PAGE_TOO_LARGE', 'A website page exceeded the allowed download size.', 422);
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

export async function fetchLimitedPage(rawUrl: string, redirectCount = 0): Promise<{
  url: string;
  title?: string;
  text: string;
  html: string;
}> {
  const url = await validatePublicUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBSITE_RESEARCH_LIMITS.timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.6',
        'User-Agent': 'ApplyFlowResearchBot/1.0 (+local user-initiated company research)'
      },
      cache: 'no-store'
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount >= WEBSITE_RESEARCH_LIMITS.maxRedirects) {
        throw new WebsiteResearchError('TOO_MANY_REDIRECTS', 'The website redirected too many times.', 422);
      }
      const location = response.headers.get('location');
      if (!location) throw new WebsiteResearchError('INVALID_REDIRECT', 'The website returned an invalid redirect.', 422);
      return fetchLimitedPage(new URL(location, url).href, redirectCount + 1);
    }
    if (!response.ok) {
      throw new WebsiteResearchError('FETCH_FAILED', `The website returned HTTP ${response.status}.`, 422);
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
      throw new WebsiteResearchError('UNSUPPORTED_CONTENT', 'The website did not return readable HTML or text.', 422);
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > WEBSITE_RESEARCH_LIMITS.maxBytesPerPage) {
      throw new WebsiteResearchError('PAGE_TOO_LARGE', 'A website page exceeded the allowed download size.', 422);
    }
    const html = await readLimitedBody(response);
    const readable = contentType.includes('text/plain')
      ? { text: html.replace(/\s+/g, ' ').trim().slice(0, WEBSITE_RESEARCH_LIMITS.maxTextPerPage), title: undefined }
      : extractReadableHtml(html);
    if (readable.text.length < 80) {
      throw new WebsiteResearchError('NO_READABLE_CONTENT', 'The page did not contain enough readable public text.', 422);
    }
    return { url: url.href, ...readable, html };
  } catch (error) {
    if (error instanceof WebsiteResearchError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new WebsiteResearchError('FETCH_TIMEOUT', 'The website request timed out.', 422);
    }
    throw new WebsiteResearchError('FETCH_FAILED', 'The website could not be fetched.', 422);
  } finally {
    clearTimeout(timeout);
  }
}

function parseRobotsDisallows(text: string) {
  const lines = text.split('\n').map((line) => line.replace(/#.*/, '').trim()).filter(Boolean);
  let applies = false;
  const disallowed: string[] = [];
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') applies = value === '*';
    if (applies && key === 'disallow' && value) disallowed.push(value);
  }
  return disallowed;
}

export async function crawlCompanyWebsite(rawUrl: string) {
  const homepage = await fetchLimitedPage(rawUrl);
  const origin = new URL(homepage.url).origin;
  const warnings: string[] = [];
  let disallowed: string[] = [];
  try {
    const robots = await fetchLimitedPage(`${origin}/robots.txt`);
    disallowed = parseRobotsDisallows(robots.text);
  } catch (error) {
    if (error instanceof WebsiteResearchError && !['FETCH_FAILED', 'NO_READABLE_CONTENT'].includes(error.code)) {
      warnings.push(`robots.txt could not be checked: ${error.message}`);
    }
  }

  const pages = [{ url: homepage.url, title: homepage.title, text: homepage.text }];
  const failedPages: Array<{ url: string; reason: string }> = [];
  const links = disallowed.includes('/')
    ? []
    : discoverLinks(homepage.html, new URL(homepage.url))
        .filter((url) => !disallowed.some((path) => url.pathname.startsWith(path)))
        .slice(0, WEBSITE_RESEARCH_LIMITS.maxPages - 1);

  let totalText = homepage.text.length;
  for (const link of links) {
    if (pages.length >= WEBSITE_RESEARCH_LIMITS.maxPages || totalText >= WEBSITE_RESEARCH_LIMITS.maxTotalText) break;
    try {
      const page = await fetchLimitedPage(link.href);
      if (pages.some((existing) => existing.url === page.url)) continue;
      const remaining = WEBSITE_RESEARCH_LIMITS.maxTotalText - totalText;
      const text = page.text.slice(0, remaining);
      pages.push({ url: page.url, title: page.title, text });
      totalText += text.length;
    } catch (error) {
      failedPages.push({
        url: link.href,
        reason: error instanceof WebsiteResearchError ? error.message : 'Page fetch failed.'
      });
    }
  }

  if (failedPages.length) warnings.push(`${failedPages.length} discovered page(s) could not be analyzed.`);
  if (disallowed.includes('/')) warnings.push('robots.txt disallows automated access to the site; only already-fetched public homepage content was retained.');
  return { pages, warnings, failedPages };
}
