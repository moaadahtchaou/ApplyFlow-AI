import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeCompanyWebsite } from '@/lib/ai/company-analysis';
import { companyResearchSchema } from '@/lib/ai/contracts';
import { logAiError, parseStored, publicError, stableHash } from '@/lib/ai/storage';
import { WebsiteResearchError } from '@/lib/company/website-research';
import { prisma } from '@/lib/prisma';
import { getOrCreateSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) return NextResponse.json({ error: 'Company not found.', code: 'NOT_FOUND' }, { status: 404 });
  const inputHash = stableHash({ name: company.name, website: company.website, industry: company.industry });
  const research = parseStored(companyResearchSchema, company.researchData);
  const outdated = Boolean(company.researchInputHash && company.researchInputHash !== inputHash);
  const evidenceStatus = research && !research.personalizationHooks.length
    ? 'insufficient_evidence'
    : company.researchStatus;
  return NextResponse.json({
    research,
    status: outdated ? 'outdated' : evidenceStatus,
    lastAnalyzedAt: company.researchAnalyzedAt,
    confidenceScore: company.researchConfidence,
    providerMetadata: company.researchProvider ? {
      provider: company.researchProvider,
      model: company.researchModel ?? undefined,
      fallbackUsed: company.researchFallbackUsed,
      generatedAt: company.researchAnalyzedAt?.toISOString() ?? new Date().toISOString()
    } : undefined,
    warnings: (() => {
      try {
        return company.researchWarnings ? JSON.parse(company.researchWarnings) : [];
      } catch {
        return [];
      }
    })()
  });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) return NextResponse.json({ error: 'Company not found.', code: 'NOT_FOUND' }, { status: 404 });
  if (!company.website) {
    return NextResponse.json({ error: 'Add a public company website before analysis.', code: 'WEBSITE_REQUIRED' }, { status: 422 });
  }
  const claimed = await prisma.company.updateMany({
    where: { id, researchStatus: { not: 'analyzing' } },
    data: { researchStatus: 'analyzing' }
  });
  if (!claimed.count) {
    return NextResponse.json({ error: 'Company analysis is already running.', code: 'ANALYSIS_IN_PROGRESS' }, { status: 409 });
  }
  try {
    const settings = await getOrCreateSettings();
    const result = await analyzeCompanyWebsite(
      { name: company.name, website: company.website, industry: company.industry },
      { requestedProvider: settings.aiProvider, apiKey: settings.nvidiaApiKey }
    );
    const inputHash = stableHash({ name: company.name, website: company.website, industry: company.industry });
    const researchStatus = result.research.personalizationHooks.length ? 'ready' : 'insufficient_evidence';
    await prisma.$transaction([
      prisma.company.update({
        where: { id },
        data: {
          researchData: JSON.stringify(result.research),
          researchWarnings: JSON.stringify(result.research.fetchWarnings),
          researchStatus,
          researchVersion: result.promptVersion,
          researchProvider: result.metadata.provider,
          researchModel: result.metadata.model,
          researchFallbackUsed: result.metadata.fallbackUsed,
          researchInputHash: inputHash,
          researchAnalyzedAt: new Date(result.research.analyzedAt ?? result.metadata.generatedAt),
          researchConfidence: result.research.confidenceScore
        }
      }),
      prisma.candidateCompanyMatch.updateMany({ where: { companyId: id }, data: { status: 'outdated' } }),
      prisma.activityLog.create({
        data: {
          action: 'company_researched',
          entityType: 'Company',
          entityName: company.name,
          description: `${result.research.sources.length} public page(s) analyzed with ${result.metadata.provider}.`
        }
      })
    ]);
    revalidatePath('/ai-generator');
    revalidatePath(`/companies/${id}`);
    return NextResponse.json({
      research: result.research,
      providerMetadata: result.metadata,
      promptVersion: result.promptVersion,
      status: researchStatus
    });
  } catch (error) {
    await prisma.company.update({
      where: { id },
      data: { researchStatus: company.researchData ? company.researchStatus : 'failed' }
    });
    if (error instanceof WebsiteResearchError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof z.ZodError) console.error('Company research validation failed', error.issues);
    logAiError('Company analysis failed', error);
    const response = publicError(error, 'Company analysis failed. The previous valid research was preserved.');
    return NextResponse.json(response.body, { status: response.status });
  }
}
