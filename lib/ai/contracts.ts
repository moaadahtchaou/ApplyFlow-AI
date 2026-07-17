import { z } from 'zod';
import { messageLanguages, tones } from '@/lib/constants';

const shortText = z.string().trim().max(500);
const mediumText = z.string().trim().max(4000);
const stringList = (limit = 30) => z.array(z.string().trim().min(1).max(500)).max(limit).default([]);

export const aiExecutionMetadataSchema = z.object({
  provider: z.enum(['nvidia', 'mock']),
  model: z.string().trim().min(1).optional(),
  fallbackUsed: z.boolean(),
  generatedAt: z.string().datetime(),
  latencyMs: z.number().int().nonnegative().optional(),
  requestId: z.string().trim().min(1).max(200).optional()
});

export type AIExecutionMetadata = z.infer<typeof aiExecutionMetadataSchema>;

export const cvExtractionResultSchema = z.object({
  text: z.string().trim().min(20).max(30_000),
  wordCount: z.number().int().nonnegative(),
  qualityScore: z.number().min(0).max(10),
  warnings: stringList(15),
  detectedSections: stringList(20),
  fileName: z.string().trim().max(255).optional(),
  fileKind: z.enum(['pdf', 'docx', 'text', 'manual']),
  kind: z.enum(['pdf', 'docx', 'text']).optional(),
  extractedAt: z.string().datetime()
});

export type CVExtractionResult = z.infer<typeof cvExtractionResultSchema>;

export const candidateExperienceSchema = z.object({
  role: shortText.optional(),
  company: shortText.optional(),
  location: shortText.optional(),
  startDate: shortText.optional(),
  endDate: shortText.optional(),
  description: mediumText.default(''),
  responsibilities: stringList(20),
  achievements: stringList(20),
  technologies: stringList(30)
});

