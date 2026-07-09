import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildLeadFingerprint } from '@/lib/leads/utils';
import { leadUpdateSchema } from '@/lib/validations/lead';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = leadUpdateSchema.parse(await request.json());
    const current = await prisma.lead.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

    const name = input.name ?? current.name;
    const address = input.address === undefined ? current.address : input.address || null;
    const website = input.website === undefined ? current.website : input.website || null;
    const lead = await prisma.lead.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name } : {}),
        ...(input.category !== undefined ? { category: input.category || null } : {}),
        ...(input.address !== undefined ? { address } : {}),
        ...(input.city !== undefined ? { city: input.city || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.email !== undefined ? { email: input.email || null } : {}),
        ...(input.website !== undefined ? { website } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        fingerprint: buildLeadFingerprint({ name, address, website })
      }
    });
    return NextResponse.json({ lead });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not update this lead.' }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: { id: true, name: true }
    });
    if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

    await prisma.$transaction([
      prisma.lead.delete({ where: { id } }),
      prisma.activityLog.create({
        data: {
          action: 'lead_removed',
          entityType: 'Lead',
          entityName: lead.name,
          description: 'Lead removed from the Lead Inbox.'
        }
      })
    ]);

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not remove this lead.' }, { status: 400 });
  }
}
