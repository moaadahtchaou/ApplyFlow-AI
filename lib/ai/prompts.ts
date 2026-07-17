import type {
  CandidateCompanyMatch,
  CandidateProfile,
  CompanyResearch,
  MessageQualityEvaluation,
  MessageRequest
} from '@/lib/ai/contracts';
import { COMPANY_RESEARCH_JSON_CONTRACT } from '@/lib/ai/contracts';

export const PROMPT_VERSIONS = {
  cvStructure: 'cv-structure-v2.2.0',
  companyResearch: 'company-research-v2.2.0',
  matching: 'candidate-company-match-v2.1.0',
  messageGeneration: 'application-message-v2.1.0',
  messageRewrite: 'application-message-rewrite-v2.1.0',
  qualityEvaluation: 'message-quality-deterministic-v2.0.0',
  jsonRepair: 'json-repair-v1.0.0'
} as const;

export const JSON_ONLY_SYSTEM_PROMPT =
  'You extract and transform supplied evidence. Return valid JSON only. Never invent facts, never convert an inference into a fact, and use empty arrays or missingInformation when evidence is absent.';

export function buildCvStructurePrompt(cvText: string) {
  return `Prompt version: ${PROMPT_VERSIONS.cvStructure}

Build a structured candidate profile from the CV text below.

Rules:
- Use only facts present in the CV.
- Extract fullName, email, phone, and current location when explicitly present.
- Skills and technicalSkills are professional capabilities only. Never classify hobbies, interests, games, history, entertainment, or leisure reading as skills.
- Capture every explicitly named language, framework, database, API, authentication, commerce, DevOps, and AI technology.
- Preserve concrete projects, responsibilities, achievements, technologies, employers, education, dates, and links exactly enough to remain verifiable.
- Do not infer years of experience, seniority, language level, technology, employer, achievement, degree, or date.
- Put uncertain or absent useful details in missingInformation.
- evidenceSummary and bestFitBullets must be concrete CV-backed facts, not generic adjectives.
- Return every array in the schema, using [] when empty.

Required JSON shape:
{
  "fullName"?: string,
  "email"?: string,
  "phone"?: string,
  "location"?: string,
  "headline"?: string,
  "professionalSummary"?: string,
  "targetRoles": string[],
  "skills": string[],
  "technicalSkills": string[],
  "softSkills": string[],
  "experiences": [{"role"?:string,"company"?:string,"location"?:string,"startDate"?:string,"endDate"?:string,"description":string,"responsibilities":string[],"achievements":string[],"technologies":string[]}],
  "projects": [{"name":string,"description":string,"role"?:string,"technologies":string[],"features":string[],"achievements":string[],"url"?:string,"repositoryUrl"?:string}],
  "education": [{"institution"?:string,"degree"?:string,"field"?:string,"startDate"?:string,"endDate"?:string,"description"?:string}],
  "certifications": string[],
  "languages": [{"language":string,"level"?:string}],
  "preferredLocations": string[],
  "portfolioUrl"?: string,
  "githubUrl"?: string,
  "linkedinUrl"?: string,
  "strengths": string[],
  "bestFitBullets": string[],
  "evidenceSummary": string[],
  "missingInformation": string[]
}

CV text:
${cvText.slice(0, 28_000)}`;
}

export function buildCompanyResearchPrompt(
  company: { name: string; website: string; industry?: string | null },
  pages: Array<{ url: string; title?: string; text: string }>
) {
  const evidence = pages.map((page, index) =>
    `SOURCE ${index + 1}\nURL: ${page.url}\nTITLE: ${page.title ?? ''}\nCONTENT:\n${page.text}`
  ).join('\n\n');
  return `Prompt version: ${PROMPT_VERSIONS.companyResearch}

Structure company research from the fetched website evidence.

Known saved data:
Company name: ${company.name}
Website: ${company.website}
Saved industry: ${company.industry ?? 'not provided'}

Rules:
- Company facts may only come from the source blocks or known saved data.
- Do not invent services, products, technologies, projects, locations, values, or vacancies.
- hiringSignals may only contain a confirmed careers/jobs statement; never convert a careers page link into a current vacancy.
- personalizationHooks.fact must be a confirmed fact and sourceUrl must point to the supporting source.
- Copy a short supporting website passage into personalizationHooks.sourceExcerpt. It must come from that source block.
- personalizationHooks.relevance may be an inference, worded as relevance rather than a confirmed company fact.
- relevantProjects must be an array of concise strings. Never return project objects.
- personalizationHooks must always be an array, even when there is only one hook.
- Include every successfully fetched page in sources as an object containing url and optional title.
- Return missingInformation for absent details.
- Do not invent analyzedAt or source extractedAt timestamps; the server adds verified timestamps.
- Return [] for every list with no supported values.

Return exactly this JSON structure:
${COMPANY_RESEARCH_JSON_CONTRACT}

Fetched evidence:
${evidence.slice(0, 52_000)}`;
}

