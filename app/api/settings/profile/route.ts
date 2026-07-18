import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { candidateProfileSchema } from '@/lib/ai/contracts';
import {
  mergeCanonicalCandidateProfile,
  parseManualFields
} from '@/lib/ai/candidate-profile';
import { isValidPersonName } from '@/lib/ai/person-name';
import { parseStored } from '@/lib/ai/storage';
import { prisma } from '@/lib/prisma';
import { profileSettingsSchema } from '@/lib/validations/settings';

export const dynamic = 'force-dynamic';

function splitList(value: string) {
  return value.split(/[,\n;|]+/).map((item) => item.trim()).filter(Boolean);
}

function publicSettings<T extends {
  candidateProfile: string;
  defaultSignature: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  targetRole: string;
  experienceSummary: string;
  skills: string;
  languages: string;
  preferredLocations: string;
  cvText: string;
  profileVersion: number;
}>(settings: T) {
  return {
    candidateProfile: settings.candidateProfile,
    defaultSignature: settings.defaultSignature,
    fullName: settings.fullName,
    email: settings.email,
    phone: settings.phone,
    location: settings.location,
    targetRole: settings.targetRole,
    experienceSummary: settings.experienceSummary,
    skills: settings.skills,
    languages: settings.languages,
    preferredLocations: settings.preferredLocations,
    cvText: settings.cvText,
    profileVersion: settings.profileVersion
  };
}

export async function PUT(request: Request) {
  try {
    const input = profileSettingsSchema.parse(await request.json());
    if (input.fullName && !isValidPersonName(input.fullName)) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_FULL_NAME', message: 'Enter a valid person name, not a CV heading or contact value.' }
      }, { status: 400 });
    }

    const previous = await prisma.userSettings.findUnique({ where: { singletonKey: 'default' } });
    const savedProfile = previous
      ? parseStored(candidateProfileSchema, previous.structuredProfile)
      : null;
    const base = savedProfile ?? candidateProfileSchema.parse({});
    const languages = splitList(input.languages).map((value) => {
      const [language, ...level] = value.split(/\s*[—–-]\s*/);
      return { language, level: level.join(' ') || undefined };
    });
    const skills = splitList(input.skills);
    const targetRoles = input.targetRole
      ? [input.targetRole, ...base.targetRoles.filter((role) => role !== input.targetRole)]
      : [];
    const incoming = candidateProfileSchema.parse({
      ...base,
      fullName: input.fullName || undefined,
      email: input.email || undefined,
      phone: input.phone || undefined,
      location: input.location || undefined,
      professionalSummary: input.candidateProfile || undefined,
      targetRoles,
      skills,
      technicalSkills: skills,
      languages,
      preferredLocations: splitList(input.preferredLocations),
      evidenceSummary: input.experienceSummary
        ? [input.experienceSummary, ...base.evidenceSummary.filter((item) => item !== input.experienceSummary)]
        : base.evidenceSummary
    });
    const fieldMap = {
      fullName: 'fullName',
      email: 'email',
      phone: 'phone',
      location: 'location',
      candidateProfile: 'professionalSummary',
      targetRole: 'targetRoles',
      skills: 'skills',
      languages: 'languages',
      preferredLocations: 'preferredLocations',
      experienceSummary: 'evidenceSummary'
    } as const;
    const previousManual = parseManualFields(previous?.profileManualFields);
    const submittedManual = new Set(previousManual);
    for (const [inputKey, profileKey] of Object.entries(fieldMap)) {
      const value = input[inputKey as keyof typeof input];
      if (typeof value === 'string' && value.trim()) submittedManual.add(profileKey);
      else submittedManual.delete(profileKey);
    }
    if (skills.length) submittedManual.add('technicalSkills');
    else submittedManual.delete('technicalSkills');

    const canonical = mergeCanonicalCandidateProfile({
      saved: savedProfile,
      incoming,
      manualFields: submittedManual
    });
    const changed = !previous || Object.keys(input).some((key) =>
      previous[key as keyof typeof previous] !== input[key as keyof typeof input]
    );
    const settings = await prisma.$transaction(async (tx) => {
      const result = await tx.userSettings.upsert({
        where: { singletonKey: 'default' },
        update: {
          ...input,
          structuredProfile: JSON.stringify(canonical),
          profileManualFields: JSON.stringify([...submittedManual]),
          cvAnalysisStatus: canonical.evidenceSummary.length || canonical.projects.length || canonical.experiences.length
            ? 'ready'
            : 'not_analyzed',
          ...(changed ? { profileVersion: { increment: 1 } } : {})
        },
        create: {
          singletonKey: 'default',
          ...input,
          structuredProfile: JSON.stringify(canonical),
          profileManualFields: JSON.stringify([...submittedManual]),
          cvAnalysisStatus: canonical.evidenceSummary.length || canonical.projects.length || canonical.experiences.length
            ? 'ready'
            : 'not_analyzed',
          profileVersion: 1
        }
      });
      if (changed) await tx.candidateCompanyMatch.updateMany({ data: { status: 'outdated' } });
      await tx.activityLog.create({
        data: {
          action: 'updated',
          entityType: 'UserSettings',
          entityName: 'Profile / CV',
          description: 'Candidate profile updated manually.'
        }
      });
      return result;
    });

    revalidatePath('/profile');
    revalidatePath('/ai-generator');
    return NextResponse.json({ success: true, settings: publicSettings(settings), profile: canonical });
  } catch (error) {
    const validation = error instanceof z.ZodError;
    console.error('Candidate profile save failed', {
      code: validation ? 'INVALID_REQUEST' : 'DATABASE_SAVE_FAILED',
      issues: validation
        ? error.issues.slice(0, 15).map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
        : undefined
    });
    return NextResponse.json({
      success: false,
      error: {
        code: validation ? 'INVALID_REQUEST' : 'DATABASE_SAVE_FAILED',
        message: validation ? 'Review the candidate profile fields.' : 'The candidate profile could not be saved.'
      }
    }, { status: validation ? 400 : 500 });
  }
}