export const candidateProjectSchema = z.object({
  name: z.string().trim().min(1).max(300),
  description: mediumText,
  role: shortText.optional(),
  technologies: stringList(30),
  features: stringList(30),
  achievements: stringList(20),
  url: z.string().url().max(1000).optional(),
  repositoryUrl: z.string().url().max(1000).optional()
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function list(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => {
    if (typeof item !== 'string' && typeof item !== 'number') return [];
    return String(item)
      .split(/[\n,;|]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  });
}

function narrativeList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return list(value);
  const values = value;
  return values.flatMap((item) => {
    if (typeof item !== 'string' && typeof item !== 'number') return [];
    return String(item)
      .split(/[\n;|]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  });
}

function optionalUrl(value: unknown) {
  const text = optionalString(value);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function optionalEmail(value: unknown) {
  const text = optionalString(value)?.toLowerCase();
  return text && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : undefined;
}

function normalizeExperience(value: unknown) {
  const item = record(value);
  return {
    role: optionalString(item.role ?? item.title ?? item.position),
    company: optionalString(item.company ?? item.employer ?? item.organization),
    location: optionalString(item.location),
    startDate: optionalString(item.startDate ?? item.start_date ?? item.from),
    endDate: optionalString(item.endDate ?? item.end_date ?? item.to),
    description: optionalString(item.description ?? item.summary) ?? '',
    responsibilities: narrativeList(item.responsibilities ?? item.duties),
    achievements: narrativeList(item.achievements ?? item.accomplishments),
    technologies: list(item.technologies ?? item.techStack ?? item.tech_stack)
  };
}

function normalizeProject(value: unknown) {
  const item = record(value);
  const name = optionalString(item.name ?? item.title ?? item.projectName);
  if (!name) return null;
  return {
    name,
    description: optionalString(item.description ?? item.summary) ?? '',
    role: optionalString(item.role),
    technologies: list(item.technologies ?? item.techStack ?? item.tech_stack),
    features: narrativeList(item.features ?? item.responsibilities),
    achievements: narrativeList(item.achievements ?? item.accomplishments),
    url: optionalUrl(item.url ?? item.projectUrl),
    repositoryUrl: optionalUrl(item.repositoryUrl ?? item.repository_url ?? item.githubUrl)
  };
}

function normalizeEducation(value: unknown) {
  const item = record(value);
  return {
    institution: optionalString(item.institution ?? item.school ?? item.university),
    degree: optionalString(item.degree),
    field: optionalString(item.field ?? item.fieldOfStudy ?? item.major),
    startDate: optionalString(item.startDate ?? item.start_date ?? item.from),
    endDate: optionalString(item.endDate ?? item.end_date ?? item.to),
    description: optionalString(item.description)
  };
}

function normalizeLanguage(value: unknown) {
  if (typeof value === 'string') {
    const [language, ...levelParts] = value.split(/\s*[:\-–—]\s*/);
    return language?.trim()
      ? { language: language.trim(), level: optionalString(levelParts.join(' ')) }
      : null;
  }
  const item = record(value);
  const language = optionalString(item.language ?? item.name);
  return language ? { language, level: optionalString(item.level ?? item.proficiency) } : null;
}

export function normalizeCandidateProfileInput(value: unknown): unknown {
  const input = record(value);
  const experiences = input.experiences ?? input.experience;
  const projects = input.projects ?? input.project;
  const targetRoles = input.targetRoles ?? input.targetRole;
  const bestFitBullets = input.bestFitBullets ?? input.bestFitBullet;
  return {
    fullName: optionalString(input.fullName ?? input.name),
    email: optionalEmail(input.email),
    phone: optionalString(input.phone ?? input.phoneNumber ?? input.telephone),
    location: optionalString(input.location ?? input.currentLocation ?? input.address),
    headline: optionalString(input.headline ?? input.title),
    professionalSummary: optionalString(input.professionalSummary ?? input.summary),
    targetRoles: list(targetRoles),
    skills: list(input.skills ?? input.skill),
    technicalSkills: list(input.technicalSkills ?? input.technicalSkill),
    softSkills: list(input.softSkills ?? input.softSkill),
    experiences: (Array.isArray(experiences) ? experiences : experiences ? [experiences] : [])
      .filter((item) => item && typeof item === 'object')
      .map(normalizeExperience),
    projects: (Array.isArray(projects) ? projects : projects ? [projects] : [])
      .map(normalizeProject)
      .filter((item): item is NonNullable<ReturnType<typeof normalizeProject>> => Boolean(item)),
    education: (Array.isArray(input.education) ? input.education : input.education ? [input.education] : [])
      .filter((item) => item && typeof item === 'object')
      .map(normalizeEducation),
    certifications: list(input.certifications ?? input.certification),
    languages: (Array.isArray(input.languages) ? input.languages : input.languages ? [input.languages] : [])
      .flatMap((item) => typeof item === 'string' && /[,;\n]/.test(item) ? list(item) : [item])
      .map(normalizeLanguage)
      .filter((item): item is NonNullable<ReturnType<typeof normalizeLanguage>> => Boolean(item)),
    preferredLocations: list(input.preferredLocations ?? input.preferredLocation),
    portfolioUrl: optionalUrl(input.portfolioUrl ?? input.portfolio),
    githubUrl: optionalUrl(input.githubUrl ?? input.github),
    linkedinUrl: optionalUrl(input.linkedinUrl ?? input.linkedin),
    strengths: narrativeList(input.strengths ?? input.strength),
    bestFitBullets: narrativeList(bestFitBullets),
    evidenceSummary: narrativeList(input.evidenceSummary ?? input.evidence),
    missingInformation: narrativeList(input.missingInformation ?? input.missingInfo)
  };
}

const candidateProfileObjectSchema = z.object({
  fullName: shortText.optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: shortText.optional(),
  location: shortText.optional(),
  headline: shortText.optional(),
  professionalSummary: mediumText.optional(),
  targetRoles: stringList(20),
  skills: stringList(100),
  technicalSkills: stringList(100),
  softSkills: stringList(50),
  experiences: z.array(candidateExperienceSchema).max(30).default([]),
  projects: z.array(candidateProjectSchema).max(40).default([]),
  education: z.array(z.object({
    institution: shortText.optional(),
    degree: shortText.optional(),
    field: shortText.optional(),
    startDate: shortText.optional(),
    endDate: shortText.optional(),
    description: mediumText.optional()
  })).max(20).default([]),
  certifications: stringList(40),
  languages: z.array(z.object({
    language: z.string().trim().min(1).max(100),
    level: shortText.optional()
  })).max(30).default([]),
  preferredLocations: stringList(30),
  portfolioUrl: z.string().url().max(1000).optional(),
  githubUrl: z.string().url().max(1000).optional(),
  linkedinUrl: z.string().url().max(1000).optional(),
  strengths: stringList(30),
  bestFitBullets: stringList(20),
  evidenceSummary: stringList(30),
  missingInformation: stringList(30)
});

export const candidateProfileSchema = z.preprocess(normalizeCandidateProfileInput, candidateProfileObjectSchema);

export type CandidateProfile = z.infer<typeof candidateProfileSchema>;

function companyTextList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => {
    if (typeof item === 'string' || typeof item === 'number') return narrativeList(item);
    return companyTextList(item);
  });
  if (typeof value === 'string' || typeof value === 'number') return list(value);
  const item = record(value);
  const label = optionalString(item.name ?? item.title ?? item.projectName ?? item.service ?? item.product);
  const description = optionalString(item.description ?? item.summary ?? item.detail ?? item.fact);
  if (label || description) {
    return [[label, description].filter(Boolean).join(' — ').slice(0, 500)];
  }
  return Object.values(item).flatMap(companyTextList);
}

function normalizeConfidence(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(10, value > 0 && value <= 1 ? value * 10 : value));
  }
  const text = optionalString(value);
  if (!text) return 0;
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return 0;
  if (text.includes('%')) return Math.max(0, Math.min(10, number / 10));
  return Math.max(0, Math.min(10, number > 0 && number <= 1 ? number * 10 : number));
}

