import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  executeStructured,
  extractAssistantText,
  extractJsonValue,
  type ProviderConfig
} from './provider';

const valueSchema = z.object({ value: z.string() });
const nvidiaConfig = {
  requestedProvider: 'nvidia',
  apiKey: 'nvapi-test-key-that-is-long-enough',
  model: 'test-model',
  baseUrl: 'http://nvidia.test/v1',
  timeoutMs: 2_000
};

function chat(content: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }]
  }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-request-id': 'provider-request-1' },
    ...init
  });
}

function providerFailure(status: number, message = 'provider error') {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': `request-${status}` }
  });
}

async function execute(config: ProviderConfig = nvidiaConfig) {
  return executeStructured({
    schema: valueSchema,
    systemPrompt: 'JSON only',
    userPrompt: 'Return a value',
    promptVersion: 'test-v1',
    config,
    mock: () => ({ value: 'local' })
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('AI provider execution', () => {
  it('labels explicit mock mode and works without an NVIDIA key', async () => {
    const result = await execute({ requestedProvider: 'mock', apiKey: '' });
    expect(result.data.value).toBe('local');
    expect(result.metadata).toMatchObject({
      provider: 'mock',
      model: 'deterministic-local',
      fallbackUsed: false
    });
    expect(result.metadata.latencyMs).toBeTypeOf('number');
    expect(result.metadata.requestId).toBeTruthy();
  });

  it('does not substitute mock output when NVIDIA is not configured', async () => {
    await expect(execute({
      ...nvidiaConfig,
      requestedProvider: 'nvidia',
      apiKey: ''
    })).rejects.toMatchObject({ code: 'MISSING_API_KEY', retryable: false });
  });

  it('handles HTTP 200 and sends the supported structured request shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chat('{"value":"remote"}'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await execute();
    expect(result.data.value).toBe('remote');
    expect(result.metadata).toMatchObject({
      provider: 'nvidia',
      model: 'test-model',
      fallbackUsed: false,
      requestId: 'provider-request-1'
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({
      model: 'test-model',
      stream: false,
      chat_template_kwargs: { enable_thinking: false }
    });
    expect(request).not.toHaveProperty('top_p');
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it('polls a bounded HTTP 202 response and returns its completed result', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: 'pending-1' }), {
        status: 202,
        headers: { location: 'http://nvidia.test/v1/status/pending-1', 'content-type': 'application/json' }
      }))
      .mockResolvedValueOnce(chat('{"value":"complete"}')));
    const result = await execute();
    expect(result.data.value).toBe('complete');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe('http://nvidia.test/v1/status/pending-1');
  });

  it('rejects HTTP 202 when no polling URL is supplied', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ request_id: 'pending-1' }), {
      status: 202,
      headers: { 'content-type': 'application/json' }
    })));
    await expect(execute()).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      status: 202,
      retryable: true
    });
  });

  it('retries HTTP 400 once without optional parameters', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(providerFailure(400, 'chat_template_kwargs is not supported'))
      .mockResolvedValueOnce(chat('{"value":"retried"}'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await execute();
    expect(result.data.value).toBe('retried');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toHaveProperty('chat_template_kwargs');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).not.toHaveProperty('chat_template_kwargs');
  });

  it.each([
    [400, 'INVALID_REQUEST', false],
    [401, 'INVALID_API_KEY', false],
    [403, 'ACCESS_DENIED', false],
    [404, 'MODEL_NOT_FOUND', false],
    [422, 'UNSUPPORTED_PARAMETER', false],
    [429, 'RATE_LIMITED', true],
    [500, 'PROVIDER_UNAVAILABLE', true]
  ])('categorizes HTTP %i as %s', async (status, code, retryable) => {
    const responses = status === 400 || status === 422 || status === 500
      ? [providerFailure(status), providerFailure(status)]
      : [providerFailure(status)];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(responses[0]).mockResolvedValueOnce(responses[1]));
    await expect(execute()).rejects.toMatchObject({ code, status, retryable });
  });

  it('does not retry authentication failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(providerFailure(401));
    vi.stubGlobal('fetch', fetchMock);
    await expect(execute()).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('separates quota exhaustion from rate limiting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(providerFailure(429, 'Account quota exhausted')));
    await expect(execute()).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED', retryable: false });
  });

  it('aborts at the configured timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    await expect(execute({ ...nvidiaConfig, timeoutMs: 100 })).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
      retryable: true
    });
  });

  it.each([
    { choices: [] },
    { choices: [{ message: {} }] }
  ])('rejects empty or missing message content', async (payload) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))));
    await expect(execute()).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
  });

  it('retries one empty successful NVIDIA completion before failing the operation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }))
      .mockResolvedValueOnce(chat('{"value":"recovered"}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(execute()).resolves.toMatchObject({ data: { value: 'recovered' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(retryBody.messages.at(-1).content).toContain('previous completion was empty');
  });

  it('retries one transient provider connection failure but not permanent provider errors', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed', { cause: new Error('ECONNRESET') }))
      .mockResolvedValueOnce(chat('{"value":"recovered"}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(execute()).resolves.toMatchObject({ data: { value: 'recovered' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('extracts array content parts', () => {
    expect(extractAssistantText({
      choices: [{ message: { content: [{ type: 'text', text: 'first' }, { type: 'text', text: 'second' }] } }]
    })).toBe('first\nsecond');
  });

  it('extracts markdown-wrapped JSON with reasoning before and text after it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(chat(
      'I considered the evidence first.\n```json\n{"value":"remote"}\n```\nDone.'
    )));
    await expect(execute()).resolves.toMatchObject({ data: { value: 'remote' } });
  });

  it('handles nested braces and braces inside quoted strings without a greedy regex', () => {
    expect(extractJsonValue('reasoning {"value":"a } brace","nested":{"items":[1,{"x":"{"}]}} trailing'))
      .toEqual({ value: 'a } brace', nested: { items: [1, { x: '{' }] } });
  });

  it('repairs invalid JSON exactly once and never falls back to Mock', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chat('not json'))
      .mockResolvedValueOnce(chat('still invalid'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(execute()).rejects.toMatchObject({ code: 'INVALID_JSON' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('repairs schema-invalid JSON once and reports schema failure if repair is still invalid', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chat('{"wrong":"field"}'))
      .mockResolvedValueOnce(chat('{"stillWrong":true}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(execute()).rejects.toMatchObject({ code: 'SCHEMA_VALIDATION_FAILED' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
