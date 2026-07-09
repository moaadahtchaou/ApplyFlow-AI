import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { cvContextDraftSchema } from '@/lib/ai/cv-context';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const draft = cvContextDraftSchema.parse(
      typeof body === 'object' && body !== null && 'draft' in body ? (body as { draft: unknown }).draft : body
    );

    const settings = await prisma.userSettings.upsert({
      where: { singletonKey: 'default' },
      update: {
        cvText: draft.cvText,
        candidateProfile: draft.candidateProfile,
        skills: draft.skills,
        experienceSummary: draft.experienceSummary,
        targetRole: draft.targetRole,
        languages: draft.languages,
        preferredLocations: draft.preferredLocations
      },
      create: {
        singletonKey: 'default',
        cvText: draft.cvText,
        candidateProfile: draft.candidateProfile,
        skills: draft.skills,
        experienceSummary: draft.experienceSummary,
        targetRole: draft.targetRole,
        languages: draft.languages,
        preferredLocations: draft.preferredLocations,
        defaultSignature: '',
        defaultTone: 'professional',
        defaultLanguage: 'English'
      }
    });

    await prisma.activityLog.create({
      data: {
        action: 'cv_context_applied',
        entityType: 'UserSettings',
        entityName: 'Default settings',
        description: 'CV text and AI candidate context were saved after review.'
      }
    });

    revalidatePath('/profile');
    revalidatePath('/ai-generator');

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('CV context apply failed', error);
    return NextResponse.json({ error: 'Could not save the CV context. Review the fields and try again.' }, { status: 400 });
  }
}
