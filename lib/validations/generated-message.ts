import { z } from 'zod';
import {
  aiExecutionMetadataSchema,
  messageQualityEvaluationSchema
} from '@/lib/ai/contracts';
import { messageLanguages, tones } from '@/lib/constants';

export const generatedMessageSchema = z.object({
  companyId: z.string().trim().min(1),
  contactId: z.string().trim().optional(),
  matchId: z.string().trim().min(1),
  purpose: z.string().trim().min(2).max(300),
  tone: z.enum(tones),
  language: z.enum(messageLanguages),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(40).max(20_000),
  companyFactUsed: z.string().trim().min(1).max(1500),
  companyFactSourceUrl: z.string().url().max(1000).optional(),
  candidateEvidenceUsed: z.string().trim().min(1).max(1500),
  selectedProject: z.string().trim().max(300).optional(),
  matchingAngle: z.string().trim().min(1).max(1500),
  providerMetadata: aiExecutionMetadataSchema,
  promptVersion: z.string().trim().min(1).max(100),
  evaluation: messageQualityEvaluationSchema,
  automaticRewriteUsed: z.boolean()
});
