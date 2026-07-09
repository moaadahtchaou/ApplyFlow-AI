import { describe, expect, it } from 'vitest';
import { businessFocusOptions } from './search-options';

describe('Google Maps search options', () => {
  it('provides the requested IT and software keywords without job queries', () => {
    const it = businessFocusOptions.find((focus) => focus.id === 'it-software');
    expect(it?.keywords).toContain('software company');
    expect(it?.keywords).toContain('software development company');
    expect(it?.keywords).toContain('IT services');
    expect(it?.keywords).toContain('computer consultant');
    expect(it?.keywords.some((keyword) => /jobs?|vacanc|hiring/i.test(keyword))).toBe(false);
  });

  it('has no duplicate keywords inside a category', () => {
    for (const focus of businessFocusOptions) {
      expect(new Set(focus.keywords).size).toBe(focus.keywords.length);
    }
  });
});
