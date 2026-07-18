import { CvUploadClient } from '@/components/forms/CvUploadClient';
import { ProfileForm } from '@/components/forms/ProfileForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { getOrCreateSettings } from '@/lib/settings';
import {
  aiExecutionMetadataSchema,
  candidateProfileSchema,
  cvExtractionResultSchema
} from '@/lib/ai/contracts';
import { parseStored } from '@/lib/ai/storage';
import { getAiProviderStatus } from '@/lib/ai/generate-email';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profile / CV' };

export default async function ProfilePage() {
  const [settings, providerStatus] = await Promise.all([getOrCreateSettings(), getAiProviderStatus()]);
  const extraction = parseStored(cvExtractionResultSchema, settings.cvExtractionData);
  const profile = parseStored(candidateProfileSchema, settings.structuredProfile);
  const metadata = settings.cvAnalysisProvider ? aiExecutionMetadataSchema.safeParse({
    provider: settings.cvAnalysisProvider,
    model: settings.cvAnalysisModel ?? undefined,
    fallbackUsed: false,
    generatedAt: settings.cvAnalyzedAt?.toISOString() ?? new Date().toISOString(),
    latencyMs: settings.cvAnalysisLatencyMs ?? undefined,
    requestId: settings.cvAnalysisRequestId ?? undefined
  }) : null;

  return (
    <div>
      <PageHeader
        title="Profile / CV"
        description="Keep the facts AI uses to personalize your messages. Review every draft before sending manually."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Left: CV workspace */}
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-on-surface">Upload & Analyze CV</h2>
              <p className="mt-0.5 text-xs text-on-surface-muted">
                PDF and plain text are supported. The original file is not stored.
              </p>
            </div>
            <div className="p-5">
              <CvUploadClient
                initialExtraction={extraction}
                initialProfile={profile}
                initialMetadata={metadata?.success ? metadata.data : null}
                initialPromptVersion={settings.cvAnalysisVersion}
                activeProvider={providerStatus.provider}
                activeModel={providerStatus.provider === 'mock' ? 'deterministic-local' : providerStatus.model}
              />
            </div>
          </div>
        </div>

        {/* Right: Candidate profile */}
        <div className="card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-on-surface">Candidate Profile</h2>
            <p className="mt-0.5 text-xs text-on-surface-muted">
              These fields provide reusable context to the AI Generator.
            </p>
          </div>
          <div className="p-5">
            <ProfileForm key={`profile-${settings.profileVersion}`} settings={settings} />
          </div>
        </div>
      </div>
    </div>
  );
}
