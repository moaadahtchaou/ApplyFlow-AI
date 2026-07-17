import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { aiExecutionMetadataSchema, type AIExecutionMetadata } from '@/lib/ai/contracts';
import { AIProviderError, type AISafeDetails } from '@/lib/ai/storage';

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'qwen/qwen3.5-122b-a10b';
const DEFAULT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1_250;

export type ProviderConfig = {
  requestedProvider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
};

type ResolvedProviderConfig = {
  provider: 'nvidia' | 'mock';
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
};

type StructuredExecution<S extends z.ZodTypeAny> = {
  data: z.output<S>;
  metadata: AIExecutionMetadata;
};

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatResponse = {
  id?: string;
  request_id?: string;
  status_url?: string;
  polling_url?: string;
  url?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type NvidiaResult = {
  text: string;
  requestId: string;
  responseContentType?: string;
};

function configuredTimeout(value?: number) {
  const fromEnvironment = Number(process.env.NVIDIA_TIMEOUT_MS);
  const candidate = value ?? (Number.isFinite(fromEnvironment) ? fromEnvironment : DEFAULT_TIMEOUT_MS);
  return Math.max(100, Math.min(300_000, Math.round(candidate)));
}

function normalizedBaseUrl(value?: string) {
  const raw = value?.trim() || process.env.NVIDIA_BASE_URL?.trim() || DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AIProviderError('INVALID_REQUEST', 'The configured NVIDIA base URL is invalid.', 500, {
      retryable: false,
      safeDetails: { providerMessage: 'NVIDIA_BASE_URL is not a valid URL.' }
    });
  }
  if (url.protocol !== 'https:' && process.env.NODE_ENV !== 'test') {
    throw new AIProviderError('INVALID_REQUEST', 'The configured NVIDIA base URL must use HTTPS.', 500, {
      retryable: false
    });
  }
  return url.toString().replace(/\/+$/, '');
}

export function resolveProvider(config?: ProviderConfig): ResolvedProviderConfig {
  const requestedProvider = config?.requestedProvider?.trim() || process.env.AI_PROVIDER?.trim() || 'mock';
  const apiKey = config?.apiKey?.trim() || process.env.NVIDIA_API_KEY?.trim() || '';
  const model = config?.model?.trim() || process.env.NVIDIA_MODEL?.trim() || DEFAULT_MODEL;

  if (requestedProvider !== 'mock' && requestedProvider !== 'nvidia') {
    throw new AIProviderError('INVALID_REQUEST', 'AI provider must be either Mock or NVIDIA.', 500, {
      retryable: false,
      model
    });
  }
  if (requestedProvider === 'nvidia' && !apiKey) {
    throw new AIProviderError('MISSING_API_KEY', 'The NVIDIA API key is missing.', 503, {
      retryable: false,
      model
    });
  }
  return {
    provider: requestedProvider,
    apiKey,
    model,
    baseUrl: requestedProvider === 'mock' ? DEFAULT_BASE_URL : normalizedBaseUrl(config?.baseUrl),
    timeoutMs: configuredTimeout(config?.timeoutMs)
  };
}

