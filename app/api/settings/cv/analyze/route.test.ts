import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIProviderError } from '@/lib/ai/storage';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  settings: {
    aiProvider: 'nvidia',
    nvidiaApiKey: 'nvapi-test-key-that-is-long-enough',
    structuredProfile: '{"fullName":"Previously Saved"}'
  }
}));

vi.mock('@/lib/ai/cv-analysis', () => ({
  analyzeCandidateProfile: mocks.analyze
}));

vi.mock('@/lib/settings', () => ({
  getOrCreateSettings: vi.fn(async () => ({ ...mocks.settings }))
}));

import { POST } from './route';

const cvText = `
  Private Candidate Marker
  Backend Developer
  Experience
  Built APIs using Node.js and PostgreSQL.
  Projects
  ApplyFlow application workflow.
  Education
  Example University.
`.repeat(5);

beforeEach(() => {
  mocks.analyze.mockReset();
});

describe('CV analyze route separation and failure preservation', () => {
  it('extracts manual text without automatically triggering AI analysis', async () => {
    const formData = new FormData();
    formData.set('manualText', cvText);
    const response = await POST(new Request('http://localhost/api/settings/cv/analyze', {
      method: 'POST',
      body: formData
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.extraction.text).toContain('Private Candidate Marker');
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it('returns a categorized provider error and does not alter the previous profile', async () => {
    const before = mocks.settings.structuredProfile;
    mocks.analyze.mockRejectedValue(new AIProviderError(
      'INVALID_API_KEY',
      'The NVIDIA API key is invalid or expired.',
      401,
      {
        model: 'qwen/qwen3.5-122b-a10b',
        status: 401,
        retryable: false,
        requestId: 'correlation-1'
      }
    ));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(new Request('http://localhost/api/settings/cv/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: cvText })
    }));
    const payload = await response.json();
    expect(response.status).toBe(401);
    expect(payload).toMatchObject({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        retryable: false,
        provider: 'nvidia',
        requestId: 'correlation-1'
      }
    });
    expect(mocks.settings.structuredProfile).toBe(before);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('Private Candidate Marker');
    expect(consoleError).toHaveBeenCalledWith('CV analysis failed', expect.objectContaining({
      code: 'INVALID_API_KEY',
      requestId: 'correlation-1'
    }));
    consoleError.mockRestore();
  });
});
