export type ScrapedLead = {
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  latitude?: number;
  longitude?: number;
  sourceUrl: string;
};

export type LeadStreamEvent =
  | { type: 'started'; runId: string; message: string }
  | { type: 'progress'; message: string; current?: number; total?: number; skippedCount?: number }
  | { type: 'lead'; lead: Record<string, unknown>; leadKeys?: string[] }
  | { type: 'complete'; runId: string; foundCount: number; skippedCount: number; message: string }
  | { type: 'error'; runId?: string; message: string };
