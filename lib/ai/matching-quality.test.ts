import { describe, expect, it } from 'vitest';
import {
  candidateProfileSchema,
  companyResearchSchema,
  generatedApplicationMessageSchema
} from './contracts';
import { createCandidateCompanyMatch, rankCandidateProjects } from './matching';
import { evaluateMessageQuality, needsAutomaticRewrite } from './quality';
import { runMessagePipeline } from './message-pipeline';

const candidate = candidateProfileSchema.parse({
  targetRoles: ['Full-Stack Developer'],
  skills: ['TypeScript', 'Next.js', 'Prisma'],
  technicalSkills: ['TypeScript', 'Next.js', 'Prisma'],
  softSkills: [],
  experiences: [],
  projects: [
    {
      name: 'Recruitment Workflow',
      description: 'Built a recruitment CRM with CV import and personalized outreach.',
      technologies: ['TypeScript', 'Next.js', 'Prisma'],
      features: ['CV import', 'company research'],
      achievements: ['Reduced manual outreach preparation by 30%.']
    },
    {
      name: 'Recipe Mobile App',
      description: 'Built a small recipe browsing app.',
      technologies: ['Expo'],
      features: ['Recipe search'],
      achievements: []
    }
  ],
  education: [],
  certifications: [],
  languages: [],
  preferredLocations: [],
  strengths: [],
  bestFitBullets: ['Reduced manual outreach preparation by 30%.'],
  evidenceSummary: ['Built a recruitment CRM with CV import and personalized outreach.'],
  missingInformation: []
});

const research = companyResearchSchema.parse({
  companyName: 'Acme Hiring',
  website: 'https://acme.example',
  summary: 'Acme Hiring provides recruitment workflow software.',
  services: ['Recruitment workflow automation'],
  products: ['Hiring platform'],
  solutions: [],
  customerTypes: ['Recruiting teams'],
  technologiesMentioned: ['TypeScript'],
  locations: [],
  hiringSignals: [],
  relevantDepartments: [],
  relevantProjects: [],
  personalizationHooks: [{
    fact: 'Acme Hiring provides recruitment workflow software for recruiting teams.',
    relevance: 'Relevant to recruitment tooling experience.',
    sourceUrl: 'https://acme.example/about'
  }],
  sources: [{ url: 'https://acme.example/about', extractedAt: new Date().toISOString() }],
  missingInformation: [],
  confidenceScore: 8,
  analyzedAt: new Date().toISOString(),
  fetchWarnings: [],
  failedPages: []
});

