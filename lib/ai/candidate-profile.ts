import { candidateProfileSchema, type CandidateProfile } from '@/lib/ai/contracts';
import { isValidPersonName } from '@/lib/ai/person-name';

export const editableProfileFields = [
  'fullName',
  'email',
  'phone',
  'location',
  'professionalSummary',
  'targetRoles',
  'skills',
  'technicalSkills',
  'languages',
  'preferredLocations'
] as const;

export type EditableProfileField = typeof editableProfileFields[number];

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
}

function validName(value: unknown) {
  return isValidPersonName(value) ? value.trim().replace(/\s+/g, ' ') : undefined;
}

export function sanitizeCandidateName(profile: CandidateProfile, fallbackName?: string) {
  const fullName = validName(profile.fullName) ?? validName(fallbackName);
  const missingInformation = profile.missingInformation.filter((item) =>
    !/candidate (?:full )?name|full name/i.test(item)
  );
  if (!fullName) missingInformation.push('Candidate full name was not found or could not be validated.');
  return candidateProfileSchema.parse({ ...profile, fullName, missingInformation });
}

export function mergeCanonicalCandidateProfile(input: {
  saved?: CandidateProfile | null;
  incoming: CandidateProfile;
  manualFields?: Iterable<string>;
}) {
  const saved = input.saved ? sanitizeCandidateName(input.saved) : null;
  const incoming = sanitizeCandidateName(input.incoming, saved?.fullName);
  if (!saved) return incoming;

  const merged: Record<string, unknown> = { ...incoming };
  for (const key of Object.keys(saved) as Array<keyof CandidateProfile>) {
    if (hasValue(saved[key])) merged[key] = saved[key];
  }

  for (const key of input.manualFields ?? []) {
    if (key in incoming) merged[key] = incoming[key as keyof CandidateProfile];
  }

  merged.fullName = validName(merged.fullName) ?? saved.fullName;
  return sanitizeCandidateName(candidateProfileSchema.parse(merged), saved.fullName);
}

export function parseManualFields(value: string | null | undefined) {
  if (!value) return new Set<string>();
  try {
    const parsed = JSON.parse(value);
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set<string>();
  }
}
