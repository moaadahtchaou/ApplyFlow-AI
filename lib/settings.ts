import { prisma } from '@/lib/prisma';
import { getProviderStatus } from '@/lib/ai/provider';

const MASKED_KEY_PATTERN = /^[•*.\s]+(?:\(saved\))?$/i;

export async function getOrCreateSettings() {
  const existing = await prisma.userSettings.findUnique({
    where: { singletonKey: 'default' }
  });

  if (existing) return existing;

  return prisma.userSettings.create({
    data: {
      singletonKey: 'default',
      candidateProfile: '',
      defaultSignature: '',
      defaultTone: 'professional',
      defaultLanguage: 'English'
    }
  });
}

export function normalizedNewNvidiaKey(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const key = value.trim();
  if (!key || MASKED_KEY_PATTERN.test(key)) return undefined;
  if (/\s/.test(key) || key.length < 20 || key.length > 500) {
    throw new Error('Enter a valid NVIDIA API key without spaces.');
  }
  return key;
}

export async function updateAiSettings(input: {
  aiProvider: 'mock' | 'nvidia';
  nvidiaApiKey?: unknown;
  defaultTone: string;
  defaultLanguage: string;
}) {
  const current = await getOrCreateSettings();
  const newKey = normalizedNewNvidiaKey(input.nvidiaApiKey);
  return prisma.userSettings.update({
    where: { id: current.id },
    data: {
      aiProvider: input.aiProvider,
      defaultTone: input.defaultTone,
      defaultLanguage: input.defaultLanguage,
      ...(newKey ? { nvidiaApiKey: newKey } : {})
    }
  });
}

export function publicAiSettings(settings: {
  aiProvider: string;
  nvidiaApiKey: string;
  defaultTone: string;
  defaultLanguage: string;
}) {
  const status = getProviderStatus({
    requestedProvider: settings.aiProvider,
    apiKey: settings.nvidiaApiKey
  });
  return {
    aiProvider: status.provider,
    defaultTone: settings.defaultTone,
    defaultLanguage: settings.defaultLanguage,
    nvidiaConfigured: status.nvidiaConfigured,
    model: status.model,
    mockMode: status.mockMode,
    timeoutMs: status.timeoutMs
  };
}
