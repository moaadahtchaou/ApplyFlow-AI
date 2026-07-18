import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { SavedMessageDetail } from '@/components/messages/SavedMessageDetail';
import { getOrCreateSettings } from '@/lib/settings';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Saved message' };

function parseObject(value: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, string | null>
      : null;
  } catch {
    return null;
  }
}

export default async function SavedMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await getOrCreateSettings();
  const message = await prisma.generatedMessage.findFirst({ where: { id, ownerSettingsId: owner.id } });
  if (!message) notFound();

  return (
    <div>
      <PageHeader title="Saved message" description="This is the persisted message snapshot; opening it does not regenerate content." />
      <SavedMessageDetail message={{
        id: message.id,
        subject: message.subject,
        body: message.body,
        companyName: message.companyNameSnapshot ?? 'Company unavailable',
        companyWebsite: message.companyWebsiteSnapshot,
        contact: parseObject(message.contactSnapshot),
        targetRole: message.purpose,
        language: message.language,
        tone: message.tone,
        signature: message.signatureSnapshot,
        messageType: message.messageType,
        provider: message.provider,
        providerModel: message.providerModel,
        qualityScore: message.qualityScore,
        matchingAngle: message.matchingAngle,
        evidence: parseObject(message.evidenceSnapshot),
        automaticRewriteUsed: message.automaticRewriteUsed,
        generatedAt: message.generatedAt?.toISOString() ?? null,
        createdAt: message.createdAt.toISOString(),
        profileVersion: message.profileVersion,
        researchVersion: message.researchVersion,
        matchVersion: message.matchVersion
      }} />
    </div>
  );
}
