import { createHash } from 'node:crypto';
import type { z } from 'zod';

export type AIErrorCode =
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'ACCESS_DENIED'
  | 'MODEL_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'REQUEST_TIMEOUT'
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_PARAMETER'
  | 'EMPTY_RESPONSE'
  | 'INVALID_JSON'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'PROVIDER_UNAVAILABLE'
  | 'DATABASE_SAVE_FAILED'
  | 'UNKNOWN_AI_ERROR'
  | 'COMPANY_EVIDENCE_MISSING'
  | 'AI_UNSUPPORTED_OUTPUT';

export type AISafeDetails = {
  correlationId?: string;
  responseContentType?: string;
  responseExcerpt?: string;
  providerMessage?: string;
  networkCause?: string;
  zodIssues?: Array<{ path: string; message: string }>;
  optionalParametersRemoved?: string[];
  pendingWithoutPollingUrl?: boolean;
};

export function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function serializeValidated<S extends z.ZodTypeAny>(schema: S, value: unknown) {
  return JSON.stringify(schema.parse(value));
}

export function parseStored<S extends z.ZodTypeAny>(schema: S, value: string | null | undefined): z.output<S> | null {
  if (!value?.trim()) return null;
  try {
    return schema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

export function publicError(error: unknown, fallback: string) {
  if (error instanceof AIProviderError) {
    return {
      status: error.httpStatus,
      body: {
        success: false as const,
        error: {
          code: error.code,
          message: error.publicMessage,
          retryable: error.retryable,
          provider: error.provider,
          model: error.model,
          requestId: error.requestId,
          ...(process.env.NODE_ENV === 'development' && error.safeDetails
            ? {
                debug: {
                  status: error.status,
                  ...error.safeDetails
                }
              }
            : {})
        }
      }
    };
  }
  return {
    status: 500,
    body: {
      success: false as const,
      error: {
        code: 'UNKNOWN_AI_ERROR' as const,
        message: fallback,
        retryable: false,
        provider: 'nvidia' as const
      }
    }
  };
}

export class AIProviderError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    public readonly publicMessage: string,
    public readonly httpStatus = 502,
    options?: {
      cause?: unknown;
      provider?: 'nvidia' | 'mock';
      model?: string;
      status?: number;
      retryable?: boolean;
      requestId?: string;
      safeDetails?: AISafeDetails;
    }
  ) {
    super(publicMessage, { cause: options?.cause });
    this.name = 'AIProviderError';
    this.provider = options?.provider ?? 'nvidia';
    this.model = options?.model;
    this.status = options?.status;
    this.retryable = options?.retryable ?? false;
    this.requestId = options?.requestId;
    this.safeDetails = options?.safeDetails;
  }

  public readonly provider: 'nvidia' | 'mock';
  public readonly model?: string;
  public readonly status?: number;
  public readonly retryable: boolean;
  public readonly requestId?: string;
  public readonly safeDetails?: AISafeDetails;
}

export function logAiError(label: string, error: unknown) {
  if (error instanceof AIProviderError) {
    console.error(label, {
      code: error.code,
      provider: error.provider,
      model: error.model,
      status: error.status,
      retryable: error.retryable,
      requestId: error.requestId,
      details: error.safeDetails
    });
    return;
  }
  console.error(label, {
    code: 'UNKNOWN_AI_ERROR',
    message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error'
  });
}
