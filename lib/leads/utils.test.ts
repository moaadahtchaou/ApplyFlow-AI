import { describe, expect, it } from 'vitest';
import { canonicalLeadKeys, normalizeMapsIdentity, type CanonicalLeadInput } from './canonical';
import { leadMatchesCompany, leadMatchesLead } from './dedupe';
import {
  buildLeadFingerprint,
  cleanMapsText,
  coordinatesFromMapsUrl,
  extractEmailsFromText,
  normalizeHostname,
  parseCsv,
  parseRating,
  parseReviewCount
} from './utils';

function selectUniqueForTest<T extends CanonicalLeadInput>(
  candidates: T[],
  initialSeenKeys: Iterable<string>,
  limit: number
) {
  const seenKeys = new Set(initialSeenKeys);
  const accepted: T[] = [];
  let skippedCount = 0;

  for (const candidate of candidates) {
    const keys = canonicalLeadKeys(candidate);
    if (keys.some((key) => seenKeys.has(key))) {
      skippedCount += 1;
    } else {
      accepted.push(candidate);
    }
    keys.forEach((key) => seenKeys.add(key));
    if (accepted.length >= limit) break;
  }

  return { accepted, skippedCount };
}

describe('lead normalization', () => {
  it('normalizes company domains and uses them for stable fingerprints', () => {
    expect(normalizeHostname('https://www.Example.com/jobs')).toBe('example.com');
    expect(buildLeadFingerprint({
      name: 'Example Casablanca',
      address: 'Casablanca',
      website: 'https://example.com'
    })).toBe(buildLeadFingerprint({
      name: 'Example Rabat',
      address: 'Rabat',
      website: 'https://www.example.com/about'
    }));
  });

  it('falls back to normalized name and address', () => {
    expect(buildLeadFingerprint({
      name: 'Café Tech',
      address: '10 Rue Liberté'
    })).toBe(buildLeadFingerprint({
      name: 'Cafe-Tech',
      address: '10 rue liberte'
    }));
  });

  it('removes private Google icon glyphs', () => {
    expect(cleanMapsText('\uE0C8 310 Rue Test')).toBe('310 Rue Test');
  });

  it('parses quoted CSV cells safely', () => {
    expect(parseCsv('"name","notes"\r\n"Acme","Hello, ""team"""')).toEqual([
      ['name', 'notes'],
      ['Acme', 'Hello, "team"']
    ]);
  });
});

describe('Google Maps parsing', () => {
  it('parses coordinates from data and at-sign URLs', () => {
    expect(coordinatesFromMapsUrl('https://maps.test/@33.58,-7.61,15z')).toEqual({
      latitude: 33.58,
      longitude: -7.61
    });
    expect(coordinatesFromMapsUrl('https://maps.test/data=!3d34.02!4d-6.83')).toEqual({
      latitude: 34.02,
      longitude: -6.83
    });
  });

  it('parses ratings and review counts safely', () => {
    expect(parseRating('4,7 stars')).toBe(4.7);
    expect(parseReviewCount('1,234 reviews')).toBe(1234);
    expect(parseRating('9.2')).toBeUndefined();
  });
});

