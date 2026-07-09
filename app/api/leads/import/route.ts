import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { leadMatchesCompany } from '@/lib/leads/dedupe';
import { leadImportSchema } from '@/lib/validations/lead';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const input = leadImportSchema.parse(await request.json());
    const leads = await prisma.lead.findMany({
      where: { id: { in: input.leadIds } },
      include: { search: { select: { area: true } } },
      orderBy: { createdAt: 'asc' }
    });
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        website: true,
        email: true,
        phone: true,
        industry: true,
        location: true,
        city: true,
        sourceUrl: true,
        sourceType: true,
        rating: true,
        reviewCount: true,
        latitude: true,
        longitude: true,
        leadFingerprint: true
      }
    });

    const results: Array<{ leadId: string; companyId?: string; outcome: string; error?: string }> = [];
    for (const lead of leads) {
      try {
        if (lead.companyId) {
          results.push({ leadId: lead.id, companyId: lead.companyId, outcome: 'already_imported' });
          continue;
        }

        const existing = companies.find((company) => leadMatchesCompany(lead, company));
        const company = await prisma.$transaction(async (tx) => {
          const saved = existing
            ? await tx.company.update({
                where: { id: existing.id },
                data: {
                  website: existing.website || lead.website || undefined,
                  email: existing.email || lead.email || undefined,
                  phone: existing.phone || lead.phone || undefined,
                  industry: existing.industry || lead.category || undefined,
                  location: existing.location || lead.address || undefined,
                  city: existing.city || lead.city || undefined,
                  sourceUrl: existing.sourceUrl || lead.sourceUrl,
                  sourceType: existing.sourceType || 'Google Maps',
                  rating: existing.rating ?? lead.rating,
                  reviewCount: existing.reviewCount ?? lead.reviewCount,
                  latitude: existing.latitude ?? lead.latitude,
                  longitude: existing.longitude ?? lead.longitude,
                  leadFingerprint: existing.leadFingerprint || lead.fingerprint
                }
              })
            : await tx.company.create({
                data: {
                  name: lead.name,
                  website: lead.website,
                  email: lead.email,
                  phone: lead.phone,
                  industry: lead.category,
                  location: lead.address,
                  city: lead.city,
                  status: 'new',
                  sourceUrl: lead.sourceUrl,
                  sourceType: 'Google Maps',
                  rating: lead.rating,
                  reviewCount: lead.reviewCount,
                  latitude: lead.latitude,
                  longitude: lead.longitude,
                  leadFingerprint: lead.fingerprint
                }
              });

          await tx.lead.update({
            where: { id: lead.id },
            data: { status: 'imported', companyId: saved.id }
          });
          await tx.activityLog.create({
            data: {
              action: existing ? 'lead_linked' : 'lead_imported',
              entityType: 'Company',
              entityName: saved.name,
              description: existing
                ? 'Google Maps lead matched an existing company.'
                : 'Company imported from the Lead Finder.'
            }
          });
          return saved;
        });

        if (!existing) {
          companies.push({
            id: company.id,
            name: company.name,
            website: company.website,
            email: company.email,
            phone: company.phone,
            industry: company.industry,
            location: company.location,
            city: company.city,
            sourceUrl: company.sourceUrl,
            sourceType: company.sourceType,
            rating: company.rating,
            reviewCount: company.reviewCount,
            latitude: company.latitude,
            longitude: company.longitude,
            leadFingerprint: company.leadFingerprint
          });
        }
        results.push({
          leadId: lead.id,
          companyId: company.id,
          outcome: existing ? 'matched_existing' : 'created'
        });
      } catch (error) {
        results.push({
          leadId: lead.id,
          outcome: 'failed',
          error: error instanceof Error ? error.message : 'Import failed.'
        });
      }
    }

    const importedCount = results.filter((result) => result.outcome !== 'failed').length;
    return NextResponse.json({ importedCount, results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not import the selected leads.' }, { status: 400 });
  }
}
