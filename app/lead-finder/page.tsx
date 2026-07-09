import { LeadFinderClient } from '@/components/leads/LeadFinderClient';
import { PageHeader } from '@/components/ui/PageHeader';
import { prisma } from '@/lib/prisma';
import { getCityOptions, getCountryOptions } from '@/lib/leads/locations';

export const dynamic = 'force-dynamic';

export default async function LeadFinderPage() {
  const countries = getCountryOptions();
  const defaultCountryId = countries.some((country) => country.id === 'MA')
    ? 'MA'
    : countries[0]?.id ?? '';
  const initialCities = getCityOptions(defaultCountryId);
  const [leads, searches] = await Promise.all([
    prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      take: 150
    }),
    prisma.leadSearch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8
    })
  ]);

  return (
    <div>
      <PageHeader
        title="Google Maps Lead Finder"
        description="Research local companies, review the results, then import only the best matches into your ApplyFlow pipeline."
      />
      <LeadFinderClient
        countries={countries}
        defaultCountryId={defaultCountryId}
        initialCities={initialCities}
        initialLeads={leads.map((lead) => ({
          ...lead,
          createdAt: lead.createdAt.toISOString(),
          updatedAt: lead.updatedAt.toISOString()
        }))}
        initialSearches={searches.map((search) => ({
          ...search,
          createdAt: search.createdAt.toISOString(),
          completedAt: search.completedAt?.toISOString() ?? null
        }))}
      />
    </div>
  );
}
