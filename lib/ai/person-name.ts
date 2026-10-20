const SECTION_HEADINGS = new Set([
  'formation',
  'education',
  'profile',
  'profil',
  'summary',
  'resume',
  'experience',
  'experiences',
  'skills',
  'competences',
  'projects',
  'projets',
  'languages',
  'langues',
  'contact',
  'curriculum vitae',
  'cv'
]);

const NON_NAME_WORDS = new Set([
  'developer', 'developpeur', 'engineer', 'ingenieur', 'designer', 'consultant', 'manager',
  'frontend', 'backend', 'fullstack', 'software', 'web', 'mobile', 'data', 'react', 'nextjs',
  'nodejs', 'typescript', 'javascript', 'python', 'docker', 'shopify', 'postgresql', 'mongodb'
]);

export function normalizeHeading(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[.:|/\\_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCvSectionHeading(value: string) {
  return SECTION_HEADINGS.has(normalizeHeading(value));
}

export function isValidPersonName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const name = value.replace(/\s+/g, ' ').trim();
  if (!name || name.length < 2 || name.length > 100) return false;
  if (isCvSectionHeading(name)) return false;
  if (/@|https?:\/\/|www\.|linkedin\.com|github\.com/i.test(name)) return false;
  if (/(?:\+?\d[\d\s().-]{5,}\d)/.test(name)) return false;
  if (/[,;|]/.test(name)) return false;
  const words = name.split(/\s+/);
  if (words.length > 6) return false;
  const normalizedWords = words.map(normalizeHeading).map((word) => word.replace(/[.\s-]/g, ''));
  if (normalizedWords.some((word) => NON_NAME_WORDS.has(word))) return false;
  return words.every((word) =>
    /^(?:\p{L}[\p{L}\p{M}'’.-]*|\p{L}\.)$/u.test(word) &&
    (word.replace(/[.'’-]/g, '').length >= 1)
  );
}

export function selectLikelyFullName(lines: string[]) {
  const candidates = lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(isValidPersonName);
  return candidates.find((name) => name.split(/\s+/).length >= 2) ?? candidates[0];
}
