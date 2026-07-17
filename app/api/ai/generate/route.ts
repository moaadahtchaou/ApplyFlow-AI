import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  candidateCompanyMatchSchema,
  candidateProfileSchema,
  companyResearchSchema,
  messageRequestSchema
} from '@/lib/ai/contracts';
import { runMessagePipeline } from '@/lib/ai/message-pipeline';
import { logAiError, parseStored, publicError, stableHash } from '@/lib/ai/storage';
import { prisma } from '@/lib/prisma';
import { getOrCreateSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const input = messageRequestSchema.parse(await request.json());
    const [settings, company, contact, savedMatch] = await Promise.all([
      getOrCreateSettings(),
      prisma.company.findUnique({ where: { id: input.companyId } }),
      input.contactId ? prisma.contact.findUnique({ where: { id: input.contactId } }) : null,
      input.matchId ? prisma.candidateCompanyMatch.findUnique({ where: { id: input.matchId } }) : null
    ]);
    if (!company) return NextResponse.json({ error: 'Company not found.', code: 'NOT_FOUND' }, { status: 404 });
    if (contact && contact.companyId !== company.id) {
      return NextResponse.json({ error: 'The selected contact does not belong to this company.', code: 'CONTACT_MISMATCH' }, { status: 400 });
    }
    const candidate = parseStored(candidateProfileSchema, settings.structuredProfile);
    const research = parseStored(companyResearchSchema, company.researchData);
    const match = savedMatch ? parseStored(candidateCompanyMatchSchema, savedMatch.matchData) : null;
    if (!candidate || !research || !match || savedMatch?.status !== 'ready' || savedMatch.companyId !== company.id) {
      return NextResponse.json({
        error: 'A current candidate profile, company analysis, and calculated match are required before generation.',
        code: 'PIPELINE_NOT_READY'
      }, { status: 422 });
    }
    const expectedMatchHash = stableHash({
      profileVersion: settings.profileVersion,
      researchHash: company.researchInputHash,
      targetRole: input.targetRole,
      contactId: contact?.id,
      jobOfferText: input.jobOfferText,
      additionalInstructions: input.additionalInstructions
    });
    if (savedMatch.inputHash !== expectedMatchHash) {
      await prisma.candidateCompanyMatch.update({ where: { id: savedMatch.id }, data: { status: 'outdated' } });
      return NextResponse.json({ error: 'The selected match is outdated. Recalculate it before generation.', code: 'MATCH_OUTDATED' }, { status: 409 });
    }
    const result = await runMessagePipeline({
      candidate,
      company: research,
      match,
      contact: contact ? { name: contact.fullName, title: contact.title ?? undefined } : undefined,
      request: input
    }, {
      requestedProvider: settings.aiProvider,
      apiKey: settings.nvidiaApiKey
    });
    return NextResponse.json({
      message: result.message,
      evaluation: result.evaluation,
      firstEvaluation: result.firstEvaluation,
      match,
      matchId: savedMatch.id
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Review the generation fields and try again.', code: 'INVALID_REQUEST' }, { status: 400 });
    }
    logAiError('Message generation failed', error);
    const response = publicError(error, 'Could not generate a verified message.');
    return NextResponse.json(response.body, { status: response.status });
  }
}
