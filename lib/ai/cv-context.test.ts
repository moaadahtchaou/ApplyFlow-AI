import { describe, expect, it } from 'vitest';
import { analyzeCvContextMock, cvContextDraftSchema } from './cv-context';

describe('CV context mock analysis', () => {
  it('returns candidate profile, skills, roles, and warnings from local heuristics', () => {
    const draft = analyzeCvContextMock(`
      Mohamed Example
      Full-stack developer based in Casablanca
      Email: mohamed@example.com
      Skills: React, TypeScript, Next.js, Node.js, Prisma, PostgreSQL
      Projects: Built a local CRM with Next.js and Prisma.
      Languages: English, French, Arabic
    `);

    expect(draft.candidateProfile).toContain('Full-Stack Developer');
    expect(draft.skills).toContain('React');
    expect(draft.skills).toContain('TypeScript');
    expect(draft.targetRolesDetected).toContain('Full-Stack Developer');
    expect(draft.languages).toContain('English');
    expect(draft.preferredLocations).toContain('Casablanca');
    expect(draft.bestFitBullets.length).toBeGreaterThan(0);
    expect(draft.missingProfileWarnings.some((warning) => warning.includes('phone'))).toBe(true);
  });

  it('does not invent seniority or years when the CV does not mention them', () => {
    const draft = analyzeCvContextMock(`
      Developer
      Skills: JavaScript, React
      Project: Portfolio website
    `);

    expect(draft.candidateProfile.toLowerCase()).not.toContain('senior');
    expect(draft.candidateProfile).not.toMatch(/\b\d+\s+years?\b/i);
  });

  it('validates the structured draft shape', () => {
    const draft = analyzeCvContextMock(`
      Backend developer
      Skills: Node.js, PostgreSQL, Docker
      Experience: Built REST API services.
      Contact: backend@example.com +212 600 000 000
    `);

    expect(() => cvContextDraftSchema.parse(draft)).not.toThrow();
  });
});
