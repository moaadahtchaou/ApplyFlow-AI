import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/leads/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fields = [
  'name',
  'category',
  'address',
  'city',
  'phone',
  'email',
  'website',
  'rating',
  'reviewCount',
  'latitude',
  'longitude',
  'sourceUrl',
  'status'
] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const searchId = url.searchParams.get('searchId');
  const city = url.searchParams.get('city');
  const leads = await prisma.lead.findMany({
    where: {
      ...(status && ['new', 'ignored', 'imported'].includes(status) ? { status } : {}),
      ...(searchId ? { searchId } : {}),
      ...(city ? { city } : {})
    },
    orderBy: { createdAt: 'desc' }
  });

  const rows = [
    fields.map(csvCell).join(','),
    ...leads.map((lead) => fields.map((field) => csvCell(lead[field])).join(','))
  ];
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${rows.join('\r\n')}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="applyflow-leads-${date}.csv"`,
      'Cache-Control': 'no-store'
    }
  });
}
