import Link from 'next/link';
import { Suspense } from 'react';
import { deleteCompany } from '@/app/actions';
import { CompanyDrawer } from '@/components/companies/CompanyDrawer';
import { ConfirmSubmitButton } from '@/components/ui/ConfirmSubmitButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Badge } from '@/components/ui/Badge';
import { prisma } from '@/lib/prisma';
import { formatDate, truncate } from '@/lib/utils';

export const metadata = { title: 'Companies' };

const PAGE_SIZE = 15;

export default async function CompaniesPage({
  searchParams
}: {
  searchParams: Promise<{ edit?: string; q?: string; city?: string; page?: string; new?: string }>
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? '';
  const city = params.city?.trim() ?? '';
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    AND: [
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
  };

  const [companies, totalCount, editingCompany, cityRows] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
      include: { _count: { select: { contacts: true, generatedMessages: true } } }
    }),
    prisma.company.count({ where }),
    params.edit ? prisma.company.findUnique({ where: { id: params.edit } }) : null,
    prisma.company.findMany({
      where: { city: { not: null } },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' }
    })
  ]);

  const cityOptions = cityRows.map((row) => row.city).filter((item): item is string => Boolean(item));
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const exportParams = new URLSearchParams();
  if (query) exportParams.set('q', query);
  if (city) exportParams.set('city', city);
  const exportUrl = exportParams.size > 0 ? `/api/companies/export?${exportParams}` : '/api/companies/export';

  const buildFilterUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: query, city, page: '1', ...overrides };
    if (merged.q) p.set('q', merged.q);
    if (merged.city) p.set('city', merged.city);
    if (merged.page && merged.page !== '1') p.set('page', merged.page);
    return `/companies${p.size > 0 ? `?${p}` : ''}`;
  };

  return (
    <div>
      <PageHeader
        title="Companies"
        description="Organize companies, contacts, research notes, and AI messages."
        action={
          <Link href="/companies?new=1" className="btn-primary">
            + Add Company
          </Link>
        }
      />

      {/* Toolbar */}
      <form method="get" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="input flex-1"
          name="q"
          defaultValue={query}
          placeholder="Search name, industry, city…"
        />
        <select className="input sm:w-44" name="city" defaultValue={city}>
          <option value="">All cities</option>
          {cityOptions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button className="btn-primary" type="submit">Filter</button>
          {(query || city) && (
            <Link href="/companies" className="btn-secondary">Clear</Link>
          )}
          <a className="btn-secondary" href={exportUrl}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            CSV
          </a>
        </div>
      </form>

      {/* Result count */}
      {(query || city) && (
        <p className="mb-3 text-sm text-on-surface-muted">
          {totalCount} {totalCount === 1 ? 'result' : 'results'} found
        </p>
      )}

      {/* Table / Empty */}
      {companies.length === 0 ? (
        <EmptyState
          title="No companies yet"
          description={query || city ? 'No companies match your filters.' : 'Add your first target company to get started.'}
          action={
            !query && !city
              ? <Link href="/companies?new=1" className="btn-primary">Add Company</Link>
              : <Link href="/companies" className="btn-secondary">Clear filters</Link>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border shadow-card md:block">
            <table className="min-w-full">
              <thead>
                <tr className="bg-surface-soft">
                  <th className="table-th">Company</th>
                  <th className="table-th">Industry / City</th>
                  <th className="table-th">Contacts</th>
                  <th className="table-th">Created</th>
                  <th className="table-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-surface">
                {companies.map((company) => (
                  <tr key={company.id} className="table-row-hover">
                    <td className="table-td">
                      <Link
                        className="font-semibold text-on-surface hover:text-primary"
                        href={`/companies/${company.id}`}
                      >
                        {company.name}
                      </Link>
                      {company.website && (
                        <p className="mt-0.5 truncate text-xs text-on-surface-muted max-w-[200px]">
                          {company.website}
                        </p>
                      )}
                      {company.email && (
                        <a className="mt-0.5 block text-xs text-primary hover:underline" href={`mailto:${company.email}`}>
                          {company.email}
                        </a>
                      )}
                    </td>
                    <td className="table-td">
                      <p className="text-sm">{company.industry ?? '—'}</p>
                      {company.city && <Badge variant="muted" className="mt-1">{company.city}</Badge>}
                    </td>
                    <td className="table-td">
                      <p className="font-medium text-on-surface">{company._count.contacts}</p>
                      <p className="mt-0.5 text-xs text-on-surface-muted">{company._count.generatedMessages} messages</p>
                    </td>
                    <td className="table-td whitespace-nowrap">{formatDate(company.createdAt)}</td>
                    <td className="table-td">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/companies/${company.id}`} className="btn-sm btn-secondary">View</Link>
                        <Link href={`/ai-generator?companyId=${company.id}`} className="btn-sm btn-secondary">
                          Generate
                        </Link>
                        <Link href={`/companies?edit=${company.id}`} className="btn-sm btn-secondary">Edit</Link>
                        <form action={deleteCompany.bind(null, company.id)}>
                          <ConfirmSubmitButton
                            className="btn-sm btn-danger"
                            message={`Delete company "${company.name}"? Related contacts and saved messages will stay.`}
                          >
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {companies.map((company) => (
              <div key={company.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/companies/${company.id}`}
                      className="font-semibold text-on-surface hover:text-primary"
                    >
                      {company.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-on-surface-muted">
                      {company.industry ?? ''}{company.city ? ` · ${company.city}` : ''}
                    </p>
                  </div>
                  <Badge variant="muted">{company._count.contacts}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/companies/${company.id}`} className="btn-sm btn-primary">View</Link>
                  <Link href={`/ai-generator?companyId=${company.id}`} className="btn-sm btn-secondary">Generate</Link>
                  <Link href={`/companies?edit=${company.id}`} className="btn-sm btn-secondary">Edit</Link>
                  <form action={deleteCompany.bind(null, company.id)}>
                    <ConfirmSubmitButton
                      className="btn-sm btn-danger"
                      message={`Delete company "${company.name}"?`}
                    >
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            page={page}
            totalPages={totalPages}
            getPageUrl={(p) => buildFilterUrl({ page: String(p) })}
            className="mt-6"
          />
        </>
      )}

      {/* Drawer (URL-aware) */}
      <Suspense>
        <CompanyDrawer company={editingCompany} />
      </Suspense>
    </div>
  );
}
