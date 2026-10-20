import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIProviderError } from '@/lib/ai/storage';

const mocks = vi.hoisted(() => ({
  execute: vi.fn()
}));

vi.mock('@/lib/ai/provider', () => ({
  executeStructured: mocks.execute
}));

vi.mock('@/lib/settings', () => ({
  getOrCreateSettings: vi.fn(async () => ({
    aiProvider: 'nvidia',
    nvidiaApiKey: 'nvapi-private-test-key-that-must-not-leak'
  }))
}));

import { POST } from './route';

beforeEach(() => {
  mocks.execute.mockReset();
});

describe('NVIDIA connection test route', () => {
  it('returns provider, model, and latency without touching CV data', async () => {
    mocks.execute.mockResolvedValue({
      data: { ok: true },
      metadata: {
        provider: 'nvidia',
        model: 'qwen/qwen3.5-122b-a10b',
        fallbackUsed: false,
        generatedAt: new Date().toISOString(),
        latencyMs: 321,
        requestId: 'request-success'
      }
    });
    const response = await POST();
    const payload = await response.json();
    expect(payload).toMatchObject({
      success: true,
      status: 'Connected',
      provider: 'nvidia',
      latencyMs: 321
    });
    expect(JSON.stringify(payload)).not.toContain('nvapi-private');
  });

  it('returns a safe categorized connection error', async () => {
    mocks.execute.mockRejectedValue(new AIProviderError(
      'INVALID_API_KEY',
      'The NVIDIA API key is invalid or expired.',
      401,
      {
        model: 'qwen/qwen3.5-122b-a10b',
        status: 401,
        retryable: false,
        requestId: 'request-failure'
      }
    ));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST();
    const payload = await response.json();
    expect(response.status).toBe(401);
    expect(payload).toMatchObject({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        retryable: false,
        requestId: 'request-failure'
      }
    });
    expect(JSON.stringify(payload)).not.toContain('nvapi-private');
    consoleError.mockRestore();
  });
});
