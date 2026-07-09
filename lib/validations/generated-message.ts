import { z } from 'zod';
import { messageLanguages, tones } from '@/lib/constants';
import { optionalString } from './shared';

export const generatedMessageSchema = z.object({
  companyId: optionalString,
  contactId: optionalString,
  purpose: z.string().trim().min(2).max(200),
  tone: z.enum(tones),
  language: z.enum(messageLanguages),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000),
  provider: z.enum(['mock', 'nvidia'])
});
