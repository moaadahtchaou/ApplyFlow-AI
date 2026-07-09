import { z } from 'zod';
import { MAX_CV_TEXT_LENGTH, MIN_CV_TEXT_LENGTH, normalizeCvText } from '../cv/extract';

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

function getCvAiProvider(config?: { requestedProvider?: string; apiKey?: string }) {
  const requestedProvider = config?.requestedProvider || process.env.AI_PROVIDER?.trim() || 'mock';
  const apiKey = config?.apiKey?.trim() || process.env.NVIDIA_API_KEY?.trim() || '';
  return {
    provider: requestedProvider === 'nvidia' && apiKey ? 'nvidia' as const : 'mock' as const,
    apiKey
  };
}

const draftString = (max = 4000) =>
  z.preprocess(
    (value) => {
      if (Array.isArray(value)) return value.filter(Boolean).join(', ');
      return value ?? '';
    },
    z.string().trim().max(max)
  );

export const cvContextDraftSchema = z.object({
  cvText: z.string().trim().min(MIN_CV_TEXT_LENGTH).max(MAX_CV_TEXT_LENGTH),
  candidateProfile: draftString().pipe(z.string().min(5, 'Candidate profile is required')),
  skills: draftString(2000),
  experienceSummary: draftString(3000),
  targetRole: draftString(200),
  languages: draftString(1000),
  preferredLocations: draftString(1000),
  bestFitBullets: z.array(z.string().trim()).default([]),
  targetRolesDetected: z.array(z.string().trim()).default([]),
  missingProfileWarnings: z.array(z.string().trim()).default([])
});

export type CvContextDraft = z.infer<typeof cvContextDraftSchema>;

export type CvAnalysisResult = {
  draft: CvContextDraft;
  provider: 'nvidia' | 'mock';
  fallbackReason?: string;
};

type NvidiaChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const knownSkills = [
  'TypeScript',
  'JavaScript',
  'React',
  'Next.js',
  'Node.js',
  'Express',
  'NestJS',
  'Prisma',
  'PostgreSQL',
  'MySQL',
  'SQLite',
  'MongoDB',
  'Python',
  'Django',
  'Flask',
  'FastAPI',
  'Java',
  'Spring',
  'C#',
  '.NET',
  'PHP',
  'Laravel',
  'HTML',
  'CSS',
  'Tailwind CSS',
  'Bootstrap',
  'Docker',
  'Git',
  'GitHub',
  'GitLab',
  'Playwright',
  'Selenium',
  'REST API',
  'GraphQL',
  'Figma',
  'UI/UX',
  'Linux',
  'AWS',
  'Azure',
  'Firebase',
  'Supabase',
  'Machine Learning',
  'AI',
  'Data Analysis'
];

const knownLanguages = ['English', 'French', 'Arabic', 'Spanish', 'German', 'Italian', 'Darija'];
const knownLocations = [
  'Casablanca',
  'Rabat',
  'Marrakech',
  'Marrakesh',
  'Tangier',
  'Tanger',
  'Fes',
  'Fez',
  'Agadir',
  'Kenitra',
  'Tetouan',
  'Oujda',
  'Morocco',
  'Maroc',
  'Alger',
  'Algiers',
  'Oran',
  'Constantine',
  'Algeria',
  'Remote'
];

function cleanStringArray(values: string[], limit: number) {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const value of values) {
    const item = value.replace(/\s+/g, ' ').trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(item);
    if (cleaned.length >= limit) break;
  }

  return cleaned;
}

function parseJsonContent(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    }
    throw new Error('AI response did not include valid JSON.');
  }
}

function finalizeDraft(input: unknown, cvText: string): CvContextDraft {
  const base = typeof input === 'object' && input !== null ? input : {};
  const parsed = cvContextDraftSchema.parse({
    ...base,
    cvText: normalizeCvText(
      typeof (base as { cvText?: unknown }).cvText === 'string' && (base as { cvText: string }).cvText.trim()
        ? (base as { cvText: string }).cvText
        : cvText
    )
  });

  return {
    ...parsed,
    bestFitBullets: cleanStringArray(parsed.bestFitBullets, 5),
    targetRolesDetected: cleanStringArray(parsed.targetRolesDetected, 7),
    missingProfileWarnings: cleanStringArray(parsed.missingProfileWarnings, 8)
  };
}

