import { NextResponse } from 'next/server';
import { generateEmail } from '@/lib/ai/generate-email';
import { prisma } from '@/lib/prisma';
import { aiEmailRequestSchema, type AiEmailGenerationContext } from '@/lib/validations/ai';

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = aiEmailRequestSchema.parse(body);

    const [company, contact] = await Promise.all([
      input.companyId ? prisma.company.findUnique({ where: { id: input.companyId } }) : null,
      input.contactId ? prisma.contact.findUnique({ where: { id: input.contactId } }) : null
    ]);

    const context: AiEmailGenerationContext = {
      ...input,
      companyName: company?.name ?? 'the company',
      companyWebsite: company?.website,
      companyIndustry: company?.industry,
      contactName: contact?.fullName,
      contactTitle: contact?.title,
      contactEmail: contact?.email
    };

    const email = await generateEmail(context);
    return NextResponse.json({ email });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not generate email. Check the request fields and try again.' }, { status: 400 });
  }
}
