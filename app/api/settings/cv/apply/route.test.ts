import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assessCvExtraction } from '@/lib/cv/extract';
import { candidateProfileSchema } from '@/lib/ai/contracts';

const prismaMocks = vi.hoisted(() => ({
  failTransaction: false,
  upsert: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  createActivity: vi.fn(),
  transaction: vi.fn()
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userSettings: { upsert: prismaMocks.upsert, findUnique: prismaMocks.findUnique },
    candidateCompanyMatch: { updateMany: prismaMocks.updateMany },
    activityLog: { create: prismaMocks.createActivity },
    $transaction: prismaMocks.transaction
  }
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { POST } from './route';

const extraction = assessCvExtraction(`
  Example Candidate
  Backend Developer
  Experience
  Built APIs with Node.js.
  Projects
  ApplyFlow workflow application.
`.repeat(5), { fileKind: 'manual' });

const profile = candidateProfileSchema.parse({
  fullName: 'Example Candidate',
  targetRoles: ['Backend Developer'],
  skills: ['Node.js'],
  technicalSkills: ['Node.js']
});

function request() {
  return new Request('http://localhost/api/settings/cv/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      extraction,
      profile,
      providerMetadata: {
        provider: 'nvidia',
        model: 'qwen/qwen3.5-122b-a10b',
        fallbackUsed: false,
        generatedAt: new Date().toISOString(),
        latencyMs: 1234,
        requestId: 'request-1'
      },
      promptVersion: 'cv-structure-v2.1.0'
    })
  });
}

beforeEach(() => {
  prismaMocks.failTransaction = false;
  prismaMocks.upsert.mockReset().mockResolvedValue({ id: 'settings-1' });
  prismaMocks.findUnique.mockReset().mockResolvedValue(null);
  prismaMocks.updateMany.mockReset().mockResolvedValue({ count: 0 });
  prismaMocks.createActivity.mockReset().mockResolvedValue({ id: 'activity-1' });
  prismaMocks.transaction.mockReset().mockImplementation(async (operations: Array<Promise<unknown>>) => {
    if (prismaMocks.failTransaction) throw new Error('database unavailable');
    return Promise.all(operations);
  });
});

describe('CV profile persistence', () => {
  it('saves a valid profile with provider metadata and never returns settings or the API key', async () => {
    const response = await POST(request());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      profile: { fullName: 'Example Candidate' }
    });
    expect(prismaMocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        structuredProfile: expect.stringContaining('Example Candidate'),
        cvAnalysisProvider: 'nvidia',
        cvAnalysisLatencyMs: 1234,
        cvAnalysisRequestId: 'request-1'
      })
    }));
    expect(JSON.stringify(payload)).not.toContain('nvidiaApiKey');
  });

  it('returns DATABASE_SAVE_FAILED when the transaction fails', async () => {
    prismaMocks.failTransaction = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(request());
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload).toMatchObject({
      success: false,
      error: {
        code: 'DATABASE_SAVE_FAILED',
        retryable: true
      }
    });
    consoleError.mockRestore();
  });

  it('does not let an invalid AI heading overwrite a manually saved name', async () => {
    prismaMocks.findUnique.mockResolvedValue({
      id: 'settings-1',
      structuredProfile: JSON.stringify(candidateProfileSchema.parse({
        fullName: 'Amine El Mansouri',
        targetRoles: ['Backend Developer']
      })),
      profileManualFields: JSON.stringify(['fullName'])
    });
    const response = await POST(new Request('http://localhost/api/settings/cv/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        extraction,
        profile: { ...profile, fullName: 'Formation' },
        providerMetadata: {
          provider: 'nvidia',
          model: 'test-model',
          fallbackUsed: false,
          generatedAt: new Date().toISOString()
        },
        promptVersion: 'cv-test'
      })
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.profile.fullName).toBe('Amine El Mansouri');
    expect(prismaMocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        structuredProfile: expect.stringContaining('Amine El Mansouri')
      })
    }));
  });
});
