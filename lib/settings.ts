import { prisma } from '@/lib/prisma';
import { getProviderStatus } from '@/lib/ai/provider';
import { candidateProfileSchema } from '@/lib/ai/contracts';
import { reconcileCandidateProfileWithSource } from '@/lib/ai/cv-analysis';

const MASKED_KEY_PATTERN = /^[•*.\s]+(?:\(saved\))?$/i;

export async function getOrCreateSettings() {
  const existing = await prisma.userSettings.findUnique({
    where: { singletonKey: 'default' }
  });

  if (existing) {
    if (existing.structuredProfile && existing.cvText) {
      try {
        const parsed = candidateProfileSchema.parse(JSON.parse(existing.structuredProfile));
        const reconciled = reconcileCandidateProfileWithSource(parsed, existing.cvText);
        const structuredProfile = JSON.stringify(reconciled);
        const synchronized = {
          structuredProfile,
          fullName: reconciled.fullName ?? '',
          email: reconciled.email ?? '',
          phone: reconciled.phone ?? '',
          location: reconciled.location ?? '',
          skills: reconciled.skills.join(', '),
          targetRole: reconciled.targetRoles[0] ?? '',
          candidateProfile: reconciled.professionalSummary || reconciled.evidenceSummary.join(' ')
        };
        const changed = structuredProfile !== existing.structuredProfile ||
          Object.entries(synchronized).some(([key, value]) =>
            existing[key as keyof typeof existing] !== value
          );
        if (changed) {
          const [updated] = await prisma.$transaction([
            prisma.userSettings.update({
              where: { id: existing.id },
              data: { ...synchronized, profileVersion: { increment: 1 } }
            }),
            prisma.candidateCompanyMatch.updateMany({ data: { status: 'outdated' } })
          ]);
          return updated;
        }
      } catch {
        // Keep the last saved values; invalid stored JSON remains visible for manual recovery.
      }
    }
    return existing;
  }

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
