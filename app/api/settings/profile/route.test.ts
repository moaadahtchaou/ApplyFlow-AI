import { beforeEach, describe, expect, it, vi } from 'vitest';
import { candidateProfileSchema } from '@/lib/ai/contracts';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  createActivity: vi.fn(),
  transaction: vi.fn()
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userSettings: { findUnique: mocks.findUnique },
    $transaction: mocks.transaction
  }
}));

import { PUT } from './route';

const saved = {
  id: 'settings-1',
  singletonKey: 'default',
  structuredProfile: JSON.stringify(candidateProfileSchema.parse({
    fullName: 'Previous Candidate',
    targetRoles: ['Developer'],
    evidenceSummary: ['Built production web applications.']
  })),
  profileManualFields: '[]',
  candidateProfile: 'Built production web applications.',
  defaultSignature: 'Best regards',
  fullName: 'Previous Candidate',
  email: '',
  phone: '',
  location: '',
  targetRole: 'Developer',
  experienceSummary: 'Built production web applications.',
  skills: 'TypeScript',
  languages: 'English',
  preferredLocations: '',
  cvText: 'Previous Candidate\nBuilt production web applications.',
  profileVersion: 2
};

function request(fullName: string) {
  return new Request('http://localhost/api/settings/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      candidateProfile: saved.candidateProfile,
      defaultSignature: saved.defaultSignature,
      fullName,
      email: '',
      phone: '',
      location: '',
      targetRole: saved.targetRole,
      experienceSummary: saved.experienceSummary,
      skills: saved.skills,
      languages: saved.languages,
      preferredLocations: '',
      cvText: saved.cvText
    })
  });
}

beforeEach(() => {
  mocks.findUnique.mockReset().mockResolvedValue(saved);
  mocks.upsert.mockReset().mockImplementation(async ({ update }) => ({
    ...saved,
    ...update,
    fullName: update.fullName,
    profileVersion: 3
  }));
  mocks.updateMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.createActivity.mockReset().mockResolvedValue({ id: 'activity-1' });
  mocks.transaction.mockReset().mockImplementation(async (callback) => callback({
    userSettings: { upsert: mocks.upsert },
    candidateCompanyMatch: { updateMany: mocks.updateMany },
    activityLog: { create: mocks.createActivity }
  }));
});

describe('manual candidate profile saving', () => {
  it('returns the persisted value and marks previous matches outdated', async () => {
    const response = await PUT(request('Amine El Mansouri'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.settings.fullName).toBe('Amine El Mansouri');
    expect(payload.profile.fullName).toBe('Amine El Mansouri');
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        fullName: 'Amine El Mansouri',
        profileManualFields: expect.stringContaining('fullName')
      })
    }));
    expect(mocks.updateMany).toHaveBeenCalledWith({ data: { status: 'outdated' } });
  });

  it('rejects a section heading before writing it', async () => {
    const response = await PUT(request('Formation'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_FULL_NAME' }
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
