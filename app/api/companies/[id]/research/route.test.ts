import { beforeEach, describe, expect, it, vi } from 'vitest';
import { companyResearchSchema } from '@/lib/ai/contracts';
import { AIProviderError } from '@/lib/ai/storage';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  company: {
    id: 'company-1',
    name: 'Company Example',
    website: 'https://company.example',
    industry: null as string | null,
    researchData: '',
    researchStatus: 'not_analyzed',
    researchInputHash: null as string | null,
    researchVersion: null as string | null,
    researchProvider: null as string | null,
    researchModel: null as string | null
  },
  update: vi.fn(),
  updateMany: vi.fn(),
  matchUpdateMany: vi.fn(),
  activityCreate: vi.fn(),
  transaction: vi.fn()
}));

vi.mock('@/lib/ai/company-analysis', () => ({
  analyzeCompanyWebsite: mocks.analyze
}));

vi.mock('@/lib/settings', () => ({
  getOrCreateSettings: vi.fn(async () => ({
    aiProvider: 'nvidia',
    nvidiaApiKey: 'nvapi-test-key-that-is-long-enough'
  }))
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: {
      findUnique: vi.fn(async () => ({ ...mocks.company })),
      updateMany: mocks.updateMany,
      update: mocks.update
    },
    candidateCompanyMatch: { updateMany: mocks.matchUpdateMany },
    activityLog: { create: mocks.activityCreate },
    $transaction: mocks.transaction
  }
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { POST } from './route';

const canonicalResearch = companyResearchSchema.parse({
  companyName: 'Company Example',
  website: 'https://company.example',
  summary: 'Company Example provides workflow software.',
  relevantProjects: [{
    name: 'Atlas',
    description: 'Workflow automation for recruiting teams.'
  }],
  personalizationHooks: {
    fact: 'Company Example provides workflow software.',
    relevance: 'Relevant to documented workflow experience.',
    sourceUrl: 'https://company.example/about'
  },
  sources: { url: 'https://company.example/about', title: 'About' },
  confidenceScore: 8,
  analyzedAt: '2026-07-17T12:00:00.000Z'
});

beforeEach(() => {
  Object.assign(mocks.company, {
    researchData: '',
    researchStatus: 'not_analyzed',
    researchInputHash: null,
    researchVersion: null,
    researchProvider: null,
    researchModel: null
  });
  mocks.analyze.mockReset();
  mocks.update.mockReset().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
    Object.assign(mocks.company, data);
    return Promise.resolve({ ...mocks.company });
  });
  mocks.updateMany.mockReset().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
    Object.assign(mocks.company, data);
    return Promise.resolve({ count: 1 });
  });
  mocks.matchUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  mocks.activityCreate.mockReset().mockResolvedValue({ id: 'activity-1' });
  mocks.transaction.mockReset().mockImplementation((operations: Array<Promise<unknown>>) => Promise.all(operations));
});

describe('company research API persistence', () => {
  it('persists only canonical normalized research after successful analysis', async () => {
    mocks.analyze.mockResolvedValue({
      research: canonicalResearch,
      metadata: {
        provider: 'nvidia',
        model: 'test-model',
        fallbackUsed: false,
        generatedAt: '2026-07-17T12:00:00.000Z',
        latencyMs: 500,
        requestId: 'request-1'
      },
      promptVersion: 'company-research-v2.1.0'
    });

    const response = await POST(
      new Request('http://localhost/api/companies/company-1/research', { method: 'POST' }),
      { params: Promise.resolve({ id: 'company-1' }) }
    );
    const payload = await response.json();
    const persisted = JSON.parse(mocks.company.researchData);

    expect(response.status).toBe(200);
    expect(payload.research.relevantProjects).toEqual([
      'Atlas — Workflow automation for recruiting teams.'
    ]);
    expect(persisted.personalizationHooks).toBeInstanceOf(Array);
    expect(persisted.personalizationHooks[0].fact).toContain('workflow software');
    expect(mocks.company.researchStatus).toBe('ready');
    expect(mocks.company.researchVersion).toBe('company-research-v2.1.0');
  });

  it('preserves previous valid research and returns the company-specific schema error', async () => {
    const previous = JSON.stringify(canonicalResearch);
    mocks.company.researchData = previous;
    mocks.company.researchStatus = 'ready';
    mocks.analyze.mockRejectedValue(new AIProviderError(
      'SCHEMA_VALIDATION_FAILED',
      'NVIDIA returned company research that did not match the expected structure.',
      502,
      {
        model: 'test-model',
        retryable: true,
        requestId: 'request-failure'
      }
    ));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(
      new Request('http://localhost/api/companies/company-1/research', { method: 'POST' }),
      { params: Promise.resolve({ id: 'company-1' }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      success: false,
      error: {
        code: 'SCHEMA_VALIDATION_FAILED',
        message: 'NVIDIA returned company research that did not match the expected structure.',
        requestId: 'request-failure'
      }
    });
    expect(mocks.company.researchData).toBe(previous);
    expect(mocks.company.researchStatus).toBe('ready');
    consoleError.mockRestore();
  });
});
