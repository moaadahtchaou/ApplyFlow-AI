import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchLimitedPage,
  validatePublicUrl,
  WEBSITE_RESEARCH_LIMITS
} from './website-research';
import { mockResearch } from '../ai/company-analysis';

afterEach(() => vi.unstubAllGlobals());

describe('safe company website fetching', () => {
  it.each([
    'http://localhost',
    'http://127.0.0.1',
    'http://10.2.3.4',
    'http://169.254.10.2',
    'file:///etc/passwd'
  ])('rejects unsafe URL %s', async (url) => {
    await expect(validatePublicUrl(url)).rejects.toMatchObject({
      name: 'WebsiteResearchError'
    });
  });

  it('revalidates redirects and rejects a redirect to a private IP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/internal' }
    })));
    await expect(fetchLimitedPage('https://93.184.216.34')).rejects.toMatchObject({
      code: 'PRIVATE_ADDRESS_REJECTED'
    });
  });

  it('rejects a page declared over the download limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>content</html>', {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'content-length': String(WEBSITE_RESEARCH_LIMITS.maxBytesPerPage + 1)
      }
    })));
    await expect(fetchLimitedPage('https://93.184.216.34')).rejects.toMatchObject({
      code: 'PAGE_TOO_LARGE'
    });
  });

  it('persists only fetched source URLs in deterministic company research', () => {
    const sourceUrl = 'https://company.example/about';
    const research = mockResearch(
      { name: 'Company Example', website: 'https://company.example', industry: 'Software' },
      {
        pages: [{
          url: sourceUrl,
          title: 'About',
          text: 'Company Example provides workflow software for recruiting teams. The platform helps teams organize candidate reviews.'
        }],
        warnings: [],
        failedPages: []
      }
    );
    expect(research.sources.map((source) => source.url)).toEqual([sourceUrl]);
    expect(research.personalizationHooks.every((hook) => hook.sourceUrl === sourceUrl)).toBe(true);
  });
});