function responseExcerpt(value: string) {
  if (process.env.NODE_ENV !== 'development') return undefined;
  const keys = [...value.matchAll(/"([A-Za-z][A-Za-z0-9_]*)"\s*:/g)]
    .slice(0, 30)
    .map((match) => match[1]);
  return `Response length: ${value.length}; JSON keys detected: ${keys.join(', ') || 'none'}; ` +
    `codeFence: ${/```/.test(value) ? 'yes' : 'no'}`;
}

function safeProviderMessage(value: unknown) {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!value || typeof value !== 'object') return undefined;
  const object = value as Record<string, unknown>;
  const nested = object.error && typeof object.error === 'object'
    ? object.error as Record<string, unknown>
    : object;
  const message = nested.message ?? nested.detail ?? nested.error;
  return typeof message === 'string' ? message.replace(/\s+/g, ' ').trim().slice(0, 500) : undefined;
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') ?? undefined;
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  return { contentType, text, data };
}

function classifyHttpError(
  status: number,
  providerMessage: string | undefined,
  config: ResolvedProviderConfig,
  requestId: string,
  details: AISafeDetails
) {
  const message = providerMessage?.toLowerCase() ?? '';
  const common = {
    provider: 'nvidia' as const,
    model: config.model,
    status,
    requestId,
    safeDetails: { ...details, providerMessage }
  };
  if (status === 400) {
    return new AIProviderError('INVALID_REQUEST', 'NVIDIA rejected the request as invalid.', 400, {
      ...common,
      retryable: false
    });
  }
  if (status === 401) {
    return new AIProviderError('INVALID_API_KEY', 'The NVIDIA API key is invalid or expired.', 401, {
      ...common,
      retryable: false
    });
  }
  if (status === 403) {
    return new AIProviderError('ACCESS_DENIED', 'Your NVIDIA account does not have access to this model.', 403, {
      ...common,
      retryable: false
    });
  }
  if (status === 404) {
    return new AIProviderError('MODEL_NOT_FOUND', 'The configured NVIDIA model or endpoint was not found.', 404, {
      ...common,
      retryable: false
    });
  }
  if (status === 408) {
    return new AIProviderError('REQUEST_TIMEOUT', 'The NVIDIA request timed out.', 504, {
      ...common,
      retryable: true
    });
  }
  if (status === 422) {
    return new AIProviderError('UNSUPPORTED_PARAMETER', 'NVIDIA rejected an unsupported request parameter.', 422, {
      ...common,
      retryable: false
    });
  }
  if (status === 429) {
    const quota = /quota|credit|balance|billing/.test(message);
    return new AIProviderError(
      quota ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED',
      quota ? 'The NVIDIA account quota is exhausted.' : 'The NVIDIA rate limit was reached.',
      429,
      { ...common, retryable: !quota }
    );
  }
  if (status >= 500 && status <= 599) {
    return new AIProviderError('PROVIDER_UNAVAILABLE', 'NVIDIA is temporarily unavailable.', 503, {
      ...common,
      retryable: true
    });
  }
  return new AIProviderError('UNKNOWN_AI_ERROR', 'NVIDIA could not complete this request.', 502, {
    ...common,
    retryable: false
  });
}

function pollingUrl(response: Response, body: ChatResponse, baseUrl: string) {
  const value = response.headers.get('location') ?? body.status_url ?? body.polling_url ?? body.url;
  if (!value) return null;
  try {
    const candidate = new URL(value, `${baseUrl}/`);
    const configured = new URL(baseUrl);
    if (candidate.protocol !== 'https:' && process.env.NODE_ENV !== 'test') return null;
    if (candidate.origin !== configured.origin) return null;
    return candidate.toString();
  } catch {
    return null;
  }
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

export function extractAssistantText(response: unknown): string {
  const value = response as ChatResponse;
  const content = value?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part?.text === 'string' ? part.text : '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function parseJsonCandidate(candidate: string) {
  try {
    return { found: true as const, value: JSON.parse(candidate) as unknown };
  } catch {
    return { found: false as const };
  }
}

export function extractJsonValue(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  for (let start = 0; start < cleaned.length; start += 1) {
    const opening = cleaned[start];
    if (opening !== '{' && opening !== '[') continue;
    const stack: string[] = [opening];
    let inString = false;
    let escaped = false;
    for (let index = start + 1; index < cleaned.length; index += 1) {
      const character = cleaned[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === '{' || character === '[') stack.push(character);
      if (character === '}' || character === ']') {
        const expected = character === '}' ? '{' : '[';
        if (stack.at(-1) !== expected) break;
        stack.pop();
        if (!stack.length) {
          const result = parseJsonCandidate(cleaned.slice(start, index + 1));
          if (result.found) return result.value;
          break;
        }
      }
    }
  }
  throw new AIProviderError('INVALID_JSON', 'NVIDIA returned invalid JSON.', 502, {
    retryable: true,
    safeDetails: { responseExcerpt: responseExcerpt(cleaned) }
  });
}

async function pollNvidia(
  url: string,
  config: ResolvedProviderConfig,
  controller: AbortController,
  deadline: number,
  correlationId: string
): Promise<NvidiaResult> {
  let nextUrl = url;
  while (Date.now() < deadline) {
    await wait(Math.min(POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())), controller.signal);
    const response = await fetch(nextUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store'
    });
    const body = await readResponseBody(response);
    const data = body.data as ChatResponse;
    const requestId = response.headers.get('x-request-id') ?? data.request_id ?? data.id ?? correlationId;
    if (response.status === 202) {
      const updated = pollingUrl(response, data, config.baseUrl);
      if (!updated) {
        throw new AIProviderError(
          'PROVIDER_UNAVAILABLE',
          'NVIDIA accepted the request but did not provide a polling URL.',
          503,
          {
            provider: 'nvidia',
            model: config.model,
            status: 202,
            retryable: true,
            requestId,
            safeDetails: {
              correlationId,
              responseContentType: body.contentType,
              pendingWithoutPollingUrl: true
            }
          }
        );
      }
      nextUrl = updated;
      continue;
    }
    if (!response.ok) {
      throw classifyHttpError(response.status, safeProviderMessage(body.data), config, requestId, {
        correlationId,
        responseContentType: body.contentType
      });
    }
    const text = extractAssistantText(data);
    if (!text) {
      throw new AIProviderError('EMPTY_RESPONSE', 'NVIDIA returned an empty response.', 502, {
        provider: 'nvidia',
        model: config.model,
        status: response.status,
        retryable: true,
        requestId,
        safeDetails: { correlationId, responseContentType: body.contentType }
      });
    }
    return { text, requestId, responseContentType: body.contentType };
  }
  throw new DOMException('Polling exceeded timeout', 'AbortError');
}

async function requestNvidia(
  messages: ChatMessage[],
  config: ResolvedProviderConfig,
  options: {
    temperature?: number;
    maxTokens?: number;
    structured?: boolean;
    correlationId: string;
    operationLabel: string;
  }
): Promise<NvidiaResult> {
  const controller = new AbortController();
  const deadline = Date.now() + config.timeoutMs;
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const endpoint = `${config.baseUrl}/chat/completions`;
  const optionalBody = options.structured
    ? { chat_template_kwargs: { enable_thinking: false } }
    : {};
  let optionalParameters = Object.keys(optionalBody);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: options.temperature ?? 0.1,
          max_tokens: options.maxTokens ?? 2500,
          stream: false,
          ...(attempt === 0 ? optionalBody : {})
        }),
        signal: controller.signal,
        cache: 'no-store'
      });
      const body = await readResponseBody(response);
      const data = body.data as ChatResponse;
      const requestId = response.headers.get('x-request-id') ?? data.request_id ?? data.id ?? options.correlationId;

      if (response.status === 202) {
        const url = pollingUrl(response, data, config.baseUrl);
        if (!url) {
          throw new AIProviderError(
            'PROVIDER_UNAVAILABLE',
            'NVIDIA accepted the request but did not provide a polling URL.',
            503,
            {
              provider: 'nvidia',
              model: config.model,
              status: 202,
              retryable: true,
              requestId,
              safeDetails: {
                correlationId: options.correlationId,
                responseContentType: body.contentType,
                pendingWithoutPollingUrl: true
              }
            }
          );
        }
        return await pollNvidia(url, config, controller, deadline, options.correlationId);
      }

      if (!response.ok) {
        if (
          attempt === 0 &&
          optionalParameters.length > 0 &&
          (response.status === 400 || response.status === 422)
        ) {
          optionalParameters = [];
          continue;
        }
        throw classifyHttpError(response.status, safeProviderMessage(body.data), config, requestId, {
          correlationId: options.correlationId,
          responseContentType: body.contentType,
          optionalParametersRemoved: attempt === 1 ? ['chat_template_kwargs'] : undefined
        });
      }

      const text = extractAssistantText(data);
      if (!text) {
        throw new AIProviderError('EMPTY_RESPONSE', 'NVIDIA returned an empty response.', 502, {
          provider: 'nvidia',
          model: config.model,
          status: response.status,
          retryable: true,
          requestId,
          safeDetails: {
            correlationId: options.correlationId,
            responseContentType: body.contentType
          }
        });
      }
      return { text, requestId, responseContentType: body.contentType };
    }
    throw new AIProviderError('UNKNOWN_AI_ERROR', 'NVIDIA could not complete this request.', 502, {
      provider: 'nvidia',
      model: config.model,
      retryable: false,
      requestId: options.correlationId
    });
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    const aborted = error instanceof Error && error.name === 'AbortError';
    if (aborted) {
      throw new AIProviderError(
        'REQUEST_TIMEOUT',
        `NVIDIA took too long to complete ${options.operationLabel}. Please retry or temporarily use Mock mode.`,
        504,
        {
          cause: error,
          provider: 'nvidia',
          model: config.model,
          retryable: true,
          requestId: options.correlationId,
          safeDetails: { correlationId: options.correlationId }
        }
      );
    }
    const cause = error instanceof Error && error.cause instanceof Error
      ? `${error.cause.name}: ${error.cause.message}`.slice(0, 300)
      : error instanceof Error
        ? `${error.name}: ${error.message}`.slice(0, 300)
        : 'Unknown network error';
    throw new AIProviderError(
      'PROVIDER_UNAVAILABLE',
      'The ApplyFlow server could not reach NVIDIA. Check the server network, proxy, DNS, or TLS configuration.',
      503,
      {
        cause: error,
        provider: 'nvidia',
        model: config.model,
        retryable: true,
        requestId: options.correlationId,
        safeDetails: {
          correlationId: options.correlationId,
          networkCause: cause
        }
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

function schemaIssues(error: z.ZodError) {
  return error.issues.slice(0, 20).map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message
  }));
}

function validateStructured<S extends z.ZodTypeAny>(
  schema: S,
  text: string,
  context: {
    config: ResolvedProviderConfig;
    requestId: string;
    contentType?: string;
    correlationId: string;
    validationErrorMessage: string;
  }
) {
  let json: unknown;
  try {
    json = extractJsonValue(text);
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw new AIProviderError('INVALID_JSON', 'NVIDIA returned invalid JSON.', 502, {
        provider: 'nvidia',
        model: context.config.model,
        retryable: true,
        requestId: context.requestId,
        safeDetails: {
          correlationId: context.correlationId,
          responseContentType: context.contentType,
          responseExcerpt: responseExcerpt(text)
        }
      });
    }
    throw error;
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new AIProviderError(
      'SCHEMA_VALIDATION_FAILED',
      context.validationErrorMessage,
      502,
      {
        provider: 'nvidia',
        model: context.config.model,
        retryable: true,
        requestId: context.requestId,
        safeDetails: {
          correlationId: context.correlationId,
          responseContentType: context.contentType,
          responseExcerpt: responseExcerpt(text),
          zodIssues: schemaIssues(parsed.error)
        }
      }
    );
  }
  return parsed.data;
}

export async function executeStructured<S extends z.ZodTypeAny>(options: {
  schema: S;
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
  config?: ProviderConfig;
  mock: () => z.input<S> | z.output<S>;
  temperature?: number;
  maxTokens?: number;
  allowRepair?: boolean;
  operationLabel?: string;
  validationErrorMessage?: string;
}): Promise<StructuredExecution<S>> {
  const config = resolveProvider(options.config);
  const generatedAt = new Date().toISOString();
  const startedAt = Date.now();
  const executionDeadline = startedAt + config.timeoutMs;
  const boundedConfig = () => ({
    ...config,
    timeoutMs: Math.max(1, executionDeadline - Date.now())
  });
  const correlationId = randomUUID();
  const operationLabel = options.operationLabel ?? 'the AI request';
  const validationErrorMessage = options.validationErrorMessage ??
    'NVIDIA returned data that did not match the expected structure.';

  if (config.provider === 'mock') {
    return {
      data: options.schema.parse(options.mock()),
      metadata: aiExecutionMetadataSchema.parse({
        provider: 'mock',
        model: 'deterministic-local',
        fallbackUsed: false,
        generatedAt,
        latencyMs: Date.now() - startedAt,
        requestId: correlationId
      })
    };
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: options.userPrompt }
  ];
  let first: NvidiaResult;
  try {
    first = await requestNvidia(messages, boundedConfig(), {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      structured: true,
      correlationId,
      operationLabel
    });
  } catch (error) {
    if (
      !(error instanceof AIProviderError) ||
      !['EMPTY_RESPONSE', 'PROVIDER_UNAVAILABLE'].includes(error.code) ||
      error.status === 202
    ) throw error;
    first = await requestNvidia([
      ...messages,
      {
        role: 'user',
        content: error.code === 'EMPTY_RESPONSE'
          ? 'The previous completion was empty. Return the requested JSON now, with no markdown or explanation.'
          : 'Retry the same request once after a transient provider connection failure. Return JSON only.'
      }
    ], boundedConfig(), {
      temperature: 0,
      maxTokens: options.maxTokens,
      structured: true,
      correlationId,
      operationLabel
    });
  }
  try {
    const data = validateStructured(options.schema, first.text, {
      config,
      requestId: first.requestId,
      contentType: first.responseContentType,
      correlationId,
      validationErrorMessage
    });
    return {
      data,
      metadata: {
        provider: 'nvidia',
        model: config.model,
        fallbackUsed: false,
        generatedAt,
        latencyMs: Date.now() - startedAt,
        requestId: first.requestId
      }
    };
  } catch (firstError) {
    if (!(firstError instanceof AIProviderError)) throw firstError;
    if (options.allowRepair === false || !['INVALID_JSON', 'SCHEMA_VALIDATION_FAILED'].includes(firstError.code)) {
      throw firstError;
    }
    const repair = await requestNvidia([
      {
        role: 'system',
        content:
          'Convert the supplied model response into valid JSON matching the exact requested schema. ' +
          'Return JSON only. Do not add facts, explanations, or markdown.'
      },
      {
        role: 'user',
        content:
          `${options.userPrompt.slice(0, 12_000)}\n\nPrevious response to repair:\n${first.text.slice(0, 16_000)}`
      }
    ], boundedConfig(), {
      temperature: 0,
      maxTokens: options.maxTokens,
      structured: true,
      correlationId,
      operationLabel
    });
    return {
      data: validateStructured(options.schema, repair.text, {
        config,
        requestId: repair.requestId,
        contentType: repair.responseContentType,
        correlationId,
        validationErrorMessage
      }),
      metadata: {
        provider: 'nvidia',
        model: config.model,
        fallbackUsed: false,
        generatedAt,
        latencyMs: Date.now() - startedAt,
        requestId: repair.requestId
      }
    };
  }
}

export function getProviderStatus(config?: ProviderConfig) {
  const requestedProvider = config?.requestedProvider?.trim() || process.env.AI_PROVIDER?.trim() || 'mock';
  const nvidiaConfigured = Boolean(config?.apiKey?.trim() || process.env.NVIDIA_API_KEY?.trim());
  const model = config?.model?.trim() || process.env.NVIDIA_MODEL?.trim() || DEFAULT_MODEL;
  return {
    provider: requestedProvider === 'nvidia' ? 'nvidia' as const : 'mock' as const,
    requestedProvider,
    nvidiaConfigured,
    model,
    mockMode: requestedProvider !== 'nvidia',
    baseUrl: requestedProvider === 'nvidia' ? normalizedBaseUrl(config?.baseUrl) : DEFAULT_BASE_URL,
    timeoutMs: configuredTimeout(config?.timeoutMs)
  };
}
