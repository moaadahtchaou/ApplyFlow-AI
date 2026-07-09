import { prisma } from '@/lib/prisma';

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
