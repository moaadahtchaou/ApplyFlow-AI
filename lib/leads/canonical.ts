export type CanonicalLeadInput = {
  name: string;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  sourceUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  fingerprint?: string | null;
  search?: {
    area?: string | null;
  } | null;
};

export function normalizeCanonicalText(value?: string | null) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function normalizeCanonicalHostname(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function normalizeCanonicalPhone(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '').replace(/^00/, '');
  return digits.length >= 7 ? digits : '';
}

function cityFromArea(value?: string | null) {
  return normalizeCanonicalText((value ?? '').split(',')[0]);
}

function cityFromAddress(value?: string | null) {
  const parts = (value ?? '')
    .split(',')
    .map((part) => normalizeCanonicalText(part))
    .filter(Boolean);
  return parts.at(-1) ?? '';
}

function roundedCoordinates(input: Pick<CanonicalLeadInput, 'latitude' | 'longitude'>) {
  if (
    input.latitude === null
    || input.latitude === undefined
    || input.longitude === null
    || input.longitude === undefined
  ) {
    return '';
  }
  return `${input.latitude.toFixed(4)},${input.longitude.toFixed(4)}`;
}

export function normalizeMapsIdentity(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  const withoutTracking = trimmed.split('&ved=')[0];
  const cidMatch = withoutTracking.match(/[?&]cid=(\d+)/i);
  if (cidMatch?.[1]) return `cid:${cidMatch[1]}`;
  const placeIdMatch = withoutTracking.match(/!1s([^!&]+)/i);
  if (placeIdMatch?.[1]) return `place:${decodeURIComponent(placeIdMatch[1]).toLowerCase()}`;
  try {
    const url = new URL(withoutTracking);
    url.hash = '';
    url.search = '';
    return `${url.origin}${url.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return withoutTracking.replace(/\/$/, '').toLowerCase();
  }
}

export function canonicalLeadKeys(input: CanonicalLeadInput) {
  const keys: string[] = [];
  const mapsIdentity = normalizeMapsIdentity(input.sourceUrl);
  if (mapsIdentity) keys.push(`maps:${mapsIdentity}`);

  const domain = normalizeCanonicalHostname(input.website);
  if (domain) keys.push(`domain:${domain}`);

  const phone = normalizeCanonicalPhone(input.phone);
  if (phone) {
    keys.push(`phone:${phone}`);
    if (phone.length > 9) keys.push(`phone-tail:${phone.slice(-9)}`);
  }

  const coordinates = roundedCoordinates(input);
  if (coordinates) keys.push(`geo:${coordinates}`);

  if (input.fingerprint) keys.push(`fingerprint:${input.fingerprint}`);

  const name = normalizeCanonicalText(input.name);
  const address = normalizeCanonicalText(input.address);
  const city = cityFromAddress(input.address)
    || normalizeCanonicalText(input.city)
    || cityFromArea(input.search?.area);
  if (name && address) keys.push(`name-address:${name}|${address}`);
  if (name && city) keys.push(`name-city:${name}|${city}`);

  return [...new Set(keys)];
}