function optionalDate(value: unknown) {
  const text = optionalString(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function objectCollection(value: unknown, identifyingKeys: string[]) {
  if (Array.isArray(value)) return value;
  const item = record(value);
  if (!Object.keys(item).length) return [];
  if (identifyingKeys.some((key) => key in item)) return [item];
  return Object.values(item).flatMap((nested) => {
    if (Array.isArray(nested)) return nested;
    return nested && typeof nested === 'object' ? [nested] : [];
  });
}

function normalizePersonalizationHook(value: unknown) {
  const item = record(value);
  const fact = optionalString(item.fact ?? item.claim ?? item.text ?? item.description);
  const relevance = optionalString(
    item.relevance ?? item.whyRelevant ?? item.why_relevant ?? item.candidateRelevance ?? item.connection
  );
  if (!fact || !relevance) return null;
  return {
    fact,
    relevance,
    sourceUrl: optionalUrl(item.sourceUrl ?? item.source_url ?? item.url),
    sourceExcerpt: optionalString(item.sourceExcerpt ?? item.source_excerpt ?? item.evidenceExcerpt)
  };
}

function normalizeSource(value: unknown) {
  if (typeof value === 'string') {
    const url = optionalUrl(value);
    return url ? { url } : null;
  }
  const item = record(value);
  const url = optionalUrl(item.url ?? item.sourceUrl ?? item.source_url);
  if (!url) return null;
  return {
    url,
    title: optionalString(item.title ?? item.name),
    extractedAt: optionalDate(item.extractedAt ?? item.extracted_at ?? item.fetchedAt),
    excerpt: optionalString(item.excerpt ?? item.sourceExcerpt ?? item.evidenceExcerpt)
  };
}

function normalizeFailedPage(value: unknown) {
  const item = record(value);
  const url = optionalUrl(item.url);
  const reason = optionalString(item.reason ?? item.error ?? item.message);
  return url && reason ? { url, reason } : null;
}

export function normalizeCompanyResearchInput(value: unknown): unknown {
  const input = record(value);
  const hooks = objectCollection(
    input.personalizationHooks ?? input.personalizationHook ?? input.personalization_hooks,
    ['fact', 'claim', 'text', 'description']
  );
  const sources = objectCollection(input.sources ?? input.source, ['url', 'sourceUrl', 'source_url']);
  const failedPages = objectCollection(input.failedPages ?? input.failed_pages, ['url']);
  return {
    companyName: optionalString(input.companyName ?? input.company ?? input.name),
    website: optionalUrl(input.website ?? input.websiteUrl ?? input.url),
    summary: optionalString(input.summary ?? input.companySummary ?? input.description) ?? '',
    industry: optionalString(input.industry),
    services: companyTextList(input.services ?? input.service),
    products: companyTextList(input.products ?? input.product),
    solutions: companyTextList(input.solutions ?? input.solution),
    customerTypes: companyTextList(input.customerTypes ?? input.customerType ?? input.customers),
    technologiesMentioned: companyTextList(
      input.technologiesMentioned ?? input.technologies ?? input.techStack
    ),
    locations: companyTextList(input.locations ?? input.location),
    hiringSignals: companyTextList(input.hiringSignals ?? input.hiringSignal),
    relevantDepartments: companyTextList(input.relevantDepartments ?? input.departments),
    relevantProjects: companyTextList(input.relevantProjects ?? input.relevantProject ?? input.projects),
    personalizationHooks: hooks
      .map(normalizePersonalizationHook)
      .filter((item): item is NonNullable<ReturnType<typeof normalizePersonalizationHook>> => Boolean(item)),
    sources: sources
      .map(normalizeSource)
      .filter((item): item is NonNullable<ReturnType<typeof normalizeSource>> => Boolean(item)),
    missingInformation: companyTextList(input.missingInformation ?? input.missingInfo),
    confidenceScore: normalizeConfidence(input.confidenceScore ?? input.confidence),
    analyzedAt: optionalDate(input.analyzedAt ?? input.analysisDate),
    fetchWarnings: companyTextList(input.fetchWarnings ?? input.warnings),
    failedPages: failedPages
      .map(normalizeFailedPage)
      .filter((item): item is NonNullable<ReturnType<typeof normalizeFailedPage>> => Boolean(item))
  };
}

export const COMPANY_RESEARCH_JSON_CONTRACT = `{
  "companyName": "string",
  "website": "https://...",
  "summary": "string",
  "industry": "string or omit",
  "services": ["string"],
  "products": ["string"],
  "solutions": ["string"],
  "customerTypes": ["string"],
  "technologiesMentioned": ["string"],
  "locations": ["string"],
  "hiringSignals": ["string"],
  "relevantDepartments": ["string"],
  "relevantProjects": ["concise project or case-study string"],
  "personalizationHooks": [
    {
      "fact": "verified public company fact",
      "relevance": "why this fact is relevant to candidate matching",
      "sourceUrl": "https://supporting-source.example",
      "sourceExcerpt": "verbatim supporting excerpt from the fetched source"
    }
  ],
  "sources": [
    {
      "url": "https://fetched-source.example",
      "title": "optional title",
      "excerpt": "optional short factual excerpt"
    }
  ],
  "missingInformation": ["string"],
  "confidenceScore": 0,
  "fetchWarnings": [],
  "failedPages": []
}`;

const companyResearchObjectSchema = z.object({
  companyName: z.string().trim().min(1).max(300),
  website: z.string().url().max(1000),
  summary: mediumText,
  industry: shortText.optional(),
  services: stringList(50),
  products: stringList(50),
  solutions: stringList(50),
  customerTypes: stringList(50),
  technologiesMentioned: stringList(50),
  locations: stringList(50),
  hiringSignals: stringList(30),
  relevantDepartments: stringList(30),
  relevantProjects: stringList(30),
  personalizationHooks: z.array(z.object({
    fact: z.string().trim().min(1).max(1000),
    relevance: z.string().trim().min(1).max(1000),
    sourceUrl: z.string().url().max(1000).optional(),
    sourceExcerpt: z.string().trim().min(1).max(1500).optional()
  })).max(20).default([]),
  sources: z.array(z.object({
    url: z.string().url().max(1000),
    title: shortText.optional(),
    extractedAt: z.string().datetime().optional(),
    excerpt: z.string().trim().min(1).max(1500).optional()
  })).max(10).default([]),
  missingInformation: stringList(30),
  confidenceScore: z.number().min(0).max(10),
  analyzedAt: z.string().datetime().optional(),
  fetchWarnings: stringList(30),
  failedPages: z.array(z.object({
    url: z.string().url().max(1000),
    reason: z.string().trim().min(1).max(500)
  })).max(20).default([])
});

export const companyResearchSchema = z.preprocess(normalizeCompanyResearchInput, companyResearchObjectSchema);

export type CompanyResearch = z.infer<typeof companyResearchSchema>;

export const projectRankingSchema = z.object({
  projectName: z.string().trim().min(1),
  score: z.number().min(0).max(10),
  explanation: z.string().trim().min(1).max(1500),
  matchedTerms: stringList(30)
});

export const candidateCompanyMatchSchema = z.object({
  recommendedTargetRole: z.string().trim().min(1).max(300),
  companyNeedOrOpportunity: z.string().trim().min(1).max(1500),
  strongestCandidateEvidence: z.string().trim().min(1).max(1500),
  relevantProject: z.string().trim().max(300).optional(),
  projectRanking: z.array(projectRankingSchema).max(20).default([]),
  technologyOverlap: stringList(30),
  matchPoints: z.array(z.object({
    companyContext: z.string().trim().min(1).max(1000),
    candidateEvidence: z.string().trim().min(1).max(1000),
    connection: z.string().trim().min(1).max(1500),
    sourceUrl: z.string().url().max(1000).optional()
  })).max(10),
  strongestAngle: z.string().trim().min(1).max(1500),
  secondaryAngle: z.string().trim().max(1500).optional(),
  risks: stringList(20),
  missingInformation: stringList(20),
  matchScore: z.number().min(0).max(10)
});

export type CandidateCompanyMatch = z.infer<typeof candidateCompanyMatchSchema>;

export const messageRequestSchema = z.object({
  companyId: z.string().trim().min(1),
  contactId: z.string().trim().optional(),
  matchId: z.string().trim().optional(),
  language: z.enum(messageLanguages),
  tone: z.enum(tones),
  messageType: z.string().trim().min(1).max(100).default('spontaneous_application'),
  desiredLength: z.string().trim().max(100).optional(),
  targetRole: z.string().trim().min(2).max(300),
  jobOfferText: z.string().trim().max(15_000).optional(),
  additionalInstructions: z.string().trim().max(3000).optional(),
  signature: z.string().trim().max(2000).optional(),
  limitedContext: z.boolean().default(false),
  existingMessage: z.object({
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(20_000)
  }).optional(),
  forceImprove: z.boolean().default(false)
});

export type MessageRequest = z.infer<typeof messageRequestSchema>;

export const generatedApplicationMessageContentSchema = z.object({
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(40).max(20_000),
  companyFactUsed: z.string().trim().min(1).max(1500),
  companyFactSourceUrl: z.string().url().max(1000).optional(),
  candidateEvidenceUsed: z.string().trim().min(1).max(1500),
  selectedProject: z.string().trim().max(300).optional(),
  matchingAngle: z.string().trim().min(1).max(1500)
});

export const generatedApplicationMessageSchema = generatedApplicationMessageContentSchema.extend({
  providerMetadata: aiExecutionMetadataSchema,
  promptVersion: z.string().trim().min(1),
  automaticRewriteUsed: z.boolean().default(false)
});

export type GeneratedApplicationMessage = z.infer<typeof generatedApplicationMessageSchema>;

export const messageQualityEvaluationSchema = z.object({
  companySpecific: z.boolean(),
  usesVerifiedCompanyFact: z.boolean(),
  usesCandidateEvidence: z.boolean(),
  relationshipIsClear: z.boolean(),
  hasInventedFacts: z.boolean(),
  treatsSpontaneousApplicationCorrectly: z.boolean(),
  genericPhraseCount: z.number().int().nonnegative(),
  personalizationScore: z.number().min(0).max(10),
  evidenceScore: z.number().min(0).max(10),
  naturalnessScore: z.number().min(0).max(10),
  clarityScore: z.number().min(0).max(10),
  overallScore: z.number().min(0).max(10),
  problems: stringList(30),
  improvementInstructions: stringList(30)
});

export type MessageQualityEvaluation = z.infer<typeof messageQualityEvaluationSchema>;

export const matchRequestSchema = z.object({
  companyId: z.string().trim().min(1),
  contactId: z.string().trim().optional(),
  targetRole: z.string().trim().min(2).max(300),
  jobOfferText: z.string().trim().max(15_000).optional(),
  additionalInstructions: z.string().trim().max(3000).optional()
});
