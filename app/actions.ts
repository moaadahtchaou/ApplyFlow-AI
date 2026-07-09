'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { companySchema } from '@/lib/validations/company';
import { contactSchema } from '@/lib/validations/contact';
import { profileSettingsSchema, systemSettingsSchema } from '@/lib/validations/settings';
import { templateSchema } from '@/lib/validations/template';

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function nullableText(formData: FormData, key: string) {
  const value = text(formData, key).trim();
  return value || undefined;
}

function safeRedirectPath(formData: FormData) {
  const value = text(formData, 'redirectTo').trim();
  return value.startsWith('/') && !value.startsWith('//') ? value : '';
}

async function activity(action: string, entityType: string, entityName?: string | null, description?: string) {
  await prisma.activityLog.create({ data: { action, entityType, entityName: entityName ?? undefined, description } });
}

function companyInput(formData: FormData) {
  return companySchema.parse({
    name: text(formData, 'name'),
    website: nullableText(formData, 'website'),
    email: nullableText(formData, 'email'),
    phone: nullableText(formData, 'phone'),
    linkedinUrl: nullableText(formData, 'linkedinUrl'),
    industry: nullableText(formData, 'industry'),
    location: nullableText(formData, 'location'),
    city: nullableText(formData, 'city'),
    status: text(formData, 'status') || 'new',
    sourceUrl: nullableText(formData, 'sourceUrl'),
    notes: nullableText(formData, 'notes')
  });
}

export async function createCompany(formData: FormData) {
  const company = await prisma.company.create({ data: companyInput(formData) });
  await activity('created', 'Company', company.name, 'Company added.');
  revalidatePath('/companies');
  revalidatePath('/');
  redirect('/companies');
}

export async function updateCompany(id: string, formData: FormData) {
  const company = await prisma.company.update({ where: { id }, data: companyInput(formData) });
  await activity('updated', 'Company', company.name, 'Company updated.');
  revalidatePath('/companies');
  revalidatePath(`/companies/${id}`);
  revalidatePath('/');
  redirect('/companies');
}

export async function deleteCompany(id: string) {
  const company = await prisma.company.delete({ where: { id } });
  await activity('deleted', 'Company', company.name, 'Company deleted. Related contacts and saved messages were kept without the company link.');
  revalidatePath('/companies');
  revalidatePath('/');
}

function contactInput(formData: FormData) {
  return contactSchema.parse({
    fullName: text(formData, 'fullName'),
    title: nullableText(formData, 'title'),
    email: text(formData, 'email'),
    linkedinUrl: nullableText(formData, 'linkedinUrl'),
    phone: nullableText(formData, 'phone'),
    companyId: nullableText(formData, 'companyId'),
    notes: nullableText(formData, 'notes')
  });
}

export async function createContact(formData: FormData) {
  const redirectTo = safeRedirectPath(formData);
  const contact = await prisma.contact.create({ data: contactInput(formData) });
  await activity('created', 'Contact', contact.fullName, 'Contact added.');
  revalidatePath('/contacts');
  revalidatePath('/companies');
  revalidatePath('/');
  if (redirectTo) {
    revalidatePath(redirectTo);
    redirect(redirectTo);
  }
  redirect('/contacts');
}

export async function updateContact(id: string, formData: FormData) {
  const redirectTo = safeRedirectPath(formData);
  const contact = await prisma.contact.update({ where: { id }, data: contactInput(formData) });
  await activity('updated', 'Contact', contact.fullName, 'Contact updated.');
  revalidatePath('/contacts');
  revalidatePath('/companies');
  revalidatePath('/');
  if (redirectTo) {
    revalidatePath(redirectTo);
    redirect(redirectTo);
  }
  redirect('/contacts');
}

export async function deleteContact(id: string) {
  const contact = await prisma.contact.delete({ where: { id } });
  await activity('deleted', 'Contact', contact.fullName, 'Contact deleted. Saved messages were kept without the contact link.');
  revalidatePath('/contacts');
  if (contact.companyId) revalidatePath(`/companies/${contact.companyId}`);
  revalidatePath('/');
}

export async function createTemplate(formData: FormData) {
  const input = templateSchema.parse({
    name: text(formData, 'name'),
    type: text(formData, 'type'),
    subject: text(formData, 'subject'),
    body: text(formData, 'body')
  });
  const template = await prisma.emailTemplate.create({ data: input });
  await activity('created', 'EmailTemplate', template.name, 'Template created.');
  revalidatePath('/templates');
  redirect('/templates');
}

export async function updateTemplate(id: string, formData: FormData) {
  const input = templateSchema.parse({
    name: text(formData, 'name'),
    type: text(formData, 'type'),
    subject: text(formData, 'subject'),
    body: text(formData, 'body')
  });
  const template = await prisma.emailTemplate.update({ where: { id }, data: input });
  await activity('updated', 'EmailTemplate', template.name, 'Template updated.');
  revalidatePath('/templates');
  redirect('/templates');
}

export async function deleteTemplate(id: string) {
  const template = await prisma.emailTemplate.delete({ where: { id } });
  await activity('deleted', 'EmailTemplate', template.name, 'Template deleted.');
  revalidatePath('/templates');
}

export async function updateProfile(formData: FormData) {
  const input = profileSettingsSchema.parse({
    candidateProfile: text(formData, 'candidateProfile'),
    defaultSignature: text(formData, 'defaultSignature'),
    fullName: text(formData, 'fullName'),
    email: text(formData, 'email'),
    phone: text(formData, 'phone'),
    location: text(formData, 'location'),
    targetRole: text(formData, 'targetRole'),
    experienceSummary: text(formData, 'experienceSummary'),
    skills: text(formData, 'skills'),
    languages: text(formData, 'languages'),
    preferredLocations: text(formData, 'preferredLocations'),
    cvText: text(formData, 'cvText')
  });
  await prisma.userSettings.upsert({
    where: { singletonKey: 'default' },
    update: input,
    create: { singletonKey: 'default', ...input }
  });
  await activity('updated', 'UserSettings', 'Profile / CV', 'Candidate profile updated.');
  revalidatePath('/profile');
  revalidatePath('/ai-generator');
  redirect('/profile');
}

export async function updateSystemSettings(formData: FormData) {
  const input = systemSettingsSchema.parse({
    aiProvider: text(formData, 'aiProvider'),
    nvidiaApiKey: text(formData, 'nvidiaApiKey'),
    defaultTone: text(formData, 'defaultTone'),
    defaultLanguage: text(formData, 'defaultLanguage')
  });
  await prisma.userSettings.upsert({
    where: { singletonKey: 'default' },
    update: input,
    create: { singletonKey: 'default', ...input }
  });
  await activity('updated', 'UserSettings', 'System settings', 'AI defaults updated.');
  revalidatePath('/settings');
  revalidatePath('/ai-generator');
  redirect('/settings');
}
