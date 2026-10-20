import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUniqueMessage: vi.fn(),
  findFirstMessage: vi.fn(),
  createMessage: vi.fn(),
  deleteMessage: vi.fn(),
  findCompany: vi.fn(),
  findContact: vi.fn(),
  findMatch: vi.fn(),
  createActivity: vi.fn(),
  transaction: vi.fn(),
  getSettings: vi.fn()
}));

vi.mock('@/lib/settings', () => ({
  getOrCreateSettings: mocks.getSettings
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    generatedMessage: {
      findMany: mocks.findMany,
      findUnique: mocks.findUniqueMessage,
      findFirst: mocks.findFirstMessage,
      create: mocks.createMessage,
      delete: mocks.deleteMessage
    },
    company: { findUnique: mocks.findCompany },
    contact: { findUnique: mocks.findContact },
    candidateCompanyMatch: { findUnique: mocks.findMatch },
    activityLog: { create: mocks.createActivity },
    $transaction: mocks.transaction
  }
}));

import { GET as listMessages, POST as saveMessage } from './route';
import { DELETE as deleteMessage, GET as getMessage } from './[id]/route';

const evaluation = {
  companySpecific: true,
  usesVerifiedCompanyFact: true,
  usesCandidateEvidence: true,
  relationshipIsClear: true,
  hasInventedFacts: false,
  treatsSpontaneousApplicationCorrectly: true,
  genericPhraseCount: 0,
  personalizationScore: 9,
  evidenceScore: 9,
  naturalnessScore: 9,
  clarityScore: 9,
  overallScore: 9,
  problems: [],
  improvementInstructions: []
};

function saveRequest() {
  return new Request('http://localhost/api/ai/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      companyId: 'company-1',
      contactId: 'contact-1',
      matchId: 'match-1',
      purpose: 'Web Developer',
      signature: 'Best regards',
      messageType: 'spontaneous_application',
      tone: 'professional',
      language: 'English',
      subject: 'Spontaneous application — Web Developer',
      body: 'Hello, this persisted message contains enough verified candidate and company evidence to satisfy the saved message validation rules.',
      companyFactUsed: 'The company delivers custom websites.',
      companyFactSourceUrl: 'https://company.example/services',
      candidateEvidenceUsed: 'Delivered production websites for clients.',
      selectedProject: 'Agency Web Developer',
      matchingAngle: 'Client website delivery',
      providerMetadata: {
        provider: 'nvidia',
        model: 'test-model',
        fallbackUsed: false,
        generatedAt: '2026-07-18T10:00:00.000Z'
      },
      promptVersion: 'message-v1',
      evaluation,
      automaticRewriteUsed: true
    })
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getSettings.mockResolvedValue({ id: 'owner-1', profileVersion: 7 });
  mocks.findMany.mockResolvedValue([]);
  mocks.findUniqueMessage.mockResolvedValue(null);
  mocks.findFirstMessage.mockResolvedValue(null);
  mocks.findCompany.mockResolvedValue({
    id: 'company-1',
    name: 'Example Company',
    website: 'https://company.example',
    researchVersion: 'research-v1'
  });
  mocks.findContact.mockResolvedValue({
    id: 'contact-1',
    companyId: 'company-1',
    fullName: 'Hiring Contact',
    title: 'Manager',
    email: 'contact@company.example',
    phone: null,
    linkedinUrl: null
  });
  mocks.findMatch.mockResolvedValue({
    id: 'match-1',
    companyId: 'company-1',
    status: 'limited',
    promptVersion: 'match-v1'
  });
  mocks.createMessage.mockResolvedValue({ id: 'message-1' });
  mocks.createActivity.mockResolvedValue({ id: 'activity-1' });
  mocks.deleteMessage.mockResolvedValue({ id: 'message-1' });
  mocks.transaction.mockImplementation((operations: Array<Promise<unknown>>) => Promise.all(operations));
});

describe('saved message API', () => {
  it('lists only the active workspace messages newest first', async () => {
    await listMessages();
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerSettingsId: 'owner-1' },
      orderBy: { createdAt: 'desc' }
    }));
  });

  it('saves an immutable snapshot and deduplicates repeated save clicks', async () => {
    const first = await saveMessage(saveRequest());
    expect(first.status).toBe(201);
    expect(mocks.createMessage).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerSettingsId: 'owner-1',
        companyNameSnapshot: 'Example Company',
        companyWebsiteSnapshot: 'https://company.example',
        contactSnapshot: expect.stringContaining('Hiring Contact'),
        evidenceSnapshot: expect.stringContaining('Client website delivery'),
        profileVersion: 7,
        researchVersion: 'research-v1',
        matchVersion: 'match-v1'
      })
    });

    mocks.findUniqueMessage.mockResolvedValue({ id: 'message-1' });
    const duplicate = await saveMessage(saveRequest());
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()).duplicate).toBe(true);
    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
  });

  it('does not return a message owned by another workspace', async () => {
    const response = await getMessage(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'other-owner-message' })
    });
    expect(response.status).toBe(404);
    expect(mocks.findFirstMessage).toHaveBeenCalledWith({
      where: { id: 'other-owner-message', ownerSettingsId: 'owner-1' }
    });
  });

  it('deletes only the selected owned message', async () => {
    mocks.findFirstMessage.mockResolvedValue({ id: 'message-1', subject: 'Saved subject' });
    const response = await deleteMessage(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'message-1' })
    });
    expect(response.status).toBe(200);
    expect(mocks.deleteMessage).toHaveBeenCalledWith({ where: { id: 'message-1' } });
    expect(mocks.findCompany).not.toHaveBeenCalled();
    expect(mocks.findContact).not.toHaveBeenCalled();
  });
});
