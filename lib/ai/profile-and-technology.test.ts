import { describe, expect, it } from 'vitest';
import { candidateProfileSchema } from './contracts';
import { mergeCanonicalCandidateProfile } from './candidate-profile';
import { contactFacts } from './cv-analysis';
import { isCvSectionHeading, isValidPersonName } from './person-name';
import { extractTechnologies } from './technologies';

describe('candidate name validation and canonical merging', () => {
  it.each([
    'Formation',
    'ÉDUCATION',
    'Profil',
    'Résumé',
    'Expérience',
    'Compétences',
    'Projets',
    'Langues',
    'Curriculum Vitae',
    'CV'
  ])('rejects the CV heading %s as a person name', (heading) => {
    expect(isCvSectionHeading(heading)).toBe(true);
    expect(isValidPersonName(heading)).toBe(false);
  });

  it('accepts a person name and prefers it over an earlier heading', () => {
    expect(isValidPersonName('Amine El Mansouri')).toBe(true);
    expect(contactFacts('Formation\nAmine El Mansouri\nDéveloppeur web\namine@example.com').fullName)
      .toBe('Amine El Mansouri');
  });

  it('preserves a valid manual name when AI returns an invalid or empty name', () => {
    const saved = candidateProfileSchema.parse({
      fullName: 'Amine El Mansouri',
      targetRoles: ['Full-Stack Developer'],
      skills: ['TypeScript']
    });
    const invalid = candidateProfileSchema.parse({
      fullName: 'Formation',
      targetRoles: [],
      skills: []
    });
    const merged = mergeCanonicalCandidateProfile({
      saved,
      incoming: invalid,
      manualFields: ['fullName']
    });
    expect(merged.fullName).toBe('Amine El Mansouri');
    expect(merged.targetRoles).toEqual(['Full-Stack Developer']);
    expect(merged.skills).toEqual(['TypeScript']);
  });

  it('fills empty saved fields without replacing non-empty saved values', () => {
    const saved = candidateProfileSchema.parse({ fullName: 'Amine El Mansouri' });
    const incoming = candidateProfileSchema.parse({
      fullName: 'Different Candidate',
      targetRoles: ['Backend Developer'],
      technicalSkills: ['Node.js']
    });
    const merged = mergeCanonicalCandidateProfile({ saved, incoming });
    expect(merged.fullName).toBe('Amine El Mansouri');
    expect(merged.targetRoles).toEqual(['Backend Developer']);
    expect(merged.technicalSkills).toEqual(['Node.js']);
  });
});

describe('technology extraction', () => {
  it('counts exactly three unique technologies without metadata', () => {
    expect(extractTechnologies(
      'Shopify developer',
      'I delivered a Shopify theme using Liquid and JavaScript.',
      ['Shopify', 'Liquid', 'JavaScript', 'HiddenMetadataTech']
    )).toEqual(['JavaScript', 'Shopify', 'Liquid']);
  });

  it('does not count Java inside JavaScript', () => {
    const technologies = extractTechnologies('', 'Built the client in JavaScript.', ['JavaScript', 'Java']);
    expect(technologies).toContain('JavaScript');
    expect(technologies).not.toContain('Java');
  });

  it('normalizes aliases and case-insensitive duplicates', () => {
    const technologies = extractTechnologies(
      'NEXT JS and Postgres',
      'NodeJS, node.js, PostgreSQL and Next.js were used.',
      ['Node.js', 'NodeJS', 'Postgres', 'Next.js']
    );
    expect(technologies).toEqual(expect.arrayContaining(['Node.js', 'PostgreSQL', 'Next.js']));
    expect(technologies.filter((item) => item === 'Node.js')).toHaveLength(1);
  });
});
