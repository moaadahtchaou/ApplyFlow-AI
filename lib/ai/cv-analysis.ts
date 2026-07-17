import {
  candidateProfileSchema,
  type AIExecutionMetadata,
  type CandidateProfile,
  type CVExtractionResult
} from '@/lib/ai/contracts';
import { executeStructured, type ProviderConfig } from '@/lib/ai/provider';
import { buildCvStructurePrompt, JSON_ONLY_SYSTEM_PROMPT, PROMPT_VERSIONS } from '@/lib/ai/prompts';
import { isEvidenceSupported } from '@/lib/ai/evidence';

const technicalVocabulary = [
  'TypeScript', 'JavaScript', 'React', 'React Native', 'Next.js', 'Node.js', 'Express', 'NestJS',
  'Prisma', 'PostgreSQL', 'MySQL', 'SQLite', 'MongoDB', 'Python', 'Django', 'Flask', 'FastAPI',
  'Java', 'Spring', 'C#', '.NET', 'PHP', 'Laravel', 'HTML', 'CSS', 'Tailwind CSS', 'Bootstrap',
  'Docker', 'Git', 'GitHub', 'Playwright', 'Selenium', 'REST API', 'GraphQL', 'Figma', 'Linux',
  'AWS', 'Azure', 'Firebase', 'Supabase', 'Machine Learning', 'Artificial Intelligence', 'AI',
  'Data Analysis', 'Shopify', 'Shopify Liquid', 'Expo', 'REST API', 'REST APIs', 'API Integration',
  'Authentication', 'OAuth', 'JWT', 'OpenAI API', 'NVIDIA AI', 'AI Integration'
];

const softSkillVocabulary = [
  'Communication', 'Teamwork', 'Problem Solving', 'Leadership', 'Mentoring', 'Collaboration',
  'Project Management', 'Time Management', 'Adaptability', 'Critical Thinking'
];

const hobbyPattern = /\b(video games?|gaming|history|webnovels?|web novels?|reading|music|movies?|cinema|travel|football|sports?)\b/i;

function unique(values: Array<string | undefined>, limit = 50) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const item = value?.replace(/\s+/g, ' ').trim();
    if (!item || seen.has(item.toLowerCase())) return [];
    seen.add(item.toLowerCase());
    return [item];
  }).slice(0, limit);
}

function textLines(text: string) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function section(text: string, heading: RegExp) {
  const lines = textLines(text);
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return [];
  const result: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^(experience|education|skills?|projects?|languages?|certifications?|summary|profile|contact)\b[:\s-]*$/i.test(line)) break;
    result.push(line);
    if (result.length >= 30) break;
  }
  return result;
}

export function detectTechnicalSkills(text: string) {
  return unique(technicalVocabulary.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, 'i').test(text);
  }));
}

