import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/leads/utils';
import { companyStatuses } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fields = [
  'name',
  'industry',
  'location',
  'city',
  'phone',
  'email',
  'website',
  'linkedinUrl',
  'status',
  'rating',
  'reviewCount',
  'latitude',
  'longitude',
  'sourceUrl',
  'sourceType',
  'notes'
] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const status = url.searchParams.get('status');
  const city = url.searchParams.get('city')?.trim() ?? '';
  const companies = await prisma.company.findMany({
    where: {
      AND: [
        status && companyStatuses.includes(status as (typeof companyStatuses)[number]) ? { status } : {},
        city ? { city } : {},
        query ? {
          OR: [
            { name: { contains: query } },
            { email: { contains: query } },
            { phone: { contains: query } },
            { industry: { contains: query } },
            { location: { contains: query } },
            { city: { contains: query } },
            { notes: { contains: query } }
          ]
        } : {}
      ]
    },
    orderBy: { createdAt: 'desc' }
  });

  const rows = [
    fields.map(csvCell).join(','),
    ...companies.map((company) => fields.map((field) => csvCell(company[field])).join(','))
  ];
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${rows.join('\r\n')}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="applyflow-companies-${date}.csv"`,
      'Cache-Control': 'no-store'
    }
  });
}
