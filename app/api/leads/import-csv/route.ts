import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canonicalLeadKeys } from '@/lib/leads/canonical';
import { leadMatchesCompany } from '@/lib/leads/dedupe';
import { buildLeadFingerprint, parseCsv } from '@/lib/leads/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function textValue(record: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[normalizeHeader(key)]?.trim();
    if (value) return value;
  }
  return undefined;
}

function numberValue(record: Record<string, string>, ...keys: string[]) {
  const value = textValue(record, ...keys);
  if (!value) return undefined;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) ? number : undefined;
}

function intValue(record: Record<string, string>, ...keys: string[]) {
  const value = numberValue(record, ...keys);
  return value === undefined ? undefined : Math.trunc(value);
}

function recordsFromCsv(text: string) {
  const [headers = [], ...rows] = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
  const normalizedHeaders = headers.map(normalizeHeader);
  return rows.map((row) => Object.fromEntries(
    normalizedHeaders.map((header, index) => [header, row[index] ?? ''])
  ));
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a CSV file first.' }, { status: 400 });
    }

    const records = recordsFromCsv(await file.text()).slice(0, 1_000);
    if (!records.length) {
      return NextResponse.json({ error: 'The CSV file is empty.' }, { status: 400 });
    }

    const run = await prisma.leadSearch.create({
      data: {
        keyword: 'CSV import',
        area: file.name,
        requestedLimit: records.length,
        enrichEmails: false
      }
    });
    const [existingLeads, companies] = await Promise.all([
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
      }),
      prisma.company.findMany({
        select: {
          id: true,
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
      })
    ]);
    const seenLeadKeys = new Set(existingLeads.flatMap((lead) => canonicalLeadKeys(lead)));
    const leads = [];
    let skippedCount = 0;

    for (const [index, record] of records.entries()) {
      const name = textValue(record, 'name', 'company', 'company name');
      if (!name) {
        skippedCount += 1;
        continue;
      }

      const website = textValue(record, 'website');
      const address = textValue(record, 'address', 'location');
      const city = textValue(record, 'city');
      const sourceUrl = textValue(record, 'sourceUrl', 'source URL', 'googleMapsUrl', 'google maps url')
        ?? website
        ?? `csv-import:${run.id}:${index + 1}`;
      const fingerprint = buildLeadFingerprint({ name, address, website });
      const leadCandidate = {
        name,
        category: textValue(record, 'category', 'industry'),
        address,
        city,
        phone: textValue(record, 'phone'),
        email: textValue(record, 'email'),
        website,
        rating: numberValue(record, 'rating'),
        reviewCount: intValue(record, 'reviewCount', 'review count'),
        latitude: numberValue(record, 'latitude'),
        longitude: numberValue(record, 'longitude'),
        sourceUrl,
        fingerprint,
        search: { area: city ?? file.name }
      };
      const leadKeys = canonicalLeadKeys(leadCandidate);
      if (leadKeys.some((key) => seenLeadKeys.has(key))) {
        skippedCount += 1;
        leadKeys.forEach((key) => seenLeadKeys.add(key));
        continue;
      }

      const existingCompany = companies.find((company) => leadMatchesCompany(leadCandidate, company));
      const lead = await prisma.lead.create({
        data: {
          searchId: run.id,
          companyId: existingCompany?.id,
          name,
          category: leadCandidate.category,
          address,
          city,
          phone: leadCandidate.phone,
          email: leadCandidate.email,
          website,
          rating: leadCandidate.rating,
          reviewCount: leadCandidate.reviewCount,
          latitude: leadCandidate.latitude,
          longitude: leadCandidate.longitude,
          sourceUrl,
          fingerprint,
          status: 'new'
        }
      });
      leadKeys.forEach((key) => seenLeadKeys.add(key));
      leads.push(lead);
    }

    await prisma.$transaction([
      prisma.leadSearch.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          foundCount: leads.length,
          skippedCount,
          completedAt: new Date()
        }
      }),
      prisma.activityLog.create({
        data: {
          action: 'lead_csv_imported',
          entityType: 'LeadSearch',
          entityName: file.name,
          description: `Imported ${leads.length} CSV leads and skipped ${skippedCount} rows.`
        }
      })
    ]);

    const search = await prisma.leadSearch.findUniqueOrThrow({ where: { id: run.id } });
    return NextResponse.json({ leads, search, importedCount: leads.length, skippedCount });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not import the CSV file.' }, { status: 400 });
  }
}
