import { extractEmailsFromText, normalizeUrl } from './utils';

const CONTACT_PATHS = ['/', '/contact', '/contact-us', '/about', '/about-us', '/careers', '/jobs'];
const LINK_RE = /href\s*=\s*["']([^"'#]+)["']/gi;

async function fetchPage(url: string, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(8_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(url, {
    redirect: 'follow',
    signal: combined,
    headers: {
      'User-Agent': 'ApplyFlowLeadFinder/1.0 (local job-search research tool)'
    }
  });
  if (!response.ok) return '';
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return '';
  return response.text();
}

function contactLinks(html: string, baseUrl: string) {
  const links: string[] = [];
  for (const match of html.matchAll(LINK_RE)) {
    const href = match[1].replaceAll('&amp;', '&');
    if (!/contact|about|career|jobs|recrut|emploi/i.test(href)) continue;
    try {
      const url = new URL(href, baseUrl);
      if (url.origin === new URL(baseUrl).origin) links.push(url.toString());
    } catch {
      // Ignore malformed links from third-party websites.
    }
  }
  return links;
}

export async function enrichPublicEmails(
  website?: string,
  options: { maxPages?: number; signal?: AbortSignal } = {}
) {
  const base = normalizeUrl(website);
  if (!base) return [];
  const maxPages = Math.min(Math.max(options.maxPages ?? 4, 1), 6);
  const queue = CONTACT_PATHS.map((path) => new URL(path, base).toString());
  const visited = new Set<string>();
  const emails = new Set<string>();

  while (queue.length && visited.size < maxPages) {
    if (options.signal?.aborted) throw new DOMException('Search cancelled.', 'AbortError');
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const html = await fetchPage(url, options.signal);
      extractEmailsFromText(html).forEach((email) => emails.add(email));
      if (visited.size === 1) {
        contactLinks(html, base).slice(0, 3).forEach((link) => queue.push(link));
      }
    } catch (error) {
      if (options.signal?.aborted) throw error;
    }
  }

  return [...emails].sort();
}
