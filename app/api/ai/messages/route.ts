import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generatedMessageSchema } from '@/lib/validations/generated-message';
import { getOrCreateSettings } from '@/lib/settings';
import { stableHash } from '@/lib/ai/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  const owner = await getOrCreateSettings();
  const messages = await prisma.generatedMessage.findMany({
    where: { ownerSettingsId: owner.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      subject: true,
      purpose: true,
      language: true,
      qualityScore: true,
      companyNameSnapshot: true,
      createdAt: true
    }
  });
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  try {
    const input = generatedMessageSchema.parse(await request.json());
    const [owner, company, contact, match] = await Promise.all([
      getOrCreateSettings(),
      prisma.company.findUnique({ where: { id: input.companyId } }),
      input.contactId ? prisma.contact.findUnique({ where: { id: input.contactId } }) : null,
      prisma.candidateCompanyMatch.findUnique({ where: { id: input.matchId } })
    ]);
    if (!company || !match || match.companyId !== company.id || !['ready', 'limited'].includes(match.status)) {
      return NextResponse.json({ error: 'The company or match is no longer valid.', code: 'INVALID_RELATION' }, { status: 409 });
    }
    if (contact && contact.companyId !== company.id) {
      return NextResponse.json({ error: 'The contact does not belong to this company.', code: 'CONTACT_MISMATCH' }, { status: 400 });
    }
    const saveFingerprint = stableHash({
      ownerSettingsId: owner.id,
      matchId: input.matchId,
      subject: input.subject,
      body: input.body,
      generatedAt: input.providerMetadata.generatedAt
    });
    const duplicate = await prisma.generatedMessage.findUnique({ where: { saveFingerprint } });
    if (duplicate) return NextResponse.json({ message: duplicate, duplicate: true });

    const message = await prisma.generatedMessage.create({
      data: {
        ownerSettingsId: owner.id,
        companyId: input.companyId,
        contactId: input.contactId,
        matchId: input.matchId,
        purpose: input.purpose,
        signatureSnapshot: input.signature,
        messageType: input.messageType,
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
        generatedAt: new Date(input.providerMetadata.generatedAt),
        saveFingerprint,
        companyNameSnapshot: company.name,
        companyWebsiteSnapshot: company.website,
        contactSnapshot: contact ? JSON.stringify({
          fullName: contact.fullName,
          title: contact.title,
          email: contact.email,
          phone: contact.phone,
          linkedinUrl: contact.linkedinUrl
        }) : '',
        evidenceSnapshot: JSON.stringify({
          companyFact: input.companyFactUsed,
          companyFactSourceUrl: input.companyFactSourceUrl,
          candidateEvidence: input.candidateEvidenceUsed,
          selectedCandidateItem: input.selectedProject,
          matchingAngle: input.matchingAngle
        }),
        profileVersion: owner.profileVersion,
        researchVersion: company.researchVersion,
        matchVersion: match.promptVersion
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
    return NextResponse.json({ message, duplicate: false }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'The generated output is invalid and was not saved.', code: 'INVALID_MESSAGE' }, { status: 400 });
    }
    console.error('Saving generated message failed', error);
    return NextResponse.json({ error: 'Could not save this generated message.', code: 'SAVE_FAILED' }, { status: 500 });
  }
}
