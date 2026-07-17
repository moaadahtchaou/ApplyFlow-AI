import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generatedMessageSchema } from '@/lib/validations/generated-message';

export async function POST(request: Request) {
  try {
    const input = generatedMessageSchema.parse(await request.json());
    const [company, contact, match] = await Promise.all([
      prisma.company.findUnique({ where: { id: input.companyId } }),
      input.contactId ? prisma.contact.findUnique({ where: { id: input.contactId } }) : null,
      prisma.candidateCompanyMatch.findUnique({ where: { id: input.matchId } })
    ]);
    if (!company || !match || match.companyId !== company.id || match.status !== 'ready') {
      return NextResponse.json({ error: 'The company or match is no longer valid.', code: 'INVALID_RELATION' }, { status: 409 });
    }
    if (contact && contact.companyId !== company.id) {
      return NextResponse.json({ error: 'The contact does not belong to this company.', code: 'CONTACT_MISMATCH' }, { status: 400 });
    }
    const message = await prisma.generatedMessage.create({
      data: {
        companyId: input.companyId,
        contactId: input.contactId,
        matchId: input.matchId,
        purpose: input.purpose,
        tone: input.tone,
        language: input.language,
        subject: input.subject,
        body: input.body,
        provider: input.providerMetadata.provider,
        providerModel: input.providerMetadata.model,
        fallbackUsed: input.providerMetadata.fallbackUsed,
        promptVersion: input.promptVersion,
        companyFactUsed: input.companyFactUsed,
        companyFactSourceUrl: input.companyFactSourceUrl,
        candidateEvidenceUsed: input.candidateEvidenceUsed,
        selectedProject: input.selectedProject,
        matchingAngle: input.matchingAngle,
        evaluationData: JSON.stringify(input.evaluation),
        qualityScore: input.evaluation.overallScore,
        automaticRewriteUsed: input.automaticRewriteUsed,
        generatedAt: new Date(input.providerMetadata.generatedAt)
      }
    });
    await prisma.activityLog.create({
      data: {
        action: 'generated',
        entityType: 'GeneratedMessage',
        entityName: input.subject,
        description: `Saved a verified ${input.language} message using ${input.providerMetadata.provider}; quality ${input.evaluation.overallScore}/10.`
      }
    });
    revalidatePath('/');
    revalidatePath('/ai-generator');
    revalidatePath(`/companies/${input.companyId}`);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'The generated output is invalid and was not saved.', code: 'INVALID_MESSAGE' }, { status: 400 });
    }
    console.error('Saving generated message failed', error);
    return NextResponse.json({ error: 'Could not save this generated message.', code: 'SAVE_FAILED' }, { status: 500 });
  }
}
