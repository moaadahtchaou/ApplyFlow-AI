import { afterEach, describe, expect, it, vi } from 'vitest';
import { candidateProfileSchema } from './contracts';
import { analyzeCandidateProfile } from './cv-analysis';
import { assessCvExtraction } from '../cv/extract';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CV profile normalization and provider execution', () => {
  it('normalizes common AI field variations and missing optional fields', () => {
    const profile = candidateProfileSchema.parse({
      name: null,
      targetRole: 'Backend Developer',
      skill: 'Node.js, PostgreSQL',
      technicalSkills: 'Node.js; PostgreSQL',
      experience: {
        title: 'Developer',
        employer: 'Example Co',
        duties: 'Built APIs, Reviewed code'
      },
      project: {
        title: 'ApplyFlow',
        summary: 'Application workflow',
        techStack: 'Next.js, Prisma'
      },
      languages: ['English - Fluent', 'French'],
      bestFitBullet: 'Built API workflows'
    });
    expect(profile.fullName).toBeUndefined();
    expect(profile.targetRoles).toEqual(['Backend Developer']);
    expect(profile.skills).toEqual(['Node.js', 'PostgreSQL']);
    expect(profile.experiences[0]).toMatchObject({
      role: 'Developer',
      company: 'Example Co',
      description: '',
      responsibilities: ['Built APIs', 'Reviewed code']
    });
    expect(profile.projects[0]).toMatchObject({
      name: 'ApplyFlow',
      technologies: ['Next.js', 'Prisma']
    });
    expect(profile.languages).toEqual([
      { language: 'English', level: 'Fluent' },
      { language: 'French', level: undefined }
    ]);
    expect(profile.bestFitBullets).toEqual(['Built API workflows']);
    expect(profile.certifications).toEqual([]);
    expect(profile.missingInformation).toEqual([]);
  });

  it('sends valid extracted CV text to NVIDIA with thinking disabled', async () => {
    const cvText = `
      Sam Example
      Backend Developer
      Experience
      Developer at Example Co
      Built REST APIs using Node.js and PostgreSQL.
      Projects
      ApplyFlow
      Application workflow built with Next.js and Prisma.
      Languages
      English
    `.repeat(3);
    const extraction = assessCvExtraction(cvText, { fileKind: 'manual' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            fullName: 'Sam Example',
            targetRole: 'Backend Developer',
            skills: 'Node.js, PostgreSQL',
            technicalSkills: ['Node.js', 'PostgreSQL'],
            experience: [{
              role: 'Developer',
              company: 'Example Co',
              description: 'Built REST APIs using Node.js and PostgreSQL.'
            }],
            project: [{
              name: 'ApplyFlow',
              description: 'Application workflow built with Next.js and Prisma.',
              technologies: 'Next.js, Prisma'
            }],
            languages: ['English']
          })
        }
      }]
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeCandidateProfile(extraction, {
      requestedProvider: 'nvidia',
      apiKey: 'nvapi-test-key-that-is-long-enough',
      baseUrl: 'http://nvidia.test/v1',
      timeoutMs: 2_000
    });

    expect(result.profile.targetRoles).toContain('Backend Developer');
    expect(result.profile.projects[0]?.name).toBe('ApplyFlow');
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.messages[1].content).toContain('Built REST APIs');
    expect(request.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it('runs Mock analysis only when Mock is explicitly selected', async () => {
    const extraction = assessCvExtraction(`
      Example Developer
      Skills
      React, TypeScript, Next.js
      Projects
      Portfolio
      Built a portfolio using React and TypeScript.
    `.repeat(3), { fileKind: 'manual' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await analyzeCandidateProfile(extraction, {
      requestedProvider: 'mock',
      apiKey: ''
    });
    expect(result.metadata).toMatchObject({ provider: 'mock', fallbackUsed: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps contact details and technical evidence while excluding hobbies from skills', async () => {
    const extraction = assessCvExtraction(`
      Sam Example
      sam@example.com
      +212 600 000 000
      Location: Casablanca
      Full-Stack Developer
      Skills
      React, Next.js, Node.js, TypeScript, Python, PostgreSQL, MongoDB, Docker, REST APIs,
      Authentication, Shopify, AI Integration
      Projects
      Commerce Platform
      Built authenticated APIs and a Shopify integration using TypeScript and PostgreSQL.
      Interests
      Video games, history, and webnovel reading
    `.repeat(3), { fileKind: 'manual' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        fullName: 'Sam Example',
        email: 'sam@example.com',
        phone: '+212 600 000 000',
        location: 'Casablanca',
        targetRoles: ['Full-Stack Developer'],
        skills: ['Video games', 'History', 'Webnovel reading', 'React'],
        technicalSkills: ['React'],
        projects: [{
          name: 'Commerce Platform',
          description: 'Built authenticated APIs and a Shopify integration using TypeScript and PostgreSQL.',
          technologies: ['TypeScript', 'PostgreSQL', 'Shopify']
        }]
      }) } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const result = await analyzeCandidateProfile(extraction, {
      requestedProvider: 'nvidia',
      apiKey: 'nvapi-test-key-that-is-long-enough',
      baseUrl: 'http://nvidia.test/v1',
      timeoutMs: 2_000
    });
    expect(result.profile).toMatchObject({
      fullName: 'Sam Example',
      email: 'sam@example.com',
      location: 'Casablanca'
    });
    expect(result.profile.technicalSkills).toEqual(expect.arrayContaining([
      'React', 'Next.js', 'Node.js', 'TypeScript', 'Python', 'PostgreSQL', 'MongoDB', 'Docker',
      'Authentication', 'Shopify', 'AI Integration'
    ]));
    expect(result.profile.skills.join(' ')).not.toMatch(/video games|history|webnovel/i);
    expect(result.profile.strengths.length).toBeGreaterThan(0);
    expect(result.profile.bestFitBullets.length).toBeGreaterThan(0);
  });
});