export function contactFacts(text: string) {
  const lines = textLines(text);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.replace(/\s+/g, ' ').trim();
  const explicitLocation = lines.find((line) =>
    /^(?:location|address|adresse|ville|city|localisation)\s*[:\-]/i.test(line)
  )?.replace(/^[^:\-]+[:\-]\s*/, '').trim();
  const knownLocation = ['Casablanca', 'Rabat', 'Marrakech', 'Tangier', 'Tanger', 'Agadir', 'Morocco', 'Maroc']
    .find((place) => new RegExp(`\\b${place}\\b`, 'i').test(text));
  const fullName = lines.slice(0, 12).find((line) =>
    /^[\p{L}][\p{L}\s.'-]{2,79}$/u.test(line) &&
    !/^(cv|resume|curriculum|profile|summary|contact|developer|engineer|designer|skills?)$/i.test(line)
  );
  return { fullName, email, phone, location: explicitLocation || knownLocation };
}

function concreteEvidence(profile: CandidateProfile, technicalSkills: string[]) {
  return unique([
    ...profile.projects.flatMap((project) => [
      ...project.achievements,
      project.description ? `${project.name}: ${project.description}` : project.name
    ]),
    ...profile.experiences.flatMap((experience) => [
      ...experience.achievements,
      experience.description
    ]),
    technicalSkills.length
      ? `Technical stack documented in the CV: ${technicalSkills.slice(0, 12).join(', ')}.`
      : undefined
  ], 12);
}

export function reconcileCandidateProfileWithSource(profile: CandidateProfile, source: string) {
  const contact = contactFacts(source);
  const detected = detectTechnicalSkills(source);
  const technicalSkills = unique([
    ...detected,
    ...profile.technicalSkills.filter((skill) => !hobbyPattern.test(skill) && isEvidenceSupported(skill, source, 0.2)),
    ...profile.skills.filter((skill) => !hobbyPattern.test(skill) && isEvidenceSupported(skill, source, 0.2))
  ], 100);
  const professionalSkills = unique([
    ...technicalSkills,
    ...profile.softSkills.filter((skill) => !hobbyPattern.test(skill))
  ], 100);
  const reconciled = candidateProfileSchema.parse({
    ...profile,
    fullName: contact.fullName ?? profile.fullName,
    email: contact.email ?? profile.email,
    phone: contact.phone ?? profile.phone,
    location: contact.location ?? profile.location,
    skills: professionalSkills,
    technicalSkills
  });
  const fallbackEvidence = concreteEvidence(reconciled, technicalSkills);
  const strengthsNeedRepair = reconciled.strengths.some((item) =>
    /^technical stack documented/i.test(item)
  ) || reconciled.strengths.length > 8 ||
    reconciled.strengths.filter((item) => item.length < 45).length > reconciled.strengths.length / 3;
  return candidateProfileSchema.parse({
    ...reconciled,
    strengths: reconciled.strengths.length && !strengthsNeedRepair
      ? reconciled.strengths
      : fallbackEvidence.slice(0, 5),
    bestFitBullets: reconciled.bestFitBullets.length ? reconciled.bestFitBullets : fallbackEvidence.slice(0, 5),
    evidenceSummary: reconciled.evidenceSummary.length ? reconciled.evidenceSummary : fallbackEvidence
  });
}

function inferTargetRoles(text: string, skills: string[]) {
  const source = `${text} ${skills.join(' ')}`.toLowerCase();
  const roles: string[] = [];
  if (/(react|next\.js|frontend)/.test(source) && /(node\.js|api|prisma|database|backend)/.test(source)) roles.push('Full-Stack Developer');
  if (/(react|next\.js|frontend|html|css)/.test(source)) roles.push('Frontend Developer');
  if (/(node\.js|api|prisma|database|backend|django|fastapi|laravel)/.test(source)) roles.push('Backend Developer');
  if (/(react native|expo|mobile|android|ios)/.test(source)) roles.push('Mobile Developer');
  if (/(machine learning|artificial intelligence|\bai\b|data analysis)/.test(source)) roles.push('AI / Data Developer');
  return unique(roles.length ? roles : ['Software Developer'], 8);
}

function findUrl(text: string, matcher: RegExp) {
  const urls = text.match(/https?:\/\/[^\s)>]+/gi) ?? [];
  return urls.find((url) => matcher.test(url));
}

