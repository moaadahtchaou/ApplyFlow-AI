import { AiGeneratorClient } from '@/components/forms/AiGeneratorClient';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { getAiProviderStatus } from '@/lib/ai/generate-email';
import { prisma } from '@/lib/prisma';
import { getOrCreateSettings } from '@/lib/settings';
import { formatDate, truncate } from '@/lib/utils';
import Link from 'next/link';

export const metadata = { title: 'AI Generator' };

export default async function AiGeneratorPage({
  searchParams
}: {
  searchParams: Promise<{ companyId?: string; contactId?: string }>
}) {
  const params = await searchParams;
  const [companies, contacts, settings] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
    prisma.contact.findMany({ orderBy: { fullName: 'asc' }, select: { id: true, fullName: true, email: true, companyId: true } }),
    getOrCreateSettings()
  ]);
  const aiStatus = await getAiProviderStatus();
  const settingsDraft = {
    candidateProfile: settings.candidateProfile || [
      settings.experienceSummary,
      settings.skills ? `Skills: ${settings.skills}` : '',
      settings.languages ? `Languages: ${settings.languages}` : '',
      settings.cvText
    ].filter(Boolean).join('\n'),
    defaultSignature: settings.defaultSignature,
    defaultTone: settings.defaultTone,
    defaultLanguage: settings.defaultLanguage,
    targetRole: settings.targetRole
  };
  const recentMessages = await prisma.generatedMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 6,
    include: { company: true }
  });
  const initialCompanyId = companies.some((c) => c.id === params.companyId) ? params.companyId : undefined;
  const initialContact = contacts.find((c) => c.id === params.contactId);
  const initialContactId =
    initialContact && (!initialCompanyId || initialContact.companyId === initialCompanyId)
      ? initialContact.id
      : undefined;

  return (
    <div>
      <PageHeader
        title="AI Message Generator"
        description="Create personalized outreach messages, edit them, then copy and send manually."
      />

      {/* Provider status bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
        <span className="text-xs font-semibold text-on-surface-muted">Provider:</span>
        <Badge variant={aiStatus.mockMode ? 'warning' : 'success'}>{aiStatus.provider}</Badge>
        <span className="text-xs text-on-surface-muted">{aiStatus.model}</span>
        {aiStatus.nvidiaConfigured && <Badge variant="primary">NVIDIA ✓</Badge>}
        {aiStatus.mockMode && <Badge variant="warning">Fallback Active</Badge>}
        <Link href="/settings" className="ml-auto text-xs font-semibold text-primary hover:underline">
          Configure →
        </Link>
      </div>

      {/* Two-pane generator */}
      <AiGeneratorClient
        companies={companies}
        contacts={contacts}
        settings={settingsDraft}
        initialCompanyId={initialCompanyId}
        initialContactId={initialContactId}
      />

      {/* Saved history */}
      {recentMessages.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-on-surface">Saved Message History</h2>
            <span className="text-xs text-on-surface-muted">{recentMessages.length} saved</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentMessages.map((message) => (
              <div key={message.id} className="card p-4">
                <p className="truncate font-semibold text-on-surface">{message.subject}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="muted">{message.purpose}</Badge>
                  <Badge variant="muted">{message.language}</Badge>
                  {message.company && (
                    <Badge variant="primary">{message.company.name}</Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-on-surface-muted">{formatDate(message.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