export function buildMessagePrompt(context: {
  candidate: CandidateProfile;
  company: CompanyResearch;
  match: CandidateCompanyMatch;
  contact?: { name?: string; title?: string };
  request: MessageRequest;
}) {
  const { candidate, company, match, contact, request } = context;
  const project = candidate.projects.find((item) => item.name === match.relevantProject);
  const compactCandidate = {
    fullName: candidate.fullName,
    headline: candidate.headline,
    targetRoles: candidate.targetRoles,
    strongestEvidence: match.strongestCandidateEvidence,
    selectedProject: project,
    technologyOverlap: match.technologyOverlap.slice(0, 3),
    evidenceSummary: candidate.evidenceSummary.slice(0, 8)
  };
  const compactCompany = {
    companyName: company.companyName,
    website: company.website,
    summary: company.summary,
    verifiedHook: company.personalizationHooks.find((hook) =>
      match.matchPoints.some((point) => point.sourceUrl === hook.sourceUrl)
    ) ?? company.personalizationHooks[0],
    sources: company.sources.map((source) => ({
      url: source.url,
      title: source.title,
      excerpt: source.excerpt
    }))
  };

  return `Prompt version: ${PROMPT_VERSIONS.messageGeneration}

Create one natural application message from the evidence below.

Rules:
- Language: ${request.language}. Tone: ${request.tone}. Type: ${request.messageType}.
- Use exactly one specific verified company fact, its source URL, and its supplied source excerpt.
- Use one strong candidate project or experience and explain its connection to the company.
- Mention no more than three technologies.
- Do not invent a vacancy, company fact, candidate fact, measurement, date, or contact relationship.
- ${request.jobOfferText ? 'A job offer was supplied; refer only to its actual text.' : 'No job offer was supplied. Treat this explicitly as a spontaneous application without implying an open role.'}
- Default email length is 110–170 words unless desiredLength says otherwise.
- Avoid generic flattery, filler, large skill lists, copied CV summaries, and exaggerated certainty.
- Use a neutral greeting unless the contact name is reliable.
- End with one simple call to action.
- Return JSON only with: subject, body, companyFactUsed, companyFactSourceUrl, candidateEvidenceUsed, selectedProject, matchingAngle.

Candidate evidence:
${JSON.stringify(compactCandidate)}

Company evidence:
${JSON.stringify(compactCompany)}

Verified match:
${JSON.stringify(match)}

Contact:
${JSON.stringify(contact ?? {})}

Request:
${JSON.stringify({
    desiredLength: request.desiredLength,
    targetRole: request.targetRole,
    jobOfferText: request.jobOfferText,
    additionalInstructions: request.additionalInstructions,
    signature: request.signature
  })}

${request.existingMessage ? `Existing user-edited message to improve without adding new facts:\n${JSON.stringify(request.existingMessage)}` : ''}`;
}

export function buildRewritePrompt(input: {
  original: { subject: string; body: string };
  evaluation: MessageQualityEvaluation;
  generationPrompt: string;
}) {
  return `${input.generationPrompt}

This is a single rewrite pass.
Original message:
${JSON.stringify(input.original)}

Evaluation problems:
${JSON.stringify(input.evaluation.problems)}

Mandatory improvement instructions:
${JSON.stringify(input.evaluation.improvementInstructions)}

Fix the listed problems while preserving verified evidence. Return the same generation JSON shape only.`;
}
