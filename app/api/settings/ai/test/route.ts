import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeStructured } from '@/lib/ai/provider';
import { logAiError, publicError } from '@/lib/ai/storage';
import { getOrCreateSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const connectionSchema = z.object({ ok: z.literal(true) });

export async function POST() {
  const startedAt = Date.now();
  try {
    const settings = await getOrCreateSettings();
    const result = await executeStructured({
      schema: connectionSchema,
      systemPrompt: 'Return valid JSON only. Do not include markdown or explanation.',
      userPrompt: 'Return exactly: {"ok":true}',
      promptVersion: 'nvidia-connection-test-v1.0.0',
      config: {
        requestedProvider: 'nvidia',
        apiKey: settings.nvidiaApiKey
      },
      mock: () => ({ ok: true as const }),
      temperature: 0,
      maxTokens: 40,
      allowRepair: false,
      operationLabel: 'the NVIDIA connection test',
      validationErrorMessage: 'NVIDIA returned an invalid connection-test response.'
    });
    return NextResponse.json({
      success: true,
      status: 'Connected',
      provider: result.metadata.provider,
      model: result.metadata.model,
      latencyMs: result.metadata.latencyMs ?? Date.now() - startedAt,
      requestId: result.metadata.requestId
    });
  } catch (error) {
    logAiError('NVIDIA connection test failed', error);
    const response = publicError(error, 'The NVIDIA connection test failed.');
    return NextResponse.json({
      ...response.body,
      latencyMs: Date.now() - startedAt
    }, { status: response.status });
  }
}
