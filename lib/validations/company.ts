import { z } from 'zod';
import { optionalString, optionalUrl } from './shared';
import { companyStatuses } from '@/lib/constants';

export const companySchema = z.object({
  name: z.string().trim().min(2, 'Company name is required'),
  website: optionalUrl,
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid company email')]).optional().transform((value) => value || undefined),
  phone: optionalString,
  linkedinUrl: optionalUrl,
  industry: optionalString,
  location: optionalString,
  city: optionalString,
  status: z.enum(companyStatuses),
  sourceUrl: optionalUrl,
  notes: optionalString
});

export type CompanyInput = z.infer<typeof companySchema>;