describe('lead enrichment and deduplication', () => {
  it('extracts unique public emails and ignores asset names', () => {
    expect(extractEmailsFromText('Hello INFO@EXAMPLE.COM and info@example.com logo@test.png')).toEqual([
      'info@example.com'
    ]);
  });

  it('matches by domain, then by normalized name and location', () => {
    const baseLead = {
      name: 'Acme Tech',
      website: 'https://acme.test',
      address: 'Casablanca',
      phone: null,
      sourceUrl: 'https://maps.google.com/?cid=1',
      fingerprint: 'lead-fingerprint'
    };
    expect(leadMatchesCompany(baseLead, {
      name: 'Different label',
      website: 'https://www.acme.test/about',
      phone: null,
      location: 'Rabat',
      sourceUrl: null,
      leadFingerprint: null
    })).toBe(true);
    expect(leadMatchesCompany({ ...baseLead, website: null }, {
      name: 'ACME-Tech',
      website: null,
      phone: null,
      location: 'casablanca',
      sourceUrl: null,
      leadFingerprint: null
    })).toBe(true);
  });

  it('matches by phone, Google Maps URL, coordinates, or same name and city', () => {
    const baseLead = {
      name: 'Atlas Dev',
      website: null,
      address: '12 Rue Example, Casablanca',
      phone: '+212 522 123 456',
      sourceUrl: 'https://www.google.com/maps/place/atlas/@33.1,-7.1,17z',
      latitude: 33.1,
      longitude: -7.1,
      fingerprint: 'lead-fingerprint',
      search: { area: 'Casablanca, Morocco' }
    };

    expect(leadMatchesCompany(baseLead, {
      name: 'Other Name',
      website: null,
      phone: '0522-123-456',
      location: 'Rabat',
      sourceUrl: null,
      leadFingerprint: null
    })).toBe(true);

    expect(leadMatchesCompany({ ...baseLead, phone: null }, {
      name: 'Other Name',
      website: null,
      phone: null,
      location: 'Rabat',
      sourceUrl: 'https://www.google.com/maps/place/atlas/@33.1,-7.1,17z/',
      leadFingerprint: null
    })).toBe(true);

    expect(leadMatchesCompany({ ...baseLead, phone: null, sourceUrl: null }, {
      name: 'Atlas Dev',
      website: null,
      phone: null,
      location: 'Casablanca',
      sourceUrl: null,
      latitude: 33.1002,
      longitude: -7.1002,
      leadFingerprint: null
    })).toBe(true);

    expect(leadMatchesCompany({ ...baseLead, phone: null, sourceUrl: null, latitude: null, longitude: null }, {
      name: 'ATLAS DEV',
      website: null,
      phone: null,
      location: 'Casablanca',
      sourceUrl: null,
      leadFingerprint: null
    })).toBe(true);
  });

  it('matches duplicate leads before they create repeated Lead Inbox rows', () => {
    const scrapedLead = {
      name: 'Casa Software',
      website: null,
      address: 'Casablanca',
      phone: '+212 522 000 111',
      sourceUrl: 'https://www.google.com/maps/place/casa-software',
      latitude: 33.58,
      longitude: -7.61,
      fingerprint: 'same-fingerprint',
      search: { area: 'Casablanca, Morocco' }
    };

    expect(leadMatchesLead(scrapedLead, {
      name: 'CASA Software',
      website: null,
      address: 'Casablanca',
      phone: '0522 000 111',
      sourceUrl: 'https://www.google.com/maps/place/casa-software/',
      latitude: 33.5801,
      longitude: -7.6101,
      fingerprint: 'same-fingerprint',
      search: { area: 'Casablanca, Morocco' }
    })).toBe(true);
  });

  it('builds overlapping canonical keys for the same company identity', () => {
    const first = canonicalLeadKeys({
      name: 'Nova Code',
      website: 'https://www.novacode.ma/services',
      address: '10 Rue Atlas, Casablanca',
      phone: '+212 522 111 222',
      sourceUrl: 'https://www.google.com/maps?cid=123456',
      latitude: 33.5731,
      longitude: -7.5898
    });
    const second = canonicalLeadKeys({
      name: 'Nova Code SARL',
      website: 'https://novacode.ma',
      address: 'Casablanca',
      phone: '0522-111-222',
      sourceUrl: 'https://www.google.com/maps?cid=123456&ved=abc',
      latitude: 33.57312,
      longitude: -7.58981
    });

    expect(second.some((key) => first.includes(key))).toBe(true);
  });

  it('normalizes Google Maps URLs before deciding whether to open a place', () => {
    expect(normalizeMapsIdentity('https://www.google.com/maps?cid=123456&ved=abc')).toBe('cid:123456');
    expect(normalizeMapsIdentity('https://www.google.com/maps/place/Test/@33.5,-7.6,17z/?entry=ttu')).toBe(
      'https://www.google.com/maps/place/test/@33.5,-7.6,17z'
    );
  });

  it('skips duplicate first results and returns the next unique leads', () => {
    const duplicateLeads = Array.from({ length: 5 }, (_, index) => ({
      name: `Duplicate ${index}`,
      website: `https://duplicate-${index}.test`,
      address: 'Casablanca',
      sourceUrl: `https://www.google.com/maps?cid=${index}`
    }));
    const uniqueLeads = Array.from({ length: 5 }, (_, index) => ({
      name: `Unique ${index}`,
      website: `https://unique-${index}.test`,
      address: 'Casablanca',
      sourceUrl: `https://www.google.com/maps?cid=${index + 10}`
    }));
    const existingKeys = duplicateLeads.flatMap((lead) => canonicalLeadKeys(lead));
    const selected = selectUniqueForTest([...duplicateLeads, ...uniqueLeads], existingKeys, 5);

    expect(selected.skippedCount).toBe(5);
    expect(selected.accepted.map((lead) => lead.name)).toEqual([
      'Unique 0',
      'Unique 1',
      'Unique 2',
      'Unique 3',
      'Unique 4'
    ]);
  });

  it('returns only available new leads when all other candidates are duplicates', () => {
    const duplicate = {
      name: 'Already Seen',
      website: 'https://seen.test',
      address: 'Casablanca',
      sourceUrl: 'https://www.google.com/maps?cid=20'
    };
    const newLead = {
      name: 'Fresh Lead',
      website: 'https://fresh.test',
      address: 'Casablanca',
      sourceUrl: 'https://www.google.com/maps?cid=21'
    };
    const selected = selectUniqueForTest(
      [duplicate, duplicate, newLead],
      canonicalLeadKeys(duplicate),
      5
    );

    expect(selected.accepted).toEqual([newLead]);
    expect(selected.skippedCount).toBe(2);
  });
});
