import { z } from 'zod';
import { templateTypes } from '@/lib/constants';

export const templateSchema = z.object({
  name: z.string().trim().min(2, 'Template name is required'),
  type: z.enum(templateTypes),
  subject: z.string().trim().min(2, 'Subject is required'),
  body: z.string().trim().min(10, 'Template body is required')
});

export type TemplateInput = z.infer<typeof templateSchema>;
