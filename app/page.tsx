import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dashboard'
};

export default async function DashboardPage() {
  const [
    totalCompanies,
    totalContacts,
    companiesWithContacts,
    messagesGenerated,
    recentCompanies,
    recentContacts
  ] = await Promise.all([
    prisma.company.count(),
    prisma.contact.count(),
    prisma.company.count({ where: { contacts: { some: {} } } }),
    prisma.generatedMessage.count(),
    prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { _count: { select: { contacts: true } } }
    }),
    prisma.contact.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { company: true }
    })
  ]);

  const companiesWithoutContacts = totalCompanies - companiesWithContacts;

  const metrics = [
    { label: 'Companies', value: totalCompanies, href: '/companies', accent: false },
    { label: 'Contacts', value: totalContacts, href: '/contacts', accent: false },
    { label: 'With contacts', value: companiesWithContacts, href: '/companies', accent: false },
    { label: 'No contacts', value: companiesWithoutContacts, href: '/companies', accent: false },
    { label: 'Messages saved', value: messagesGenerated, href: '/ai-generator', accent: true }
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Your job search pipeline at a glance."
        action={
          <Link href="/lead-finder" className="btn-primary">
            + Find Leads
          </Link>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric) => (
          <Link
            key={metric.label}
            href={metric.href}
            className="metric-card group block"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-on-surface-muted">
              {metric.label}
            </p>
            <p className={`mt-2 text-3xl font-bold tracking-tight ${metric.accent ? 'text-primary' : 'text-on-surface'}`}>
              {metric.value}
            </p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/companies?new=1" className="btn-primary">Add Company</Link>
        <Link href="/contacts?new=1" className="btn-secondary">Add Contact</Link>
        <Link href="/lead-finder" className="btn-secondary">Find Companies</Link>
        <Link href="/ai-generator" className="btn-secondary">Generate Message</Link>
        <Link href="/templates" className="btn-secondary">Templates</Link>
      </div>

      {/* Recent items */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Recent companies */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-on-surface">Recent companies</h2>
            <Link href="/companies" className="text-xs font-semibold text-primary hover:underline">
              View all →
            </Link>
          </div>
          {recentCompanies.length === 0 ? (
            <EmptyState
              compact
              title="No companies yet"
              description="Add your first target company or find leads on Google Maps."
              action={<Link href="/lead-finder" className="btn-primary">Find Companies</Link>}
            />
          ) : (
            <div className="divide-y divide-border-subtle">
              {recentCompanies.map((company) => (
                <Link
                  key={company.id}
                  href={`/companies/${company.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-surface-soft"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-on-surface">{company.name}</p>
                    <p className="mt-0.5 truncate text-xs text-on-surface-muted">
                      {company.industry ?? company.city ?? 'No category'}
                    </p>
                  </div>
                  <Badge variant="muted">{company._count.contacts} contacts</Badge>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent contacts */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-on-surface">Recent contacts</h2>
            <Link href="/contacts" className="text-xs font-semibold text-primary hover:underline">
              View all →
            </Link>
          </div>
          {recentContacts.length === 0 ? (
            <EmptyState
              compact
              title="No contacts yet"
              description="Save recruiters and hiring managers for personalized outreach."
              action={<Link href="/contacts?new=1" className="btn-primary">Add Contact</Link>}
            />
          ) : (
            <div className="divide-y divide-border-subtle">
              {recentContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-on-surface">{contact.fullName}</p>
                    <p className="mt-0.5 truncate text-xs text-on-surface-muted">
                      {contact.title ?? 'No role'} · {contact.company?.name ?? 'No company'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-on-surface-muted sm:block">
                      {formatDate(contact.createdAt)}
                    </span>
                    <Link
                      href={`/ai-generator?${contact.companyId ? `companyId=${contact.companyId}&` : ''}contactId=${contact.id}`}
                      className="btn-sm btn-primary"
                    >
                      Generate
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
