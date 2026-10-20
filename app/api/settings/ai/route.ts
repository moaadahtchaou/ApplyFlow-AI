import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getOrCreateSettings, publicAiSettings, updateAiSettings } from '@/lib/settings';
import { systemSettingsSchema } from '@/lib/validations/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ success: true, settings: publicAiSettings(await getOrCreateSettings()) });
}

export async function PATCH(request: Request) {
  try {
    const input = systemSettingsSchema.parse(await request.json());
    const settings = await updateAiSettings(input);
    await prisma.activityLog.create({
      data: {
        action: 'updated',
        entityType: 'UserSettings',
        entityName: 'System settings',
        description: `AI provider changed to ${settings.aiProvider}.`
      }
    });
    revalidatePath('/settings');
    revalidatePath('/profile');
    revalidatePath('/ai-generator');
    return NextResponse.json({ success: true, settings: publicAiSettings(settings) });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? 'Review the provider and default settings.'
      : error instanceof Error
        ? error.message
        : 'Could not save AI settings.';
    return NextResponse.json({ success: false, error: { code: 'INVALID_REQUEST', message } }, { status: 400 });
  }
}
