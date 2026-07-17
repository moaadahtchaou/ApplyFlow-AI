import { afterEach, describe, expect, it, vi } from 'vitest';

const sourceUrl = 'https://company.example/about';
const crawlMock = vi.hoisted(() => vi.fn(async () => ({
  pages: [{
    url: 'https://company.example/about',
    title: 'About Company Example',
    text:
      'Company Example provides workflow software and implementation services for recruiting teams. ' +
      'Its Atlas case study describes a workflow automation project for recruiting operations.'
  }],
  warnings: [],
  failedPages: []
})));

vi.mock('@/lib/company/website-research', () => ({
  crawlCompanyWebsite: crawlMock
}));

import { analyzeCompanyWebsite } from './company-analysis';
import {
  companyResearchSchema,
  normalizeCompanyResearchInput
} from './contracts';
import { buildCompanyResearchPrompt } from './prompts';

const config = {
  requestedProvider: 'nvidia',
  apiKey: 'nvapi-test-key-that-is-long-enough',
  model: 'test-model',
  baseUrl: 'http://nvidia.test/v1',
  timeoutMs: 2_000
};

function chat(content: unknown) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }]
  }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-request-id': 'company-request-1' }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('canonical CompanyResearch analysis', () => {
  it('normalizes the NVIDIA object variants that previously caused schema rejection', () => {
    const normalized = companyResearchSchema.parse({
      companyName: 'Company Example',
      website: 'https://company.example',
      summary: 'Company Example provides workflow software.',
      relevantProjects: [
        {
          name: 'Atlas',
          description: 'Workflow automation for recruiting operations.',
          sourceUrl
        },
        {
          title: 'Beacon',
          summary: 'Candidate review tooling.',
          sourceUrl
        }
      ],
      personalizationHooks: {
        fact: 'Company Example provides workflow software.',
        relevance: 'The candidate has documented workflow product experience.',
        sourceUrl
      },
      sources: {
        url: sourceUrl,
        title: 'About'
      },
      confidenceScore: '85%'
    });

    expect(normalized.relevantProjects).toEqual([
      'Atlas — Workflow automation for recruiting operations.',
      'Beacon — Candidate review tooling.'
    ]);
    expect(normalized.personalizationHooks).toEqual([{
      fact: 'Company Example provides workflow software.',
      relevance: 'The candidate has documented workflow product experience.',
      sourceUrl
    }]);
    expect(normalized.sources).toEqual([{ url: sourceUrl, title: 'About', extractedAt: undefined }]);
    expect(normalized.confidenceScore).toBe(8.5);
    expect(normalized.analyzedAt).toBeUndefined();
    expect(normalized.services).toEqual([]);
    expect(normalized.fetchWarnings).toEqual([]);
  });

  it('normalizes keyed personalization-hook objects into one array', () => {
    const normalized = normalizeCompanyResearchInput({
      personalizationHooks: {
        primary: { fact: 'Fact one', relevance: 'Relevant one', sourceUrl },
        secondary: { claim: 'Fact two', whyRelevant: 'Relevant two', url: sourceUrl }
      }
    }) as { personalizationHooks: unknown[] };
    expect(normalized.personalizationHooks).toHaveLength(2);
  });

  it('accepts the observed NVIDIA response in one request and keeps evidence safeguards', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chat({
      companyName: 'Company Example',
      website: 'https://company.example',
      summary: 'Company Example provides workflow software and implementation services for recruiting teams.',
      services: ['Implementation services for recruiting teams'],
      products: ['Workflow software'],
      solutions: [],
      customerTypes: ['Recruiting teams'],
      technologiesMentioned: [],
      locations: [],
      hiringSignals: [],
      relevantDepartments: ['Recruiting operations'],
      relevantProjects: [{
        name: 'Atlas',
        description: 'A workflow automation project for recruiting operations.',
        sourceUrl
      }],
      personalizationHooks: {
        fact: 'Company Example provides workflow software and implementation services for recruiting teams.',
        relevance: 'This can anchor a candidate-company workflow connection.',
        sourceUrl
      },
      sources: { url: sourceUrl, title: 'About Company Example' },
      missingInformation: [],
      confidenceScore: 8
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeCompanyWebsite({
      name: 'Company Example',
      website: 'https://company.example'
    }, config);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.research.relevantProjects).toEqual([
      'Atlas — A workflow automation project for recruiting operations.'
    ]);
    expect(result.research.personalizationHooks).toHaveLength(1);
    expect(result.research.personalizationHooks[0]?.sourceUrl).toBe(sourceUrl);
    expect(result.research.sources).toEqual([
      expect.objectContaining({ url: sourceUrl, title: 'About Company Example' })
    ]);
    expect(result.research.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.metadata).toMatchObject({
      provider: 'nvidia',
      model: 'test-model',
      fallbackUsed: false
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[1].content).toContain('Never return project objects');
    expect(body.messages[1].content).toContain('personalizationHooks must always be an array');
  });

  it('returns a company-specific schema message if normalization and one repair cannot recover', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chat({ relevantProjects: [{ unexpected: true }] }))
      .mockResolvedValueOnce(chat({ personalizationHooks: 'still invalid' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(analyzeCompanyWebsite({
      name: 'Company Example',
      website: 'https://company.example'
    }, config)).rejects.toMatchObject({
      code: 'SCHEMA_VALIDATION_FAILED',
      publicMessage: 'NVIDIA returned company research that did not match the expected structure.'
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('documents the same canonical shape in the company prompt', () => {
    const prompt = buildCompanyResearchPrompt(
      { name: 'Company Example', website: 'https://company.example' },
      [{ url: sourceUrl, title: 'About', text: 'Verified public company evidence.' }]
    );
    expect(prompt).toContain('"relevantProjects": ["concise project or case-study string"]');
    expect(prompt).toContain('"personalizationHooks": [');
    expect(prompt).toContain('Do not invent analyzedAt or source extractedAt timestamps');
  });
});
