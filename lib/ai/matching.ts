import {
  candidateCompanyMatchSchema,
  type CandidateCompanyMatch,
  type CandidateProfile,
  type CompanyResearch
} from '@/lib/ai/contracts';
import { PROMPT_VERSIONS } from '@/lib/ai/prompts';
import { evidenceTokens } from '@/lib/ai/evidence';
import { normalizeTechnology } from '@/lib/ai/technologies';

const stopWords = new Set([
  'with', 'from', 'that', 'this', 'your', 'their', 'have', 'will', 'pour', 'avec', 'dans', 'cette',
  'company', 'entreprise', 'project', 'projet', 'application', 'developer', 'développeur',
  'app', 'site', 'software', 'platform', 'first'
]);

function tokens(value: string) {
  return evidenceTokens(value).filter((token) => token.length > 2 && !stopWords.has(token));
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function overlap(left: string, right: string) {
  const rightTokens = new Set(tokens(right));
  return unique(tokens(left).filter((token) => rightTokens.has(token)));
}

function companyEvidence(company: CompanyResearch) {
  return unique([
    ...company.services,
    ...company.products,
    ...company.solutions,
    ...company.relevantProjects,
    ...company.personalizationHooks.map((hook) => hook.fact)
  ]);
}

function companySearchText(company: CompanyResearch, targetRole: string) {
  return [
    company.industry,
    ...companyEvidence(company),
    ...company.technologiesMentioned,
    ...company.customerTypes,
    ...company.relevantDepartments,
    ...company.personalizationHooks.flatMap((hook) => [hook.relevance, hook.sourceExcerpt]),
    targetRole
  ].filter(Boolean).join(' ');
}

type RankableItem = {
  itemName: string;
  itemType: 'project' | 'experience';
  text: string;
  technologies: string[];
  achievements: string[];
  evidence: string[];
};

function rankableItems(candidate: CandidateProfile): RankableItem[] {
  const projects = candidate.projects.map((project) => ({
    itemName: project.name,
    itemType: 'project' as const,
    text: [project.name, project.description, project.role, ...project.features, ...project.achievements].filter(Boolean).join(' '),
    technologies: project.technologies,
    achievements: project.achievements,
    evidence: unique([...project.achievements, project.description, ...project.features]).slice(0, 8)
  }));
  const experiences = candidate.experiences.map((experience, index) => ({
    itemName: [experience.role, experience.company].filter(Boolean).join(' at ') || `Professional experience ${index + 1}`,
    itemType: 'experience' as const,
    text: [
      experience.role,
      experience.company,
      experience.description,
      ...experience.responsibilities,
      ...experience.achievements
    ].filter(Boolean).join(' '),
    technologies: experience.technologies,
    achievements: experience.achievements,
    evidence: unique([...experience.achievements, experience.description, ...experience.responsibilities]).slice(0, 8)
  }));
  return [...projects, ...experiences];
}

const signals = {
  web: /\b(web|website|frontend|backend|full.?stack|react|next|node|cms)\b/i,
  delivery: /\b(client|customer|freelance|agency|delivered|delivery|consulting)\b/i,
  ecommerce: /\b(e.?commerce|shopify|storefront|checkout|payment|liquid)\b/i,
  systems: /\b(api|database|postgres|mongodb|authentication|auth|oauth|jwt|integration)\b/i
};

function signalScore(itemText: string, companyText: string, reasons: string[]) {
  let score = 0;
  for (const [label, pattern] of Object.entries(signals)) {
    if (pattern.test(itemText) && pattern.test(companyText)) {
      score += label === 'systems' ? 0.9 : 0.7;
      reasons.push(`${label === 'systems' ? 'API, database, or authentication' : label} relevance`);
    }
  }
  return score;
}

export function rankCandidateEvidence(
  candidate: CandidateProfile,
  company: CompanyResearch,
  targetRole: string
) {
  const companyText = companySearchText(company, targetRole);
  const verifiedCompanyEvidence = companyEvidence(company);
  const companyTechnologies = company.technologiesMentioned.map(normalizeTechnology);
  return rankableItems(candidate).map((item) => {
    const reasons: string[] = [];
    const itemText = `${item.itemName} ${item.text} ${item.technologies.join(' ')}`;
    const technologies = unique(item.technologies.map(normalizeTechnology).filter((technology) =>
      companyTechnologies.some((companyTechnology) =>
        companyTechnology.toLocaleLowerCase() === technology.toLocaleLowerCase()
      ) || companyText.toLocaleLowerCase().includes(technology.toLocaleLowerCase())
    ));
    const roleTerms = overlap(itemText, targetRole);
    const domainTerms = overlap(itemText, verifiedCompanyEvidence.join(' '));
    const selectedCompanyEvidence = verifiedCompanyEvidence
      .map((evidence) => ({ evidence, score: overlap(itemText, evidence).length }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map((entry) => entry.evidence);
    let score = 0;
    if (technologies.length) {
      score += Math.min(3, technologies.length * 1.1);
      reasons.push(`${technologies.length} verified technology match${technologies.length === 1 ? '' : 'es'}`);
    }
    if (roleTerms.length) {
      score += Math.min(1.5, roleTerms.length * 0.6);
      reasons.push(`target-role relevance: ${roleTerms.slice(0, 4).join(', ')}`);
    }
    if (domainTerms.length) {
      score += Math.min(2, domainTerms.length * 0.4);
      reasons.push(`company service/domain relevance: ${domainTerms.slice(0, 5).join(', ')}`);
    }
    score += signalScore(itemText, companyText, reasons);
    const evidenceQuality = Math.min(1.4,
      (item.evidence.some((entry) => entry.length > 40) ? 0.5 : 0) +
      (item.achievements.length ? 0.6 : 0) +
      (item.technologies.length ? 0.3 : 0)
    );
    score += evidenceQuality;
    if (evidenceQuality >= 0.8) reasons.push('concrete responsibilities or supported achievements');
    score = Math.min(10, Math.round(score * 10) / 10);
    const matchedTerms = unique([...technologies, ...roleTerms, ...domainTerms]).slice(0, 20);
    return {
      itemName: item.itemName,
      itemType: item.itemType,
      projectName: item.itemType === 'project' ? item.itemName : undefined,
      score,
      explanation: reasons.length
        ? `Score ${score}/10: ${reasons.join('; ')}.`
        : `Score ${score}/10: the saved evidence has no meaningful company or target-role connection.`,
      reasons,
      matchedTerms,
      selectedCandidateEvidence: item.evidence.slice(0, 4),
      selectedCompanyEvidence
    };
  }).sort((left, right) => right.score - left.score);
}

export function rankCandidateProjects(candidate: CandidateProfile, company: CompanyResearch, targetRole: string) {
  return rankCandidateEvidence(candidate, company, targetRole).filter((item) => item.itemType === 'project');
}

function hookSpecificity(hook: CompanyResearch['personalizationHooks'][number], company: CompanyResearch, candidateText: string) {
  const serviceText = [...company.services, ...company.products, ...company.solutions].join(' ');
  const hookText = `${hook.fact} ${hook.relevance}`;
  const serviceOverlap = overlap(hookText, serviceText).length;
  const candidateOverlap = overlap(hookText, candidateText).length;
  const broadPenalty = /\b(offshore|leading|innovative|global|international|positioning)\b/i.test(hook.fact) ? 1 : 0;
  return serviceOverlap * 2 + candidateOverlap - broadPenalty;
}

export function createCandidateCompanyMatch(input: {
  candidate: CandidateProfile;
  company: CompanyResearch;
  targetRole: string;
  contact?: { name?: string; title?: string };
  jobOfferText?: string;
  additionalInstructions?: string;
}): CandidateCompanyMatch {
  const { candidate, company, targetRole } = input;
  const itemRanking = rankCandidateEvidence(candidate, company, targetRole);
  const selected = itemRanking[0]?.score > 0 ? itemRanking[0] : undefined;
  const selectedItem = selected
    ? rankableItems(candidate).find((item) => item.itemName === selected.itemName && item.itemType === selected.itemType)
    : undefined;
  const candidateText = selectedItem?.text ?? candidate.technicalSkills.join(' ');
  const hook = [...company.personalizationHooks]
    .sort((left, right) => hookSpecificity(right, company, candidateText) - hookSpecificity(left, company, candidateText))[0];
  const candidateEvidence = selected?.selectedCandidateEvidence[0] ||
    candidate.bestFitBullets[0] ||
    candidate.evidenceSummary[0] ||
    '';
  const technologyOverlap = selected?.matchedTerms.filter((term) =>
    itemRanking.some((item) => item.matchedTerms.includes(term))
  ).slice(0, 10) ?? [];
  const missingInformation: string[] = [];
  if (!hook) missingInformation.push('Company research has no verified personalization hook.');
  if (!candidateEvidence) missingInformation.push('The candidate profile has no concrete project or experience evidence.');
  if (!input.jobOfferText) missingInformation.push('No job offer was supplied; this must remain a spontaneous application.');
  const matchPoints = hook && candidateEvidence ? [{
    companyContext: hook.fact,
    candidateEvidence,
    connection: `${selected?.itemName ?? 'The strongest candidate evidence'} is the highest-ranked saved evidence for this verified company context.`,
    sourceUrl: hook.sourceUrl
  }] : [];
  const matchScore = Math.max(0, Math.min(10, Math.round((
    (selected?.score ?? 0) * 0.7 + (hook ? 1.5 : 0) + (candidateEvidence ? 0.8 : 0)
  ) * 10) / 10));

  return candidateCompanyMatchSchema.parse({
    recommendedTargetRole: targetRole || candidate.targetRoles[0] || 'Relevant software role',
    companyNeedOrOpportunity: hook
      ? `Potential contribution area inferred from this verified company fact: ${hook.fact}`
      : 'No company opportunity can be stated reliably from the available research.',
    strongestCandidateEvidence: candidateEvidence || 'No sufficiently concrete candidate evidence available.',
    relevantProject: selected?.itemType === 'project' ? selected.itemName : undefined,
    selectedCandidateItem: selected?.itemName,
    selectedCandidateItemType: selected?.itemType,
    projectRanking: itemRanking.filter((item) => item.itemType === 'project'),
    itemRanking,
    technologyOverlap,
    matchPoints,
    strongestAngle: matchPoints[0]?.connection ??
      'Evidence is too limited for a strong personalized angle; collect more company or candidate detail first.',
    secondaryAngle: input.additionalInstructions?.trim() || undefined,
    risks: [
      ...(hook ? [] : ['Company-specific wording would be weak without a verified hook.']),
      ...(candidateEvidence ? [] : ['Candidate claims would be generic without concrete saved evidence.']),
      ...(input.jobOfferText ? [] : ['Do not imply that the company has an open vacancy.'])
    ],
    missingInformation,
    matchScore
  });
}

export const MATCH_PROMPT_VERSION = PROMPT_VERSIONS.matching;
