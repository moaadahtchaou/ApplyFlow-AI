import { createHash } from 'node:crypto';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BAD_EMAIL_SUFFIXES = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.css', '.js'];

export function cleanMapsText(value?: string | null) {
  return (value ?? '')
    .replace(/[\u200B-\u200D\uFEFF\uE000-\uF8FF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(candidate).toString();
  } catch {
    return undefined;
  }
}

export function normalizeHostname(value?: string | null) {
  const normalized = normalizeUrl(value);
  if (!normalized) return '';
  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function normalizeForMatch(value?: string | null) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function cityFromSearchArea(value?: string | null) {
  const city = (value ?? '').split(',')[0]?.trim();
  return city || undefined;
}

export function buildLeadFingerprint(input: {
  website?: string | null;
  name: string;
  address?: string | null;
}) {
  const hostname = normalizeHostname(input.website);
  const basis = hostname
    ? `domain:${hostname}`
    : `place:${normalizeForMatch(input.name)}|${normalizeForMatch(input.address)}`;
  return createHash('sha256').update(basis).digest('hex');
}

export function coordinatesFromMapsUrl(url: string) {
  const atMatch = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const dataMatch = url.match(/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)/);
  const match = atMatch ?? dataMatch;
  if (!match) return {};
  return {
    latitude: Number(match[1]),
    longitude: Number(match[2])
  };
}

export function parseRating(value?: string | null) {
  const match = value?.replace(',', '.').match(/\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const rating = Number(match[0]);
  return Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : undefined;
}

export function parseReviewCount(value?: string | null) {
  const match = value?.match(/(\d[\d\s,.]*)\s+reviews?/i);
  if (!match) return undefined;
  const count = Number(match[1].replace(/[^\d]/g, ''));
  return Number.isFinite(count) ? count : undefined;
}

export function extractEmailsFromText(text: string) {
  const emails = new Set(
    (text.match(EMAIL_RE) ?? [])
      .map((email) => email.replace(/[.,;:()[\]{}<>]+$/g, '').toLowerCase())
      .filter((email) => !BAD_EMAIL_SUFFIXES.some((suffix) => email.endsWith(suffix)))
  );
  return [...emails].sort();
}

export function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim()) || rows.length === 0) rows.push(row);
  return rows;
}

export function isAbortError(error: unknown) {
  return error instanceof Error && (
    error.name === 'AbortError'
    || /aborted|target page.*closed|browser has been closed/i.test(error.message)
  );
}