function mockCandidateProfile(extraction: CVExtractionResult): CandidateProfile {
  const text = extraction.text;
  const lines = textLines(text);
  const technicalSkills = detectTechnicalSkills(text);
  const targetRoles = inferTargetRoles(text, technicalSkills);
  const projectLines = section(text, /^(projects?|projets?|portfolio)\b/i);
  const experienceLines = section(text, /^(experience|employment|work history|exp[ée]rience)\b/i);
  const educationLines = section(text, /^(education|formation|academic)\b/i);
  const languageLine = section(text, /^(languages?|langues?)\b/i).slice(0, 8);
  const detectedLanguages = ['English', 'French', 'Arabic', 'Darija', 'German', 'Spanish', 'Italian']
    .filter((language) => new RegExp(`\\b${language}\\b`, 'i').test(text));
  const detectedLocations = ['Casablanca', 'Rabat', 'Marrakech', 'Tangier', 'Tanger', 'Agadir', 'Morocco', 'Maroc', 'Remote']
    .filter((location) => new RegExp(`\\b${location}\\b`, 'i').test(text));
  const likelyName = lines[0] && /^[\p{L}\s.'-]{3,80}$/u.test(lines[0]) ? lines[0] : undefined;
  const contact = contactFacts(text);
  const projects = projectLines.length ? [{
    name: projectLines.find((line) => !/^[•\-–]/.test(line))?.slice(0, 300) || 'CV project',
    description: projectLines.slice(0, 8).join(' ').slice(0, 3000),
    technologies: technicalSkills.filter((skill) => projectLines.join(' ').toLowerCase().includes(skill.toLowerCase())),
    features: projectLines.filter((line) => /^[•\-–]/.test(line)).map((line) => line.replace(/^[•\-–]\s*/, '')).slice(0, 12),
    achievements: projectLines.filter((line) => /\b(\d+%?|\d+x|improved|increased|reduced|built|launched)\b/i.test(line)).slice(0, 8)
  }] : [];
  const experiences = experienceLines.length ? [{
    description: experienceLines.slice(0, 12).join(' ').slice(0, 3500),
    responsibilities: experienceLines.filter((line) => /^[•\-–]/.test(line)).map((line) => line.replace(/^[•\-–]\s*/, '')).slice(0, 15),
    achievements: experienceLines.filter((line) => /\b(\d+%?|\d+x|improved|increased|reduced|delivered|launched)\b/i.test(line)).slice(0, 8),
    technologies: technicalSkills.filter((skill) => experienceLines.join(' ').toLowerCase().includes(skill.toLowerCase()))
  }] : [];
  const evidenceSummary = unique([
    projects[0]?.description,
    experiences[0]?.description,
    technicalSkills.length ? `Technologies explicitly listed: ${technicalSkills.slice(0, 8).join(', ')}.` : undefined
  ], 8);
  const missingInformation = unique([
    projects.length ? undefined : 'No clearly delimited projects section was detected.',
    experiences.length ? undefined : 'No clearly delimited experience section was detected.',
    findUrl(text, /github\.com/i) ? undefined : 'No GitHub URL was found.',
    findUrl(text, /linkedin\.com/i) ? undefined : 'No LinkedIn URL was found.',
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) ? undefined : 'No email address was found.',
    /(?:\+?\d[\d\s().-]{7,}\d)/.test(text) ? undefined : 'No phone number was found.',
    extraction.qualityScore < 6 ? 'Extraction quality is low; review the saved text before relying on this profile.' : undefined
  ]);

  return candidateProfileSchema.parse({
    fullName: contact.fullName ?? likelyName,
    email: contact.email,
    phone: contact.phone,
    location: contact.location,
    headline: targetRoles[0],
    professionalSummary: evidenceSummary.slice(0, 2).join(' ').slice(0, 3000) || undefined,
    targetRoles,
    skills: technicalSkills,
    technicalSkills,
    softSkills: [],
    experiences,
    projects,
    education: educationLines.length ? [{ description: educationLines.slice(0, 8).join(' ').slice(0, 3000) }] : [],
    certifications: section(text, /^(certifications?|certificats?)\b/i).slice(0, 12),
    languages: unique([
      ...detectedLanguages,
      ...languageLine.map((language) => language.replace(/^[•\-–]\s*/, '').slice(0, 100))
    ]).map((language) => ({ language })),
    preferredLocations: detectedLocations,
    portfolioUrl: findUrl(text, /(portfolio|behance|dribbble)/i),
    githubUrl: findUrl(text, /github\.com/i),
    linkedinUrl: findUrl(text, /linkedin\.com/i),
    strengths: evidenceSummary.slice(0, 5),
    bestFitBullets: evidenceSummary.slice(0, 5),
    evidenceSummary,
    missingInformation
  });
}

