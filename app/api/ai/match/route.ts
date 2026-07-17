import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  candidateProfileSchema,
  companyResearchSchema,
  matchRequestSchema
} from '@/lib/ai/contracts';
import { createCandidateCompanyMatch, MATCH_PROMPT_VERSION } from '@/lib/ai/matching';
import { parseStored, stableHash } from '@/lib/ai/storage';
import { prisma } from '@/lib/prisma';
import { getOrCreateSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const input = matchRequestSchema.parse(await request.json());
    const [settings, company, contact] = await Promise.all([
      getOrCreateSettings(),
      prisma.company.findUnique({ where: { id: input.companyId } }),
      input.contactId ? prisma.contact.findUnique({ where: { id: input.contactId } }) : null
    ]);
    if (!company) return NextResponse.json({ error: 'Company not found.', code: 'NOT_FOUND' }, { status: 404 });
    if (contact && contact.companyId !== company.id) {
      return NextResponse.json({ error: 'The selected contact does not belong to this company.', code: 'CONTACT_MISMATCH' }, { status: 400 });
    }
    const candidate = parseStored(candidateProfileSchema, settings.structuredProfile);
    const research = parseStored(companyResearchSchema, company.researchData);
    if (!candidate || settings.cvAnalysisStatus !== 'ready') {
      return NextResponse.json({ error: 'Analyze and save a valid structured CV profile first.', code: 'CANDIDATE_PROFILE_REQUIRED' }, { status: 422 });
    }
    const researchHash = stableHash({ name: company.name, website: company.website, industry: company.industry });
    if (!research || company.researchStatus !== 'ready' || company.researchInputHash !== researchHash) {
      return NextResponse.json({ error: 'Analyze or re-analyze this company before matching.', code: 'COMPANY_RESEARCH_REQUIRED' }, { status: 422 });
    }

    const match = createCandidateCompanyMatch({
      candidate,
      company: research,
      targetRole: input.targetRole,
      contact: contact ? { name: contact.fullName, title: contact.title ?? undefined } : undefined,
      jobOfferText: input.jobOfferText,
      additionalInstructions: input.additionalInstructions
    });
    const inputHash = stableHash({
      profileVersion: settings.profileVersion,
      researchHash: company.researchInputHash,
      targetRole: input.targetRole,
      contactId: contact?.id,
      jobOfferText: input.jobOfferText,
      additionalInstructions: input.additionalInstructions
    });
    await prisma.candidateCompanyMatch.updateMany({
      where: { companyId: company.id, status: 'ready' },
      data: { status: 'outdated' }
    });
    const matchStatus = match.matchPoints.length > 0 && match.matchScore >= 5 ? 'ready' : 'needs_review';
    const saved = await prisma.candidateCompanyMatch.create({
      data: {
        companyId: company.id,
        contactId: contact?.id,
        targetRole: input.targetRole,
        jobOfferHash: input.jobOfferText ? stableHash(input.jobOfferText) : null,
        inputHash,
        matchData: JSON.stringify(match),
        matchScore: match.matchScore,
        promptVersion: MATCH_PROMPT_VERSION,
        status: matchStatus
      }
    });
    return NextResponse.json({ match, matchId: saved.id, promptVersion: MATCH_PROMPT_VERSION, status: matchStatus });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Review the matching fields and try again.', code: 'INVALID_REQUEST' }, { status: 400 });
    }
    console.error('Candidate-company matching failed', error);
    return NextResponse.json({ error: 'Could not calculate the candidate-company match.', code: 'MATCH_FAILED' }, { status: 500 });
  }
}
