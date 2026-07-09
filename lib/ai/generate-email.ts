import { generateMockEmail } from '@/lib/ai/mock';
import { generateWithNvidia } from '@/lib/ai/nvidia';
import { getOrCreateSettings } from '@/lib/settings';
import type { AiEmailGenerationContext, AiEmailResponse } from '@/lib/validations/ai';

export type AiProviderStatus = {
  provider: 'nvidia' | 'mock';
  requestedProvider: string;
  nvidiaConfigured: boolean;
  model: string;
  mockMode: boolean;
};

export async function getAiProviderStatus(): Promise<AiProviderStatus> {
  const settings = await getOrCreateSettings();
  const requestedProvider = settings.aiProvider || process.env.AI_PROVIDER?.trim() || 'mock';
  const nvidiaConfigured = Boolean(settings.nvidiaApiKey.trim() || process.env.NVIDIA_API_KEY?.trim());
  const model = process.env.NVIDIA_MODEL?.trim() || 'qwen/qwen3.5-122b-a10b';
  const provider = requestedProvider === 'nvidia' && nvidiaConfigured ? 'nvidia' : 'mock';

  return {
    provider,
    requestedProvider,
    nvidiaConfigured,
    model,
    mockMode: provider === 'mock'
  };
}

export async function generateEmail(input: AiEmailGenerationContext): Promise<AiEmailResponse & { provider: 'nvidia' | 'mock' }> {
  const [status, settings] = await Promise.all([getAiProviderStatus(), getOrCreateSettings()]);

  if (status.provider === 'nvidia') {
    try {
      const generated = await generateWithNvidia(input, settings.nvidiaApiKey.trim() || undefined);
      return { ...generated, provider: 'nvidia' };
    } catch (error) {
      console.warn('NVIDIA AI failed. Falling back to mock AI.', error);
    }
  }

  return { ...generateMockEmail(input), provider: 'mock' };
}
