import Link from 'next/link';
import { Suspense } from 'react';
import { deleteContact } from '@/app/actions';
import { ContactDrawer } from '@/components/companies/ContactDrawer';
import { ConfirmSubmitButton } from '@/components/ui/ConfirmSubmitButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Badge } from '@/components/ui/Badge';
import { prisma } from '@/lib/prisma';
import { formatDate, truncate } from '@/lib/utils';

export const metadata = { title: 'Contacts' };

const PAGE_SIZE = 15;

export default async function ContactsPage({
  searchParams
}: {
  searchParams: Promise<{ edit?: string; q?: string; company?: string; page?: string; new?: string }>
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? '';
  const companyFilter = params.company?.trim() ?? '';
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    AND: [
      companyFilter ? { companyId: companyFilter } : {},
      query ? {
        OR: [
          { fullName: { contains: query } },
          { email: { contains: query } },
          { title: { contains: query } },
          { notes: { contains: query } }
        ]
      } : {}
    ]
  };

  const [contacts, totalCount, companies, editingContact] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
      include: { company: true }
    }),
    prisma.contact.count({ where }),
    prisma.company.findMany({ orderBy: { name: 'asc' } }),
    params.edit ? prisma.contact.findUnique({ where: { id: params.edit } }) : null
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const buildFilterUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: query, company: companyFilter, page: '1', ...overrides };
    if (merged.q) p.set('q', merged.q);
    if (merged.company) p.set('company', merged.company);
    if (merged.page && merged.page !== '1') p.set('page', merged.page);
    return `/contacts${p.size > 0 ? `?${p}` : ''}`;
  };

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Store recruiters, hiring managers, and founders for personalized outreach."
        action={
          <Link href="/contacts?new=1" className="btn-primary">
            + Add Contact
          </Link>
        }
      />

      {/* Toolbar */}
      <form method="get" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="input flex-1"
          name="q"
          defaultValue={query}
          placeholder="Search name, email, title…"
        />
        <select className="input sm:w-48" name="company" defaultValue={companyFilter}>
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button className="btn-primary" type="submit">Filter</button>
          {(query || companyFilter) && (
            <Link href="/contacts" className="btn-secondary">Clear</Link>
          )}
        </div>
      </form>

      {(query || companyFilter) && (
        <p className="mb-3 text-sm text-on-surface-muted">
          {totalCount} {totalCount === 1 ? 'result' : 'results'} found
        </p>
      )}

      {contacts.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          description={query || companyFilter ? 'No contacts match your filters.' : 'Add a recruiter, hiring manager, or founder to personalize messages.'}
          action={
            !query && !companyFilter
              ? <Link href="/contacts?new=1" className="btn-primary">Add Contact</Link>
              : <Link href="/contacts" className="btn-secondary">Clear filters</Link>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border shadow-card md:block">
            <table className="min-w-full">
              <thead>
                <tr className="bg-surface-soft">
                  <th className="table-th">Contact</th>
                  <th className="table-th">Company</th>
                  <th className="table-th">Notes</th>
                  <th className="table-th">Added</th>
                  <th className="table-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-surface">
                {contacts.map((contact) => (
                  <tr key={contact.id} className="table-row-hover">
                    <td className="table-td">
                      <p className="font-semibold text-on-surface">{contact.fullName}</p>
                      <p className="mt-0.5 text-xs text-on-surface-muted">{contact.title ?? 'No title'}</p>
                      <a
                        className="mt-0.5 block text-xs text-primary hover:underline"
                        href={`mailto:${contact.email}`}
                      >
                        {contact.email}
                      </a>
                    </td>
                    <td className="table-td">
                      {contact.company ? (
                        <Link
                          href={`/companies/${contact.company.id}`}
                          className="text-sm font-medium text-on-surface hover:text-primary"
                        >
                          {contact.company.name}
                        </Link>
                      ) : (
                        <span className="text-on-surface-muted">—</span>
                      )}
                    </td>
                    <td className="table-td">
                      <p className="text-sm text-on-surface-muted">{truncate(contact.notes, 80)}</p>
                    </td>
                    <td className="table-td whitespace-nowrap">{formatDate(contact.createdAt)}</td>
                    <td className="table-td">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/ai-generator?${contact.companyId ? `companyId=${contact.companyId}&` : ''}contactId=${contact.id}`}
                          className="btn-sm btn-primary"
                        >
                          Generate
                        </Link>
                        <Link href={`/contacts?edit=${contact.id}`} className="btn-sm btn-secondary">Edit</Link>
                        <form action={deleteContact.bind(null, contact.id)}>
                          <ConfirmSubmitButton
                            className="btn-sm btn-danger"
                            message={`Delete contact "${contact.fullName}"? Saved messages will stay.`}
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
            {contacts.map((contact) => (
              <div key={contact.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-on-surface">{contact.fullName}</p>
                    <p className="mt-0.5 text-xs text-on-surface-muted">
                      {contact.title ?? 'No title'} · {contact.company?.name ?? 'No company'}
                    </p>
                    <a className="mt-0.5 block text-xs text-primary" href={`mailto:${contact.email}`}>
                      {contact.email}
                    </a>
                  </div>
                  <span className="shrink-0 text-xs text-on-surface-muted">{formatDate(contact.createdAt)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/ai-generator?${contact.companyId ? `companyId=${contact.companyId}&` : ''}contactId=${contact.id}`}
                    className="btn-sm btn-primary"
                  >
                    Generate
                  </Link>
                  <Link href={`/contacts?edit=${contact.id}`} className="btn-sm btn-secondary">Edit</Link>
                  <form action={deleteContact.bind(null, contact.id)}>
                    <ConfirmSubmitButton className="btn-sm btn-danger" message={`Delete "${contact.fullName}"?`}>
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            getPageUrl={(p) => buildFilterUrl({ page: String(p) })}
            className="mt-6"
          />
        </>
      )}

      {/* Drawer */}
      <Suspense>
        <ContactDrawer contact={editingContact} companies={companies} />
      </Suspense>
    </div>
  );
}
