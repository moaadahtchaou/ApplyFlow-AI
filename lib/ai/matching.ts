import {
  candidateCompanyMatchSchema,
  type CandidateCompanyMatch,
  type CandidateProfile,
  type CompanyResearch
} from '@/lib/ai/contracts';
import { PROMPT_VERSIONS } from '@/lib/ai/prompts';
import { evidenceTokens } from '@/lib/ai/evidence';

const stopWords = new Set([
  'with', 'from', 'that', 'this', 'your', 'their', 'have', 'will', 'pour', 'avec', 'dans', 'cette',
  'company', 'entreprise', 'project', 'projet', 'application', 'developer', 'développeur',
  'app', 'site', 'software', 'platform'
]);

function tokens(value: string) {
  return evidenceTokens(value).filter((token) => !stopWords.has(token));
}

function overlap(left: string, right: string) {
  const rightTokens = new Set(tokens(right));
  return tokens(left).filter((token) => rightTokens.has(token));
}

function companySearchText(company: CompanyResearch, targetRole: string) {
  return [
    company.industry,
    ...company.services,
    ...company.products,
    ...company.solutions,
    ...company.technologiesMentioned,
    ...company.relevantProjects,
    ...company.customerTypes,
    ...company.relevantDepartments,
    ...company.personalizationHooks.flatMap((hook) => [hook.fact, hook.relevance, hook.sourceExcerpt]),
    targetRole
  ].filter(Boolean).join(' ');
}

export function rankCandidateProjects(
  candidate: CandidateProfile,
  company: CompanyResearch,
  targetRole: string
) {
  const companyText = companySearchText(company, targetRole);
  return candidate.projects.map((project) => {
    const projectText = [
      project.name,
      project.description,
      project.role,
      ...project.technologies,
      ...project.features,
      ...project.achievements
    ].filter(Boolean).join(' ');
    const matchedTerms = overlap(projectText, companyText);
    const technologyOverlap = project.technologies.filter((technology) =>
      companyText.toLowerCase().includes(technology.toLowerCase()) ||
      overlap(technology, companyText).length > 0
    );
    const roleOverlap = overlap(projectText, targetRole);
    const companyTokens = new Set(tokens(companyText));
    const projectTokens = tokens(projectText);
    const coverage = projectTokens.length
      ? projectTokens.filter((token) => companyTokens.has(token)).length / Math.min(projectTokens.length, 18)
      : 0;
    const evidenceDepth = Math.min(1.5,
      (project.description ? 0.4 : 0) +
      (project.features.length ? 0.35 : 0) +
      (project.achievements.length ? 0.5 : 0) +
      (project.technologies.length ? 0.25 : 0)
    );
    const rawScore = Math.min(10,
      coverage * 5 +
      Math.min(3, technologyOverlap.length * 1.25) +
      Math.min(1.5, roleOverlap.length * 0.75) +
      evidenceDepth
    );
    const score = Math.round(rawScore * 10) / 10;
    return {
      projectName: project.name,
      score,
      explanation: matchedTerms.length
        ? `Score ${score}/10: ${technologyOverlap.length} technology match(es), ${roleOverlap.length} role match(es), ` +
          `${Math.round(coverage * 100)}% evidence-token coverage. Shared evidence: ${matchedTerms.slice(0, 8).join(', ')}.`
        : `Score ${score}/10: no company-specific term overlap; ${evidenceDepth.toFixed(1)} points come only from project evidence quality, so it should not be forced into the message.`,
      matchedTerms: [...new Set([...technologyOverlap, ...matchedTerms])].slice(0, 20)
    };
  }).sort((left, right) => right.score - left.score);
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
  const projectRanking = rankCandidateProjects(candidate, company, targetRole);
  const selectedRanking = projectRanking[0]?.score >= 3.5 ? projectRanking[0] : undefined;
  const project = selectedRanking
    ? candidate.projects.find((item) => item.name === selectedRanking.projectName)
    : undefined;
  const experience = candidate.experiences.find((item) => item.achievements.length || item.description);
  const hook = [...company.personalizationHooks].sort((left, right) => {
    const leftScore = overlap(`${left.fact} ${left.relevance}`, project
      ? `${project.name} ${project.description} ${project.technologies.join(' ')}`
      : candidate.technicalSkills.join(' ')).length;
    const rightScore = overlap(`${right.fact} ${right.relevance}`, project
      ? `${project.name} ${project.description} ${project.technologies.join(' ')}`
      : candidate.technicalSkills.join(' ')).length;
    return rightScore - leftScore;
  })[0];
  const candidateEvidence =
    project?.achievements[0] ||
    project?.description ||
    experience?.achievements[0] ||
    experience?.description ||
    candidate.bestFitBullets[0] ||
    candidate.evidenceSummary[0] ||
    '';
  const candidateTech = new Map(candidate.technicalSkills.map((skill) => [skill.toLowerCase(), skill]));
  const companyTech = company.technologiesMentioned.map((technology) => technology.toLowerCase());
  const technologyOverlap = [...candidateTech.entries()]
    .filter(([key]) => companyTech.some((technology) => technology.includes(key) || key.includes(technology)))
    .map(([, value]) => value)
    .slice(0, 10);
  const missingInformation: string[] = [];
  if (!hook) missingInformation.push('Company research has no verified personalization hook.');
  if (!candidateEvidence) missingInformation.push('The candidate profile has no concrete project or experience evidence.');
  if (!selectedRanking && candidate.projects.length) missingInformation.push('No candidate project has a strong enough evidence-based match.');
  if (!input.jobOfferText) missingInformation.push('No job offer was supplied; this must remain a spontaneous application.');
  const matchPoints = hook && candidateEvidence ? [{
    companyContext: hook.fact,
    candidateEvidence,
    connection: project
      ? `${project.name} is the strongest available project for discussing a possible contribution related to this verified company context.`
      : 'This candidate experience is the strongest available evidence for discussing a possible contribution.',
    sourceUrl: hook.sourceUrl
  }] : [];
  const baseScore = (selectedRanking?.score ?? 0) * 0.6 + (hook ? 2 : 0) + (candidateEvidence ? 1.5 : 0);
  const matchScore = Math.max(0, Math.min(10, Math.round(baseScore * 10) / 10));
  const companyNeedOrOpportunity = hook
    ? `Potential contribution area inferred from this verified company fact: ${hook.fact}`
    : 'No company opportunity can be stated reliably from the available research.';
  const strongestAngle = matchPoints[0]?.connection ??
    'Evidence is too limited for a strong personalized angle; collect more company or candidate detail first.';

  return candidateCompanyMatchSchema.parse({
    recommendedTargetRole: targetRole || candidate.targetRoles[0] || 'Relevant software role',
    companyNeedOrOpportunity,
    strongestCandidateEvidence: candidateEvidence || 'No sufficiently concrete candidate evidence available.',
    relevantProject: project?.name,
    projectRanking,
    technologyOverlap,
    matchPoints,
    strongestAngle,
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
