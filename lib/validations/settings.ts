import { z } from 'zod';
import { messageLanguages, tones } from '@/lib/constants';

export const profileSettingsSchema = z.object({
  candidateProfile: z.string().trim(),
  defaultSignature: z.string().trim(),
  fullName: z.string().trim(),
  email: z.string().trim(),
  phone: z.string().trim(),
  location: z.string().trim(),
  targetRole: z.string().trim(),
  experienceSummary: z.string().trim(),
  skills: z.string().trim(),
  languages: z.string().trim(),
  preferredLocations: z.string().trim(),
  cvText: z.string().trim()
});

export const systemSettingsSchema = z.object({
  aiProvider: z.enum(['mock', 'nvidia']),
  nvidiaApiKey: z.string().trim(),
  defaultTone: z.enum(tones),
  defaultLanguage: z.enum(messageLanguages)
});
