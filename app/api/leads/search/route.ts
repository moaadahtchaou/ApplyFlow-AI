import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { searchGoogleMaps } from '@/lib/leads/google-maps';
import { canonicalLeadKeys, normalizeMapsIdentity } from '@/lib/leads/canonical';
import { buildLeadFingerprint, cityFromSearchArea, isAbortError } from '@/lib/leads/utils';
import type { LeadStreamEvent } from '@/lib/leads/types';
import { leadSearchSchema } from '@/lib/validations/lead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let input;
  try {
    input = leadSearchSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: 'Enter a valid keyword, area, and a limit between 1 and 50.' },
      { status: 400 }
    );
  }

  const run = await prisma.leadSearch.create({
    data: {
      keyword: input.keyword,
      area: input.area,
      requestedLimit: input.limit,
      enrichEmails: input.enrichEmails
    }
  });
  const encoder = new TextEncoder();
  const streamAbort = new AbortController();
  const abortFromRequest = () => streamAbort.abort();
  request.signal.addEventListener('abort', abortFromRequest, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: LeadStreamEvent) => {
        if (!streamAbort.signal.aborted) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      };

      void (async () => {
        let foundCount = 0;
        let skippedCount = 0;
        try {
          const city = cityFromSearchArea(input.area);
          const maxScan = Math.min(50, Math.max(input.limit, input.limit * 6));
          const seenKeys = new Set(input.excludeKeys);
          const rememberKeys = (keys: string[]) => keys.forEach((key) => seenKeys.add(key));
          const markSkipped = async (message: string) => {
            skippedCount += 1;
            await prisma.leadSearch.update({
              where: { id: run.id },
              data: { foundCount, skippedCount }
            });
            send({
              type: 'progress',
              message,
              current: foundCount,
              total: input.limit,
              skippedCount
            });
          };

          const [companies, existingLeads] = await Promise.all([
            prisma.company.findMany({
              select: {
                name: true,
                website: true,
                phone: true,
                location: true,
                city: true,
                sourceUrl: true,
                latitude: true,
                longitude: true,
                leadFingerprint: true
              }
            }),
            prisma.lead.findMany({
              select: {
                name: true,
                website: true,
                address: true,
                city: true,
                phone: true,
                sourceUrl: true,
                latitude: true,
                longitude: true,
                fingerprint: true,
                search: { select: { area: true } }
              }
            })
          ]);

          for (const company of companies) {
            rememberKeys(canonicalLeadKeys({
              name: company.name,
              website: company.website,
              address: company.location,
              city: company.city,
              phone: company.phone,
              sourceUrl: company.sourceUrl,
              latitude: company.latitude,
              longitude: company.longitude,
              fingerprint: company.leadFingerprint
            }));
          }
          for (const lead of existingLeads) {
            rememberKeys(canonicalLeadKeys(lead));
          }

          send({ type: 'started', runId: run.id, message: 'Search started.' });
          await searchGoogleMaps({
            keyword: input.keyword,
            area: input.area,
            limit: input.limit,
            maxScan,
            enrichEmails: input.enrichEmails,
            headed: input.headed
          }, {
            signal: streamAbort.signal,
            onProgress: (progress) => send({ type: 'progress', ...progress }),
            shouldVisitLink: async (sourceUrl) => {
              const mapsIdentity = normalizeMapsIdentity(sourceUrl);
              const mapsKey = mapsIdentity ? `maps:${mapsIdentity}` : '';
              if (!mapsKey || !seenKeys.has(mapsKey)) return true;

              await markSkipped('Skipped duplicate Google Maps URL; looking for more unique leads…');
              return false;
            },
            onLead: async (scraped) => {
              const fingerprint = buildLeadFingerprint(scraped);
              const leadKeys = canonicalLeadKeys({
                ...scraped,
                fingerprint,
                search: { area: input.area }
              });
              if (leadKeys.some((key) => seenKeys.has(key))) {
                rememberKeys(leadKeys);
                await markSkipped(`Skipped duplicate ${scraped.name}; looking for more unique leads…`);
                return false;
              }

              const lead = await prisma.lead.create({
                data: {
                  searchId: run.id,
                  name: scraped.name,
                  category: scraped.category,
                  address: scraped.address,
                  city,
                  phone: scraped.phone,
                  email: scraped.email,
                  website: scraped.website,
                  rating: scraped.rating,
                  reviewCount: scraped.reviewCount,
                  latitude: scraped.latitude,
                  longitude: scraped.longitude,
                  sourceUrl: scraped.sourceUrl,
                  fingerprint,
                  status: 'new'
                }
              });
              rememberKeys(leadKeys);
              foundCount += 1;
              await prisma.leadSearch.update({
                where: { id: run.id },
                data: { foundCount, skippedCount }
              });
              send({ type: 'lead', lead, leadKeys });
              return true;
            }
          });

          const completeMessage = foundCount >= input.limit
            ? `Found ${foundCount} new leads for ${city ?? input.area}. Skipped ${skippedCount} duplicates.`
            : `Found ${foundCount} new leads; no more unique results found. Skipped ${skippedCount} duplicates.`;
          await prisma.$transaction([
            prisma.leadSearch.update({
              where: { id: run.id },
              data: { status: 'completed', foundCount, skippedCount, completedAt: new Date() }
            }),
            prisma.activityLog.create({
              data: {
                action: 'lead_search_completed',
                entityType: 'LeadSearch',
                entityName: `${input.keyword} in ${input.area}`,
                description: `Found ${foundCount} unique Google Maps leads and skipped ${skippedCount} duplicates.`
              }
            })
          ]);
          send({
            type: 'complete',
            runId: run.id,
            foundCount,
            skippedCount,
            message: completeMessage
          });
        } catch (error) {
          const cancelled = streamAbort.signal.aborted || isAbortError(error);
          const message = cancelled
            ? 'Search cancelled.'
            : error instanceof Error
              ? error.message
              : 'Google Maps search failed.';
          await prisma.leadSearch.update({
            where: { id: run.id },
            data: {
              status: cancelled ? 'cancelled' : 'failed',
              foundCount,
              skippedCount,
              error: message,
              completedAt: new Date()
            }
          }).catch(() => undefined);
          send({ type: 'error', runId: run.id, message });
        } finally {
          request.signal.removeEventListener('abort', abortFromRequest);
          if (!streamAbort.signal.aborted) controller.close();
        }
      })();
    },
    cancel() {
      streamAbort.abort();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
