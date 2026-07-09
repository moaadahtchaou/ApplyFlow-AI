import { z } from 'zod';

export const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional()
);

export const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().url('Enter a valid URL').optional()
);

export const optionalDate = z.preprocess((value) => {
  if (!value || (typeof value === 'string' && value.trim() === '')) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}, z.date().optional());
