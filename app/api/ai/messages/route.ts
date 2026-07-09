import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { generatedMessageSchema } from '@/lib/validations/generated-message';

export async function POST(request: Request) {
  try {
    const input = generatedMessageSchema.parse(await request.json());
    const message = await prisma.generatedMessage.create({ data: input });

    await prisma.activityLog.create({
      data: {
        action: 'generated',
        entityType: 'GeneratedMessage',
        entityName: input.subject,
        description: `Saved a ${input.language} message using the ${input.provider} provider.`
      }
    });

    revalidatePath('/');
    revalidatePath('/ai-generator');
    if (input.companyId) revalidatePath(`/companies/${input.companyId}`);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not save this generated message.' }, { status: 400 });
  }
}
