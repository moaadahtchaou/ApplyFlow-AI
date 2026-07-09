import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CopyMessageButton } from '@/components/companies/CopyMessageButton';
import { CompanyTabs } from '@/components/companies/CompanyTabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { prisma } from '@/lib/prisma';
import { formatDate, truncate } from '@/lib/utils';
import { deleteContact } from '@/app/actions';
import { ConfirmSubmitButton } from '@/components/ui/ConfirmSubmitButton';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id }, select: { name: true } });
  return { title: company?.name ?? 'Company' };
}

export default async function CompanyDetailsPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; addContact?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { createdAt: 'desc' } },
      generatedMessages: { orderBy: { createdAt: 'desc' }, include: { contact: true } },
      leads: { orderBy: { createdAt: 'desc' }, take: 30 }
    }
  });
  if (!company) notFound();

  const activeTab = query.tab ?? 'overview';
  const companyPath = `/companies/${company.id}`;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-xs text-on-surface-muted">
        <Link href="/companies" className="hover:text-primary">Companies</Link>
        <span>/</span>
        <span className="text-on-surface">{company.name}</span>
      </div>

      {/* Company Header */}
      <div className="card mb-6 overflow-hidden">
        {/* Brand banner */}
        <div className="bg-gradient-to-br from-[#0f172a] via-[#134e4a] to-[#059669] p-6 text-white sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{company.name}</h1>
              <p className="mt-2 text-sm font-medium text-emerald-100">
                {[company.industry, company.city, company.location].filter(Boolean).join(' · ') || 'No industry or location added'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {company.website && (
                  <a href={company.website} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 transition">
                    🌐 Website
                  </a>
                )}
                {company.email && (
                  <a href={`mailto:${company.email}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 transition">
                    ✉️ {company.email}
                  </a>
                )}
                {company.phone && (
                  <a href={`tel:${company.phone}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 transition">
                    📞 {company.phone}
                  </a>
                )}
                {company.linkedinUrl && (
                  <a href={company.linkedinUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 transition">
                    in LinkedIn
                  </a>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href="/companies" className="btn-sm bg-white/20 text-white border-white/30 hover:bg-white/30 border inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition">
                ← Back
              </Link>
              <Link href={`/companies?edit=${company.id}`} className="btn-sm bg-white/20 text-white border-white/30 hover:bg-white/30 border inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition">
                Edit
              </Link>
              <Link href={`/ai-generator?companyId=${company.id}`} className="btn-sm bg-emerald-500 text-white hover:bg-emerald-400 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition">
                ✨ Generate Message
              </Link>
            </div>
          </div>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 divide-x divide-border bg-surface">
          <div className="p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-muted">Contacts</p>
            <p className="mt-1 text-2xl font-bold text-primary">{company.contacts.length}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-muted">Messages</p>
            <p className="mt-1 text-2xl font-bold text-primary">{company.generatedMessages.length}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-muted">Lead Records</p>
            <p className="mt-1 text-2xl font-bold text-primary">{company.leads.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Suspense>
        <CompanyTabs
          companyId={company.id}
          contactCount={company.contacts.length}
          messageCount={company.generatedMessages.length}
          leadCount={company.leads.length}
        />
      </Suspense>

      {/* Tab content */}
      <div className="mt-5">

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="mb-4 text-sm font-semibold text-on-surface">Company information</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 font-medium text-on-surface-variant">Industry</dt>
                  <dd className="text-on-surface">{company.industry ?? '—'}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 font-medium text-on-surface-variant">Location</dt>
                  <dd className="text-on-surface">{company.location ?? company.city ?? '—'}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 font-medium text-on-surface-variant">Source</dt>
                  <dd className="text-on-surface">{company.sourceType ?? 'Manual'}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 font-medium text-on-surface-variant">Created</dt>
                  <dd className="text-on-surface">{formatDate(company.createdAt)}</dd>
                </div>
                {company.rating !== null && (
                  <div className="flex gap-3">
                    <dt className="w-28 shrink-0 font-medium text-on-surface-variant">Rating</dt>
                    <dd className="text-on-surface">
                      {company.rating} ★{company.reviewCount !== null ? ` · ${company.reviewCount} reviews` : ''}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
            <div className="card p-5">
              <h2 className="mb-4 text-sm font-semibold text-on-surface">Research notes</h2>
              {company.notes ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">{company.notes}</p>
              ) : (
                <EmptyState compact title="No notes" description="Edit the company to add research context." />
              )}
            </div>
          </div>
        )}

        {/* Contacts tab */}
        {activeTab === 'contacts' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-on-surface-muted">{company.contacts.length} contacts</p>
              <Link
                href={`${companyPath}?tab=contacts&addContact=1`}
                className="btn-primary"
              >
                + Add Contact
              </Link>
            </div>

            {query.addContact === '1' && (
              <div className="mb-4 card p-5">
                <h3 className="mb-4 text-sm font-semibold text-on-surface">Add contact at {company.name}</h3>
                {/* Import ContactForm directly — pass all companies including this one */}
                <p className="text-sm text-on-surface-muted">
                  Go to the{' '}
                  <Link href={`/contacts?new=1`} className="font-semibold text-primary hover:underline">
                    Contacts page
                  </Link>{' '}
                  to add a contact linked to this company.
                </p>
              </div>
            )}

            {company.contacts.length === 0 ? (
              <EmptyState
                title="No contacts yet"
                description="Add a recruiter, hiring manager, or founder linked to this company."
                action={<Link href={`/contacts?new=1`} className="btn-primary">Add Contact</Link>}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {company.contacts.map((contact) => (
                  <article key={contact.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-on-surface">{contact.fullName}</p>
                        <p className="mt-0.5 text-sm text-on-surface-muted">{contact.title ?? 'No role'}</p>
                        <a className="mt-1 block text-sm text-primary hover:underline" href={`mailto:${contact.email}`}>
                          {contact.email}
                        </a>
                        {contact.phone && (
                          <a className="mt-0.5 block text-xs text-on-surface-muted" href={`tel:${contact.phone}`}>
                            {contact.phone}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/ai-generator?companyId=${company.id}&contactId=${contact.id}`}
                        className="btn-sm btn-primary"
                      >
                        Generate Message
                      </Link>
                      <Link href={`/contacts?edit=${contact.id}`} className="btn-sm btn-secondary">Edit</Link>
                      <form action={deleteContact.bind(null, contact.id)}>
                        <ConfirmSubmitButton
                          className="btn-sm btn-danger"
                          message={`Delete contact "${contact.fullName}"?`}
                        >
                          Delete
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Saved Messages tab */}
        {activeTab === 'messages' && (
          <div>
            {company.generatedMessages.length === 0 ? (
              <EmptyState
                title="No saved messages"
                description="Generate a message for this company, review it, then save it."
                action={
                  <Link href={`/ai-generator?companyId=${company.id}`} className="btn-primary">
                    Generate Message
                  </Link>
                }
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {company.generatedMessages.map((message) => (
                  <article key={message.id} className="card p-5">
                    <p className="font-semibold text-on-surface">{message.subject}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="muted">{message.purpose}</Badge>
                      <Badge variant="muted">{message.language}</Badge>
                      <Badge variant="muted">{message.tone}</Badge>
                      <Badge variant="muted">{message.provider}</Badge>
                      {message.contact && <Badge variant="primary">{message.contact.fullName}</Badge>}
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-on-surface-muted">
                      {truncate(message.body, 380)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <CopyMessageButton text={`${message.subject}\n\n${message.body}`} label="Copy" />
                      <Link
                        href={`/ai-generator?companyId=${company.id}${message.contactId ? `&contactId=${message.contactId}` : ''}`}
                        className="btn-sm btn-secondary"
                      >
                        Open Generator
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lead Sources tab */}
        {activeTab === 'leads' && (
          <div>
            {company.leads.length === 0 ? (
              <EmptyState
                title="No lead records"
                description="Research records imported from Lead Finder will appear here."
                action={<Link href="/lead-finder" className="btn-primary">Go to Lead Finder</Link>}
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {company.leads.map((lead) => (
                  <article key={lead.id} className="card p-4">
                    <p className="font-semibold text-on-surface">{lead.name}</p>
                    <p className="mt-0.5 text-sm text-on-surface-muted">
                      {lead.category ?? lead.address ?? 'No details'}
                    </p>
                    <a
                      className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline"
                      href={lead.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Google Maps →
                    </a>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
