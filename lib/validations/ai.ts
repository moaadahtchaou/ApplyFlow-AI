import { z } from 'zod';
import { messageLanguages, tones } from '@/lib/constants';
import { optionalString } from './shared';

export const aiEmailRequestSchema = z.object({
  companyId: optionalString,
  contactId: optionalString,
  purpose: z.string().trim().min(2, 'Message purpose or target role is required'),
  candidateProfile: z.string().trim().min(10, 'Candidate profile is required'),
  tone: z.enum(tones),
  language: z.enum(messageLanguages),
  signature: optionalString
});

export type AiEmailRequestInput = z.infer<typeof aiEmailRequestSchema>;

export type AiEmailGenerationContext = AiEmailRequestInput & {
  companyName: string;
  companyWebsite?: string | null;
  companyIndustry?: string | null;
  contactName?: string | null;
  contactTitle?: string | null;
  contactEmail?: string | null;
};

export const aiEmailResponseSchema = z.object({
  subject: z.string(),
  body: z.string()
});

export type AiEmailResponse = z.infer<typeof aiEmailResponseSchema>;
