import { z } from 'zod';

const optionalText = z.union([z.string().trim().max(500), z.literal('')]).optional();
const optionalUrl = z.union([z.string().trim().url(), z.literal('')]).optional();
const optionalEmail = z.union([z.string().trim().email(), z.literal('')]).optional();

export const leadSearchSchema = z.object({
  keyword: z.string().trim().min(2).max(120),
  area: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  enrichEmails: z.boolean().default(false),
  headed: z.boolean().default(false),
  excludeKeys: z.array(z.string().trim().min(1).max(300)).max(500).default([])
});

export const leadUpdateSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  category: optionalText,
  address: optionalText,
  city: optionalText,
  phone: optionalText,
  email: optionalEmail,
  website: optionalUrl,
  status: z.enum(['new', 'ignored']).optional()
}).refine((value) => Object.keys(value).length > 0, 'No changes were supplied.');

export const leadImportSchema = z.object({
  leadIds: z.array(z.string().cuid()).min(1).max(50)
});

export type LeadSearchInput = z.infer<typeof leadSearchSchema>;
