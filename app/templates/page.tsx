import Link from 'next/link';
import { Suspense } from 'react';
import { deleteTemplate } from '@/app/actions';
import { TemplateForm } from '@/components/forms/TemplateForm';
import { ConfirmSubmitButton } from '@/components/ui/ConfirmSubmitButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { prisma } from '@/lib/prisma';
import { humanize, truncate } from '@/lib/utils';
import { TemplateDrawerTrigger } from '@/components/forms/TemplateDrawerTrigger';

export const metadata = { title: 'Templates' };

export default async function TemplatesPage({
  searchParams
}: {
  searchParams: Promise<{ edit?: string; new?: string; q?: string }>
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? '';
  const isDrawerOpen = !!(params.new || params.edit);

  const [allTemplates, editingTemplate] = await Promise.all([
    prisma.emailTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      where: query ? {
        OR: [
          { name: { contains: query } },
          { type: { contains: query } },
          { subject: { contains: query } }
        ]
      } : undefined
    }),
    params.edit ? prisma.emailTemplate.findUnique({ where: { id: params.edit } }) : null
  ]);

  return (
    <div>
      <PageHeader
        title="Message Templates"
        description="Reusable starting points for applications, introductions, and general outreach."
        action={
          <Link href="/templates?new=1" className="btn-primary">
            + Create Template
          </Link>
        }
      />

      {/* Search bar */}
      <form method="get" className="mb-4 flex gap-3">
        <input
          className="input flex-1"
          name="q"
          defaultValue={query}
          placeholder="Search templates…"
        />
        <button className="btn-secondary" type="submit">Search</button>
        {query && <Link href="/templates" className="btn-ghost">Clear</Link>}
      </form>

      {allTemplates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description={query ? 'No templates match your search.' : 'Create your first reusable message template.'}
          action={
            !query
              ? <Link href="/templates?new=1" className="btn-primary">Create Template</Link>
              : <Link href="/templates" className="btn-secondary">Clear search</Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {allTemplates.map((template) => (
            <article key={template.id} className="card p-5 flex flex-col gap-3 transition hover:-translate-y-0.5 hover:shadow-card-hover">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-on-surface">{template.name}</p>
                  <Badge variant="primary" className="mt-1">{humanize(template.type)}</Badge>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Link href={`/templates?edit=${template.id}`} className="btn-icon h-8 w-8" title="Edit template">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </Link>
                  <form action={deleteTemplate.bind(null, template.id)}>
                    <ConfirmSubmitButton
                      className="btn-icon h-8 w-8 btn-danger"
                      message={`Delete template "${template.name}"? This cannot be undone.`}
                      title="Delete template"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
              <p className="text-sm font-medium text-on-surface">{template.subject}</p>
              <p className="text-xs leading-relaxed text-on-surface-muted">{truncate(template.body, 160)}</p>
            </article>
          ))}
        </div>
      )}

      {/* Template Drawer */}
      <Suspense>
        <TemplateDrawerTrigger
          template={editingTemplate}
          isOpen={isDrawerOpen}
        />
      </Suspense>
    </div>
  );
}
