import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  aiExecutionMetadataSchema,
  candidateProfileSchema,
  cvExtractionResultSchema
} from '@/lib/ai/contracts';
import { parseStored, stableHash } from '@/lib/ai/storage';
import { prisma } from '@/lib/prisma';
import { mergeCanonicalCandidateProfile, parseManualFields } from '@/lib/ai/candidate-profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const applySchema = z.object({
  extraction: cvExtractionResultSchema,
  profile: candidateProfileSchema,
  manualFields: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  providerMetadata: aiExecutionMetadataSchema,
  promptVersion: z.string().trim().min(1).max(100)
});

export async function POST(request: Request) {
  try {
    const input = applySchema.parse(await request.json());
    const previous = await prisma.userSettings.findUnique({ where: { singletonKey: 'default' } });
    const previousProfile = previous
      ? parseStored(candidateProfileSchema, previous.structuredProfile)
      : null;
    const previousManualFields = parseManualFields(previous?.profileManualFields);
    const manualFields = new Set([...previousManualFields, ...input.manualFields]);
    const profile = mergeCanonicalCandidateProfile({
      saved: previousProfile,
      incoming: input.profile,
      manualFields: input.manualFields
    });
    const experienceSummary = profile.experiences.map((item) => item.description).filter(Boolean).join(' ').slice(0, 3000);
    const candidateProfile = profile.professionalSummary || profile.evidenceSummary.join(' ');
    const update = {
      cvText: input.extraction.text,
      candidateProfile,
      fullName: profile.fullName ?? '',
      email: profile.email ?? '',
      phone: profile.phone ?? '',
      location: profile.location ?? '',
      skills: profile.skills.join(', '),
      experienceSummary,
      targetRole: profile.targetRoles[0] ?? '',
      languages: profile.languages.map((item) => [item.language, item.level].filter(Boolean).join(' — ')).join(', '),
      preferredLocations: profile.preferredLocations.join(', '),
      structuredProfile: JSON.stringify(profile),
      profileManualFields: JSON.stringify([...manualFields]),
      cvExtractionData: JSON.stringify(input.extraction),
      cvAnalysisStatus: 'ready',
      cvAnalysisVersion: input.promptVersion,
      cvAnalysisProvider: input.providerMetadata.provider,
      cvAnalysisModel: input.providerMetadata.model,
      cvAnalysisLatencyMs: input.providerMetadata.latencyMs,
      cvAnalysisRequestId: input.providerMetadata.requestId,
      cvInputHash: stableHash(input.extraction.text),
      cvAnalyzedAt: new Date(input.providerMetadata.generatedAt),
      profileVersion: { increment: 1 }
    };
    const [savedSettings] = await prisma.$transaction([
      prisma.userSettings.upsert({
        where: { singletonKey: 'default' },
        update,
        create: {
          singletonKey: 'default',
          ...update,
          profileVersion: 1,
          defaultSignature: '',
          defaultTone: 'professional',
          defaultLanguage: 'English'
        }
      }),
      prisma.candidateCompanyMatch.updateMany({ data: { status: 'outdated' } }),
      prisma.activityLog.create({
        data: {
          action: 'cv_profile_applied',
          entityType: 'UserSettings',
          entityName: 'Candidate profile',
          description: `Structured CV profile saved with ${input.providerMetadata.provider}.`
        }
      })
    ]);
    revalidatePath('/profile');
    revalidatePath('/ai-generator');
    return NextResponse.json({
      success: true,
      profile,
      settings: {
        fullName: savedSettings.fullName,
        email: savedSettings.email,
        phone: savedSettings.phone,
        location: savedSettings.location,
        targetRole: savedSettings.targetRole,
        skills: savedSettings.skills,
        candidateProfile: savedSettings.candidateProfile,
        profileVersion: savedSettings.profileVersion
      }
    });
  } catch (error) {
    const validation = error instanceof z.ZodError;
    console.error('CV profile apply failed', {
      code: validation ? 'INVALID_REQUEST' : 'DATABASE_SAVE_FAILED',
      issues: validation
        ? error.issues.slice(0, 20).map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
        : undefined,
      message: !validation && error instanceof Error ? error.message.slice(0, 300) : undefined
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: validation ? 'INVALID_REQUEST' : 'DATABASE_SAVE_FAILED',
          message: validation
            ? 'The candidate profile data is invalid.'
            : 'The candidate profile could not be saved. The previous valid profile was preserved.',
          retryable: !validation
        }
      },
      { status: validation ? 400 : 500 }
    );
  }
}
