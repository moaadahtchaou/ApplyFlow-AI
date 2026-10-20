import { getProviderStatus } from '@/lib/ai/provider';
import { getOrCreateSettings } from '@/lib/settings';

export type AiProviderStatus = {
  provider: 'nvidia' | 'mock';
  requestedProvider: string;
  nvidiaConfigured: boolean;
  model: string;
  mockMode: boolean;
  baseUrl: string;
  timeoutMs: number;
};

export async function getAiProviderStatus(): Promise<AiProviderStatus> {
  const settings = await getOrCreateSettings();
  return getProviderStatus({
    requestedProvider: settings.aiProvider,
    apiKey: settings.nvidiaApiKey
  });
}
