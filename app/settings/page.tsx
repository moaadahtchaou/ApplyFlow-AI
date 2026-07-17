import Link from 'next/link';
import { SettingsForm } from '@/components/forms/SettingsForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { ThemeSection } from '@/components/theme/ThemeSection';
import { getAiProviderStatus } from '@/lib/ai/generate-email';
import { getOrCreateSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const [settings, aiStatus] = await Promise.all([getOrCreateSettings(), getAiProviderStatus()]);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Choose the AI provider and default message style."
      />

      <div className="space-y-6">
        {/* Appearance */}
        <div className="card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-on-surface">Appearance</h2>
            <p className="mt-0.5 text-xs text-on-surface-muted">
              Theme is stored locally and never synced to the database.
            </p>
          </div>
          <div className="p-5">
            <ThemeSection />
          </div>
        </div>

        <SettingsForm
          initialSettings={{
            aiProvider: aiStatus.provider,
            defaultTone: settings.defaultTone,
            defaultLanguage: settings.defaultLanguage,
            nvidiaConfigured: aiStatus.nvidiaConfigured,
            model: aiStatus.model,
            mockMode: aiStatus.mockMode,
            timeoutMs: aiStatus.timeoutMs
          }}
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <div />
          <div>
            <div className="card p-5">
              <h3 className="mb-2 text-sm font-semibold text-on-surface">Local Data</h3>
              <p className="mb-4 text-xs leading-relaxed text-on-surface-muted">
                Company and lead data stays in local SQLite. Use CSV to move records without publishing your database.
              </p>
              <div className="flex flex-wrap gap-2">
                <a className="btn-sm btn-secondary" href="/api/companies/export">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Export Companies CSV
                </a>
                <Link className="btn-sm btn-primary" href="/lead-finder">
                  Import Leads
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