describe('matching and quality evaluation', () => {
  it('ranks the evidence-relevant project above an unrelated project', () => {
    const ranking = rankCandidateProjects(candidate, research, 'Full-Stack Developer');
    expect(ranking[0].projectName).toBe('Recruitment Workflow');
    expect(ranking[0].score).toBeGreaterThan(ranking[1].score);
    expect(ranking[0].explanation).toContain('technology match');
    expect(ranking[1].explanation).toContain('Score');
  });

  it('accepts a supported paraphrase instead of requiring an exact company-fact string', () => {
    const metadata = { provider: 'nvidia' as const, model: 'test', fallbackUsed: false, generatedAt: new Date().toISOString() };
    const paraphrased = generatedApplicationMessageSchema.parse({
      subject: 'Spontaneous application — Full-Stack Developer',
      body: 'Hello Acme Hiring team, your recruitment workflow platform supports recruiting teams. This connects with my Recruitment Workflow project, where I reduced manual outreach preparation by 30%. I would like to apply that experience to related workflow challenges without assuming an open vacancy. This is a spontaneous application. Would you be open to a short conversation about whether this background could help your team? Best regards',
      companyFactUsed: 'Recruiting teams use Acme Hiring workflow software.',
      companyFactSourceUrl: 'https://acme.example/about',
      candidateEvidenceUsed: 'Manual outreach preparation was reduced by 30%.',
      selectedProject: 'Recruitment Workflow',
      matchingAngle: 'Recruitment workflow alignment',
      providerMetadata: metadata,
      promptVersion: 'test-v1',
      automaticRewriteUsed: false
    });
    const evaluation = evaluateMessageQuality({ message: paraphrased, candidate, company: research, hasJobOffer: false });
    expect(evaluation.usesVerifiedCompanyFact).toBe(true);
    expect(evaluation.usesCandidateEvidence).toBe(true);
    expect(evaluation.hasInventedFacts).toBe(false);
  });

  it('does not invent a vacancy and records spontaneous-application risk', () => {
    const match = createCandidateCompanyMatch({ candidate, company: research, targetRole: 'Full-Stack Developer' });
    expect(match.missingInformation).toContain('No job offer was supplied; this must remain a spontaneous application.');
    expect(match.companyNeedOrOpportunity.toLowerCase()).not.toContain('vacancy');
  });

  it('scores a generic message below a company-specific evidence-based message', () => {
    const metadata = { provider: 'mock' as const, model: 'deterministic-local', fallbackUsed: false, generatedAt: new Date().toISOString() };
    const generic = generatedApplicationMessageSchema.parse({
      subject: 'Application',
      body: 'Hello, I am passionate about technology and your prestigious company. I have many skills and I am certain I would be an asset. Please contact me so we can discuss opportunities. This message is a spontaneous application and I hope to hear from you soon.',
      companyFactUsed: 'Unknown company fact',
      candidateEvidenceUsed: 'Unknown candidate fact',
      matchingAngle: 'Generic',
      providerMetadata: metadata,
      promptVersion: 'test-v1',
      automaticRewriteUsed: false
    });
    const specific = generatedApplicationMessageSchema.parse({
      subject: 'Spontaneous application — Full-Stack Developer',
      body: 'Hello, Acme Hiring provides recruitment workflow software for recruiting teams. That connects with my Recruitment Workflow project, where I reduced manual outreach preparation by 30%. I could contribute this evidence-based experience to related workflow work without assuming an open role. This is a spontaneous application. Would you be open to a short conversation about whether that background is useful to the team? Best regards',
      companyFactUsed: 'Acme Hiring provides recruitment workflow software for recruiting teams.',
      companyFactSourceUrl: 'https://acme.example/about',
      candidateEvidenceUsed: 'Reduced manual outreach preparation by 30%.',
      selectedProject: 'Recruitment Workflow',
      matchingAngle: 'Recruitment workflow alignment',
      providerMetadata: metadata,
      promptVersion: 'test-v1',
      automaticRewriteUsed: false
    });
    const genericScore = evaluateMessageQuality({ message: generic, candidate, company: research, hasJobOffer: false });
    const specificScore = evaluateMessageQuality({ message: specific, candidate, company: research, hasJobOffer: false });
    expect(genericScore.overallScore).toBeLessThan(specificScore.overallScore);
    expect(genericScore.hasInventedFacts).toBe(true);
    expect(needsAutomaticRewrite(genericScore)).toBe(true);
  });

  it('generates and evaluates a verified mock message with explicit provider metadata', async () => {
    const match = createCandidateCompanyMatch({ candidate, company: research, targetRole: 'Full-Stack Developer' });
    const result = await runMessagePipeline({
      candidate,
      company: research,
      match,
      request: {
        companyId: 'company-1',
        matchId: 'match-1',
        language: 'English',
        tone: 'professional',
        messageType: 'spontaneous_application',
        targetRole: 'Full-Stack Developer',
        limitedContext: false,
        forceImprove: false
      }
    }, { requestedProvider: 'mock' });
    expect(result.message.providerMetadata).toMatchObject({ provider: 'mock', fallbackUsed: false });
    expect(result.message.companyFactUsed).toBe(research.personalizationHooks[0].fact);
    expect(result.message.candidateEvidenceUsed).toContain('30%');
    expect(result.evaluation.usesVerifiedCompanyFact).toBe(true);
    expect(result.evaluation.usesCandidateEvidence).toBe(true);
  });
});
