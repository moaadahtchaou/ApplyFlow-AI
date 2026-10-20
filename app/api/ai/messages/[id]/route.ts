import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { getOrCreateSettings } from '@/lib/settings';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function parseJson(value: string) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function ownedMessage(id: string) {
  const owner = await getOrCreateSettings();
  return prisma.generatedMessage.findFirst({
    where: { id, ownerSettingsId: owner.id }
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const message = await ownedMessage(id);
  if (!message) {
    return NextResponse.json({ error: 'Saved message not found.', code: 'NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json({
    message: {
      ...message,
      contact: parseJson(message.contactSnapshot),
      evidence: parseJson(message.evidenceSnapshot),
      evaluation: parseJson(message.evaluationData)
    }
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const message = await ownedMessage(id);
  if (!message) {
    return NextResponse.json({ error: 'Saved message not found.', code: 'NOT_FOUND' }, { status: 404 });
  }
  await prisma.$transaction([
    prisma.generatedMessage.delete({ where: { id: message.id } }),
    prisma.activityLog.create({
      data: {
        action: 'deleted',
        entityType: 'GeneratedMessage',
        entityName: message.subject,
        description: 'Deleted one saved message snapshot.'
      }
    })
  ]);
  revalidatePath('/ai-generator');
  revalidatePath(`/ai-generator/messages/${id}`);
  return NextResponse.json({ success: true, id });
}