function wordsFromText(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 2);
}

function extractSkills(text: string) {
  const lower = text.toLowerCase();
  const detected = knownSkills.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
    return new RegExp(`(^|[^a-z0-9+#.])${escaped.toLowerCase()}([^a-z0-9+#.]|$)`, 'i').test(lower);
  });

  const skillLine = wordsFromText(text).find((line) => /^(technical\s+)?skills?|comp[eé]tences?/i.test(line));
  if (skillLine) {
    const afterHeading = skillLine.replace(/^(technical\s+)?skills?|comp[eé]tences?\s*[:\-]?\s*/i, '');
    afterHeading
      .split(/[,|•;/]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 1 && item.length < 40)
      .forEach((item) => detected.push(item));
  }

  return cleanStringArray(detected, 18);
}

function extractLanguages(text: string) {
  const detected = knownLanguages.filter((language) => new RegExp(`\\b${language}\\b`, 'i').test(text));
  if (/[\u0600-\u06ff]/.test(text)) detected.push('Arabic');
  return cleanStringArray(detected, 8);
}

function extractPreferredLocations(text: string) {
  const explicit = wordsFromText(text)
    .filter((line) => /^(location|address|city|based in|preferred locations?|localisation|adresse)\b/i.test(line))
    .map((line) => line.replace(/^(location|address|city|based in|preferred locations?|localisation|adresse)\s*[:\-]?\s*/i, ''));

  const cities = knownLocations.filter((location) => new RegExp(`\\b${location}\\b`, 'i').test(text));
  return cleanStringArray([...explicit, ...cities], 6);
}

function extractExperienceSummary(text: string) {
  const usefulLines = wordsFromText(text).filter((line) =>
    /experience|work|intern|developer|engineer|project|built|created|stage|projet|d[eé]veloppeur|application|website|platform/i.test(line)
  );
  const selected = usefulLines.length > 0 ? usefulLines : wordsFromText(text).slice(0, 5);
  return selected.slice(0, 4).join(' ').slice(0, 900).trim();
}

function detectTargetRoles(text: string, skills: string[]) {
  const source = `${text} ${skills.join(' ')}`.toLowerCase();
  const roles: string[] = [];

  if (/full.?stack|react|next\.?js|node\.?js|backend|frontend|api|database|prisma|mongodb|postgres|mysql/.test(source)) {
    if (/react|next\.?js|frontend/.test(source) && /node\.?js|backend|api|database|prisma|mongodb|postgres|mysql/.test(source)) {
      roles.push('Full-Stack Developer');
    }
  }
  if (/react|next\.?js|frontend|html|css|tailwind/.test(source)) roles.push('Frontend Developer');
  if (/node\.?js|backend|api|database|prisma|mongodb|postgres|mysql|django|flask|fastapi|laravel/.test(source)) roles.push('Backend Developer');
  if (/mobile|react native|flutter|android|ios/.test(source)) roles.push('Mobile App Developer');
  if (/machine learning|data analysis|python|ai\b|artificial intelligence/.test(source)) roles.push('AI/Data Developer');
  if (/software|developer|programmer|engineer|d[eé]veloppeur/.test(source)) roles.push('Software Developer');

  return cleanStringArray(roles.length > 0 ? roles : ['Software Developer'], 6);
}

function buildMissingWarnings(text: string) {
  const warnings: string[] = [];
  if (!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) warnings.push('No email found in CV text.');
  if (!/(?:\+?\d[\d\s().-]{7,}\d)/.test(text)) warnings.push('No phone number found in CV text.');
  if (!/linkedin\.com/i.test(text)) warnings.push('No LinkedIn URL found.');
  if (!/(github\.com|gitlab\.com|bitbucket\.org)/i.test(text)) warnings.push('No GitHub/GitLab portfolio link found.');
  if (!/(portfolio|https?:\/\/|www\.)/i.test(text)) warnings.push('No portfolio or personal website found.');
  if (!/(location|address|city|based in|localisation|adresse|morocco|maroc|algeria|alg[eé]rie)/i.test(text)) {
    warnings.push('No clear location found.');
  }
  return warnings;
}

