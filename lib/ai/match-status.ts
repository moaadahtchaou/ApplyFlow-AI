export const MATCH_READY_THRESHOLD = (() => {
  const configured = Number(process.env.AI_MATCH_READY_THRESHOLD);
  return Number.isFinite(configured) && configured >= 0 && configured <= 10 ? configured : 5;
})();

export const matchStatuses = [
  'not_started',
  'processing',
  'ready',
  'limited',
  'failed',
  'outdated'
] as const;

export type MatchStatus = typeof matchStatuses[number];

export function determineMatchStatus(input: {
  score: number;
  candidateEvidence: boolean;
  companyEvidence: boolean;
}): MatchStatus {
  if (!input.candidateEvidence || !input.companyEvidence) return 'failed';
  return input.score >= MATCH_READY_THRESHOLD ? 'ready' : 'limited';
}
