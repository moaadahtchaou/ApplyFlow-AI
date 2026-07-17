import {
  messageQualityEvaluationSchema,
  type CandidateProfile,
  type CompanyResearch,
  type GeneratedApplicationMessage,
  type MessageQualityEvaluation
} from '@/lib/ai/contracts';
import { isEvidenceSupported } from '@/lib/ai/evidence';

const genericPatterns = [
  /prestigious company/gi,
  /entreprise prestigieuse/gi,
  /dynamic company/gi,
  /entreprise dynamique/gi,
  /passionn[ée] par l['’]informatique/gi,
  /je me permets de vous contacter/gi,
  /certain d['’][êe]tre un atout/gi,
  /i am certain (?:i would|to) be an asset/gi,
  /i am passionate about (?:technology|computers|it)/gi
];

function evidenceOverlap(claim: string, source: string) {
  return isEvidenceSupported(claim, source, 0.25);
}

export function evaluateMessageQuality(input: {
  message: GeneratedApplicationMessage;
  candidate: CandidateProfile;
  company: CompanyResearch;
  hasJobOffer: boolean;
}): MessageQualityEvaluation {
  const { message, candidate, company, hasJobOffer } = input;
  const body = message.body;
  const companySource = company.personalizationHooks.find((hook) =>
    (!message.companyFactSourceUrl || hook.sourceUrl === message.companyFactSourceUrl) &&
    evidenceOverlap(message.companyFactUsed, `${hook.fact} ${hook.sourceExcerpt ?? ''}`)
  );
  const candidateSource = JSON.stringify(candidate);
  const usesVerifiedCompanyFact = Boolean(companySource && evidenceOverlap(message.companyFactUsed, body));
  const usesCandidateEvidence = evidenceOverlap(message.candidateEvidenceUsed, candidateSource) &&
    evidenceOverlap(message.candidateEvidenceUsed, body);
  const companySpecific = body.toLowerCase().includes(company.companyName.toLowerCase()) &&
    usesVerifiedCompanyFact;
  const relationshipIsClear = /\b(connect|align|relevant|contribute|apply|apport|contribu|lien|correspond|يخدم|مساهمة)\b/i.test(body);
  const vacancyMention = /\b(open position|job opening|vacancy|your advertised role|poste (?:ouvert|disponible)|offre d['’]emploi)\b/i.test(body);
  const explicitlyDeniesVacancy = /\b(without (?:assuming|implying)|not assuming|no (?:known )?(?:open )?(?:position|vacancy)|sans (?:supposer|présumer)|spontaneous application)\b/i.test(body);
  const impliesVacancy = !hasJobOffer && vacancyMention && !explicitlyDeniesVacancy;
  const hasInventedFacts = !usesVerifiedCompanyFact || !usesCandidateEvidence || impliesVacancy;
  const genericPhraseCount = genericPatterns.reduce((total, pattern) => total + (body.match(pattern)?.length ?? 0), 0);
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const technologyCount = [...new Set(
    candidate.technicalSkills.filter((skill) => body.toLowerCase().includes(skill.toLowerCase()))
  )].length;
  const treatsSpontaneousApplicationCorrectly = hasJobOffer ||
    /\b(spontaneous|unsolicited|candidature spontan[ée]e|proactively|initiative|طلب ترشيح تلقائي)\b/i.test(body);

  const problems: string[] = [];
  if (!companySpecific) problems.push('The body is not anchored strongly enough to this company.');
  if (!usesVerifiedCompanyFact) problems.push('The verified company fact is missing or unsupported.');
  if (!usesCandidateEvidence) problems.push('The message does not use concrete saved candidate evidence.');
  if (!relationshipIsClear) problems.push('The company-candidate relationship is unclear.');
  if (impliesVacancy) problems.push('The message implies a vacancy even though no job offer was supplied.');
  if (genericPhraseCount) problems.push(`${genericPhraseCount} generic phrase(s) should be removed.`);
  if (technologyCount > 3) problems.push('More than three technologies are listed without a specific reason.');
  if (wordCount > 190) problems.push('The introduction or message is too long.');
  if (wordCount < 75) problems.push('The message is too short to establish a credible connection.');

  const personalizationScore = Math.max(0, Math.min(10, (companySpecific ? 5 : 1) + (relationshipIsClear ? 3 : 0) + (genericPhraseCount ? 0 : 2)));
  const evidenceScore = Math.max(0, Math.min(10, (usesVerifiedCompanyFact ? 4 : 0) + (usesCandidateEvidence ? 4 : 0) + (hasInventedFacts ? 0 : 2)));
  const naturalnessScore = Math.max(0, Math.min(10, 9 - genericPhraseCount * 2 - (wordCount > 190 ? 2 : 0) - (technologyCount > 3 ? 2 : 0)));
  const clarityScore = Math.max(0, Math.min(10, 6 + (relationshipIsClear ? 2 : 0) + (wordCount >= 75 && wordCount <= 190 ? 2 : 0)));
  const overallScore = Math.round(
    (personalizationScore * 0.3 + evidenceScore * 0.35 + naturalnessScore * 0.2 + clarityScore * 0.15) * 10
  ) / 10;

  return messageQualityEvaluationSchema.parse({
    companySpecific,
    usesVerifiedCompanyFact,
    usesCandidateEvidence,
    relationshipIsClear,
    hasInventedFacts,
    treatsSpontaneousApplicationCorrectly,
    genericPhraseCount,
    personalizationScore,
    evidenceScore,
    naturalnessScore,
    clarityScore,
    overallScore,
    problems,
    improvementInstructions: problems.map((problem) => {
      if (problem.includes('company fact')) return 'Use the supplied verified company hook and no other company claim.';
      if (problem.includes('candidate evidence')) return 'Use the selected project or experience as one concrete candidate proof point.';
      if (problem.includes('vacancy')) return 'State that this is a spontaneous application and remove vacancy wording.';
      if (problem.includes('relationship')) return 'Add one sentence explaining how the candidate evidence relates to the verified company fact.';
      if (problem.includes('technologies')) return 'Keep only the three technologies most relevant to the selected evidence.';
      return `Fix: ${problem}`;
    })
  });
}

export function needsAutomaticRewrite(evaluation: MessageQualityEvaluation) {
  return evaluation.overallScore < 7 ||
    !evaluation.companySpecific ||
    !evaluation.usesCandidateEvidence ||
    evaluation.hasInventedFacts;
}