export function analyzeCvContextMock(cvText: string): CvContextDraft {
  const normalized = normalizeCvText(cvText);
  const skills = extractSkills(normalized);
  const targetRolesDetected = detectTargetRoles(normalized, skills);
  const experienceSummary = extractExperienceSummary(normalized);
  const languages = extractLanguages(normalized);
  const preferredLocations = extractPreferredLocations(normalized);
  const targetRole = targetRolesDetected[0] ?? 'Software Developer';
  const profileParts = [
    `${targetRole} candidate.`,
    skills.length > 0 ? `Skills explicitly found in the CV: ${skills.join(', ')}.` : '',
    experienceSummary ? `Experience summary from the CV: ${experienceSummary}` : ''
  ].filter(Boolean);

  const bestFitBullets = cleanStringArray([
    skills.length > 0 ? `Can discuss hands-on work with ${skills.slice(0, 5).join(', ')}.` : '',
    targetRole ? `Profile appears relevant for ${targetRole} outreach.` : '',
    experienceSummary ? experienceSummary : ''
  ], 5);

  return finalizeDraft({
    cvText: normalized,
    candidateProfile: profileParts.join(' '),
    skills: skills.join(', '),
    experienceSummary,
    targetRole,
    languages: languages.join(', '),
    preferredLocations: preferredLocations.join(', '),
    bestFitBullets,
    targetRolesDetected,
    missingProfileWarnings: buildMissingWarnings(normalized)
  }, normalized);
}

function buildNvidiaPrompt(cvText: string) {
  return `Analyze this CV text and create candidate context for personalized job outreach.

Return ONLY valid JSON with exactly these keys:
{
  "candidateProfile": "string",
  "skills": "comma-separated string",
  "experienceSummary": "string",
  "targetRole": "string",
  "languages": "comma-separated string",
  "preferredLocations": "comma-separated string",
  "bestFitBullets": ["string"],
  "targetRolesDetected": ["string"],
  "missingProfileWarnings": ["string"]
}

Rules:
- Use only facts explicitly present in the CV text.
- Do not invent achievements, employers, degrees, dates, years of experience, technologies, languages, locations, links, or contact details.
- If something is not present, return an empty string or an empty array.
- candidateProfile should be a concise outreach-ready profile summary.
- bestFitBullets should contain 3 to 5 CV-backed strengths useful in application emails.
- targetRolesDetected should contain realistic roles suggested by the CV, not job openings.
- missingProfileWarnings should mention missing email, phone, LinkedIn, GitHub/portfolio, or location when not found.

CV text:
${cvText}`;
}

async function analyzeWithNvidia(cvText: string, apiKey: string): Promise<CvContextDraft> {
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not configured.');
  }

  const model = process.env.NVIDIA_MODEL?.trim() || 'qwen/qwen3.5-122b-a10b';
  const response = await fetch(NVIDIA_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a careful career assistant. Extract CV facts into strict JSON only. Never invent details.'
        },
        {
          role: 'user',
          content: buildNvidiaPrompt(cvText.slice(0, 24_000))
        }
      ],
      temperature: 0.15,
      top_p: 0.8,
      max_tokens: 1200
    }),
    cache: 'no-store'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as NvidiaChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('NVIDIA response did not include message content.');
  }

  return finalizeDraft(parseJsonContent(content), cvText);
}

export async function analyzeCvContext(
  cvText: string,
  config?: { requestedProvider?: string; apiKey?: string }
): Promise<CvAnalysisResult> {
  const normalized = normalizeCvText(cvText);
  const { provider, apiKey } = getCvAiProvider(config);

  if (provider === 'nvidia') {
    try {
      return {
        draft: await analyzeWithNvidia(normalized, apiKey),
        provider: 'nvidia'
      };
    } catch (error) {
      console.warn('NVIDIA CV analysis failed. Falling back to mock analysis.', error);
      return {
        draft: analyzeCvContextMock(normalized),
        provider: 'mock',
        fallbackReason: error instanceof Error ? error.message : 'NVIDIA CV analysis failed.'
      };
    }
  }

  return {
    draft: analyzeCvContextMock(normalized),
    provider: 'mock'
  };
}