export async function analyzeCandidateProfile(
  extraction: CVExtractionResult,
  config?: ProviderConfig
): Promise<{ profile: CandidateProfile; metadata: AIExecutionMetadata; promptVersion: string }> {
  const execution = await executeStructured({
    schema: candidateProfileSchema,
    systemPrompt: JSON_ONLY_SYSTEM_PROMPT,
    userPrompt: buildCvStructurePrompt(extraction.text),
    promptVersion: PROMPT_VERSIONS.cvStructure,
    config,
    mock: () => mockCandidateProfile(extraction),
    temperature: 0.1,
    maxTokens: 3500,
    operationLabel: 'CV analysis',
    validationErrorMessage: 'The generated profile did not match the expected CV structure.'
  });
  const source = extraction.text;
  const sourceLower = source.toLowerCase();
  const contact = contactFacts(source);
  const detectedTechnicalSkills = detectTechnicalSkills(source);
  const supported = (claim: string, threshold = 0.3) => isEvidenceSupported(claim, source, threshold);
  const supportedItems = (items: string[], threshold = 0.3) => items.filter((item) => supported(item, threshold));
  const technicalSkills = unique([
    ...detectedTechnicalSkills,
    ...execution.data.technicalSkills.filter((skill) => supported(skill, 0.2)),
    ...execution.data.skills.filter((skill) =>
      !hobbyPattern.test(skill) && (detectedTechnicalSkills.some((known) =>
        known.toLowerCase() === skill.toLowerCase()) || technicalVocabulary.some((known) =>
        known.toLowerCase() === skill.toLowerCase()))
    )
  ], 100);
  const softSkills = unique(execution.data.softSkills.filter((skill) =>
    softSkillVocabulary.some((known) => known.toLowerCase() === skill.toLowerCase()) && supported(skill, 0.2)
  ), 50);
  const sanitized = candidateProfileSchema.parse({
    ...execution.data,
    fullName: contact.fullName ?? (execution.data.fullName && supported(execution.data.fullName, 0.45) ? execution.data.fullName : undefined),
    email: contact.email ?? execution.data.email,
    phone: contact.phone ?? execution.data.phone,
    location: contact.location ?? (execution.data.location && supported(execution.data.location, 0.45) ? execution.data.location : undefined),
    headline: execution.data.headline && supported(execution.data.headline, 0.2) ? execution.data.headline : inferTargetRoles(source, technicalSkills)[0],
    professionalSummary: execution.data.professionalSummary && supported(execution.data.professionalSummary, 0.2)
      ? execution.data.professionalSummary
      : undefined,
    skills: unique([...technicalSkills, ...softSkills], 100),
    technicalSkills,
    softSkills,
    experiences: execution.data.experiences.map((experience) => ({
      ...experience,
      role: experience.role && supported(experience.role, 0.35) ? experience.role : undefined,
      company: experience.company && supported(experience.company, 0.4) ? experience.company : undefined,
      location: experience.location && supported(experience.location, 0.4) ? experience.location : undefined,
      startDate: experience.startDate && sourceLower.includes(experience.startDate.toLowerCase()) ? experience.startDate : undefined,
      endDate: experience.endDate && sourceLower.includes(experience.endDate.toLowerCase()) ? experience.endDate : undefined,
      description: supported(experience.description, 0.2) ? experience.description : '',
      responsibilities: supportedItems(experience.responsibilities, 0.22),
      achievements: supportedItems(experience.achievements, 0.25),
      technologies: unique([...experience.technologies.filter((technology) => supported(technology, 0.2)),
        ...technicalSkills.filter((technology) => experience.description.toLowerCase().includes(technology.toLowerCase()))])
    })).filter((experience) => experience.role || experience.company || experience.description || experience.responsibilities.length),
    projects: execution.data.projects.filter((project) => supported(project.name, 0.3)).map((project) => ({
      ...project,
      description: supported(project.description, 0.2) ? project.description : project.name,
      role: project.role && supported(project.role, 0.3) ? project.role : undefined,
      technologies: unique([...project.technologies.filter((technology) => supported(technology, 0.2)),
        ...technicalSkills.filter((technology) => `${project.description} ${project.features.join(' ')}`.toLowerCase().includes(technology.toLowerCase()))]),
      features: supportedItems(project.features, 0.22),
      achievements: supportedItems(project.achievements, 0.25),
      url: project.url && source.includes(project.url) ? project.url : undefined,
      repositoryUrl: project.repositoryUrl && source.includes(project.repositoryUrl) ? project.repositoryUrl : undefined
    })),
    education: execution.data.education.map((education) => ({
      institution: education.institution && supported(education.institution, 0.4) ? education.institution : undefined,
      degree: education.degree && supported(education.degree, 0.35) ? education.degree : undefined,
      field: education.field && supported(education.field, 0.35) ? education.field : undefined,
      startDate: education.startDate && sourceLower.includes(education.startDate.toLowerCase()) ? education.startDate : undefined,
      endDate: education.endDate && sourceLower.includes(education.endDate.toLowerCase()) ? education.endDate : undefined,
      description: education.description && supported(education.description, 0.25) ? education.description : undefined
    })).filter((education) => Object.values(education).some(Boolean)),
    certifications: supportedItems(execution.data.certifications, 0.5),
    languages: execution.data.languages.filter((language) => sourceLower.includes(language.language.toLowerCase())).map((language) => ({
      language: language.language,
      level: language.level && sourceLower.includes(language.level.toLowerCase()) ? language.level : undefined
    })),
    preferredLocations: supportedItems(execution.data.preferredLocations, 0.7),
    portfolioUrl: execution.data.portfolioUrl && source.includes(execution.data.portfolioUrl) ? execution.data.portfolioUrl : undefined,
    githubUrl: execution.data.githubUrl && source.includes(execution.data.githubUrl) ? execution.data.githubUrl : undefined,
    linkedinUrl: execution.data.linkedinUrl && source.includes(execution.data.linkedinUrl) ? execution.data.linkedinUrl : undefined,
    strengths: supportedItems(execution.data.strengths, 0.2),
    bestFitBullets: supportedItems(execution.data.bestFitBullets, 0.2),
    evidenceSummary: supportedItems(execution.data.evidenceSummary, 0.2),
    missingInformation: unique([
      ...execution.data.missingInformation,
      ...(execution.metadata.provider === 'nvidia'
        ? ['AI-extracted claims that could not be traced to the CV text were removed.']
        : [])
    ], 30)
  });
  const enriched = reconcileCandidateProfileWithSource(sanitized, source);
  return {
    profile: enriched,
    metadata: execution.metadata,
    promptVersion: PROMPT_VERSIONS.cvStructure
  };
}

export { mockCandidateProfile };
