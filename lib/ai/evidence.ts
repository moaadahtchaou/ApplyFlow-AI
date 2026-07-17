const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'using', 'used', 'built',
  'dans', 'avec', 'pour', 'une', 'des', 'les', 'sur', 'par', 'aux', 'leur', 'leurs',
  'company', 'project', 'application', 'experience', 'work', 'team'
]);

const ALIASES: Record<string, string> = {
  'nodejs': 'node',
  'node.js': 'node',
  'nextjs': 'next',
  'next.js': 'next',
  'reactjs': 'react',
  'react.js': 'react',
  'postgres': 'postgresql',
  'restful': 'rest',
  'apis': 'api',
  'applications': 'app',
  'application': 'app',
  'solutions': 'solution',
  'services': 'service',
  'customers': 'customer',
  'clients': 'customer',
  'businesses': 'business',
  'ecommerce': 'commerce',
  'shopify': 'commerce',
  'boutique': 'commerce',
  'store': 'commerce',
  'shops': 'commerce',
  'websites': 'web',
  'website': 'web',
  'seo': 'search',
  'hiring': 'recruiting',
  'recruitment': 'recruiting',
  'automated': 'automation',
  'automating': 'automation',
  'photos': 'image',
  'images': 'image'
};

function fold(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stem(token: string) {
  const aliased = ALIASES[token] ?? token;
  if (aliased.length > 6 && /(?:ing|ers|ies|ed|es|s)$/.test(aliased)) {
    return aliased.replace(/(?:ing|ers|ies|ed|es|s)$/, '');
  }
  return aliased;
}

export function evidenceTokens(value: string) {
  return [...new Set(
    (fold(value).match(/[\p{L}\p{N}+#.]{3,}/gu) ?? [])
      .map(stem)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
  )];
}

export function evidenceScore(claim: string, source: string) {
  const claimTokens = evidenceTokens(claim);
  if (!claimTokens.length) return 0;
  const sourceTokens = new Set(evidenceTokens(source));
  const matched = claimTokens.filter((token) => sourceTokens.has(token)).length;
  const coverage = matched / claimTokens.length;
  const exactBonus = fold(source).includes(fold(claim)) || fold(claim).includes(fold(source)) ? 0.35 : 0;
  return Math.min(1, coverage + exactBonus);
}

export function isEvidenceSupported(claim: string, source: string, threshold = 0.3) {
  const tokens = evidenceTokens(claim);
  if (!tokens.length) return false;
  const minimumMatches = tokens.length <= 3 ? 1 : 2;
  const sourceTokens = new Set(evidenceTokens(source));
  const matched = tokens.filter((token) => sourceTokens.has(token)).length;
  return matched >= minimumMatches && evidenceScore(claim, source) >= threshold;
}

export function bestEvidenceExcerpt(claim: string, source: string, maxLength = 500) {
  const candidates = source
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 20);
  const best = candidates
    .map((excerpt) => ({ excerpt, score: evidenceScore(claim, excerpt) }))
    .sort((left, right) => right.score - left.score)[0];
  if (!best || best.score < 0.2) return null;
  return {
    excerpt: best.excerpt.length > maxLength ? `${best.excerpt.slice(0, maxLength - 1).trim()}…` : best.excerpt,
    score: best.score
  };
}
