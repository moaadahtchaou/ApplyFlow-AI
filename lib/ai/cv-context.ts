import { z } from 'zod';
import { analyzeCandidateProfile, mockCandidateProfile } from '@/lib/ai/cv-analysis';
import { assessCvExtraction, MAX_CV_TEXT_LENGTH, MIN_CV_TEXT_LENGTH, normalizeCvText } from '@/lib/cv/extract';

const draftString = (max = 4000) =>
  z.preprocess(
    (value) => Array.isArray(value) ? value.filter(Boolean).join(', ') : value ?? '',
    z.string().trim().max(max)
  );

export const cvContextDraftSchema = z.object({
  cvText: z.string().trim().min(MIN_CV_TEXT_LENGTH).max(MAX_CV_TEXT_LENGTH),
  candidateProfile: draftString().pipe(z.string().min(5)),
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
  model?: string;
};

function toLegacyDraft(cvText: string, profile: ReturnType<typeof mockCandidateProfile>): CvContextDraft {
  return cvContextDraftSchema.parse({
    cvText: normalizeCvText(cvText),
    candidateProfile: [
      profile.targetRoles[0] ? `${profile.targetRoles[0]} candidate.` : '',
      profile.professionalSummary || profile.evidenceSummary.join(' ')
    ].filter(Boolean).join(' '),
    skills: profile.skills.join(', '),
    experienceSummary: profile.experiences.map((item) => item.description).filter(Boolean).join(' ').slice(0, 3000),
    targetRole: profile.targetRoles[0] ?? '',
    languages: profile.languages.map((item) => [item.language, item.level].filter(Boolean).join(' — ')).join(', '),
    preferredLocations: profile.preferredLocations.join(', '),
    bestFitBullets: profile.bestFitBullets,
    targetRolesDetected: profile.targetRoles,
    missingProfileWarnings: profile.missingInformation
  });
}

export function analyzeCvContextMock(cvText: string) {
  const extraction = assessCvExtraction(cvText, { fileKind: 'manual' });
  return toLegacyDraft(extraction.text, mockCandidateProfile(extraction));
}

export async function analyzeCvContext(
  cvText: string,
  config?: { requestedProvider?: string; apiKey?: string }
): Promise<CvAnalysisResult> {
  const extraction = assessCvExtraction(cvText, { fileKind: 'manual' });
  const result = await analyzeCandidateProfile(extraction, config);
  return {
    draft: toLegacyDraft(extraction.text, result.profile),
    provider: result.metadata.provider,
    model: result.metadata.model
  };
}
