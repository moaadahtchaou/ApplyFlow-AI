import { describe, expect, it } from 'vitest';
import { assessCvExtraction } from './extract';
import { mockCandidateProfile } from '../ai/cv-analysis';

const richCv = `Mo Aad
Full-Stack Developer

EXPERIENCE
Developer — Example Studio
- Built internal workflow tools with TypeScript and Next.js.
- Reduced manual review time by 30%.

PROJECTS
Recruitment workflow platform
- Built CV import, company research, and personalized messaging features.
- Used TypeScript, Next.js, Prisma and SQLite.

SKILLS
TypeScript, Next.js, Prisma, SQLite, Playwright

EDUCATION
Software Engineering diploma

LANGUAGES
Arabic, French, English

https://github.com/example`;

describe('CV extraction and structured profile', () => {
  it('scores extraction and detects common sections', () => {
    const result = assessCvExtraction(richCv, { fileKind: 'manual' });
    expect(result.wordCount).toBeGreaterThan(40);
    expect(result.detectedSections).toEqual(expect.arrayContaining(['Experience', 'Projects', 'Skills']));
    expect(result.qualityScore).toBeGreaterThan(5);
  });

  it('warns when extraction is fragmented and missing sections', () => {
    const result = assessCvExtraction(Array.from({ length: 35 }, (_, index) => `word${index}`).join('\n'), { fileKind: 'manual' });
    expect(result.warnings.join(' ')).toMatch(/sections|fragmented/i);
    expect(result.qualityScore).toBeLessThan(8);
  });

  it('preserves projects and best-fit evidence in the structured mock profile', () => {
    const extraction = assessCvExtraction(richCv, { fileKind: 'manual' });
    const profile = mockCandidateProfile(extraction);
    expect(profile.projects.length).toBeGreaterThan(0);
    expect(profile.bestFitBullets.length).toBeGreaterThan(0);
    expect(profile.technicalSkills).toContain('TypeScript');
  });
});
