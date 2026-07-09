import { z } from 'zod';
import { optionalString, optionalUrl } from './shared';

export const contactSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  title: optionalString,
  email: z.string().trim().email('Enter a valid email'),
  linkedinUrl: optionalUrl,
  phone: optionalString,
  companyId: optionalString,
  notes: optionalString
});

export type ContactInput = z.infer<typeof contactSchema>;
