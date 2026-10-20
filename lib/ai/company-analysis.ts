import {
  companyResearchSchema,
  type AIExecutionMetadata,
  type CompanyResearch
} from '@/lib/ai/contracts';
import { executeStructured, type ProviderConfig } from '@/lib/ai/provider';
import { buildCompanyResearchPrompt, JSON_ONLY_SYSTEM_PROMPT, PROMPT_VERSIONS } from '@/lib/ai/prompts';
import { crawlCompanyWebsite } from '@/lib/company/website-research';
import { bestEvidenceExcerpt, isEvidenceSupported } from '@/lib/ai/evidence';

function unique(values: string[], limit = 30) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const item = value.replace(/\s+/g, ' ').trim();
    if (!item || seen.has(item.toLowerCase())) return [];
    seen.add(item.toLowerCase());
    return [item];
  }).slice(0, limit);
}

function usefulSentences(text: string) {
  return text.split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 350);
}

function linesNearKeyword(text: string, matcher: RegExp) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  return unique(lines.filter((line) => matcher.test(line) && line.length >= 8 && line.length <= 240), 15);
}

function mockResearch(
  company: { name: string; website: string; industry?: string | null },
  crawl: Awaited<ReturnType<typeof crawlCompanyWebsite>>
): CompanyResearch {
  const analyzedAt = new Date().toISOString();
  const joined = crawl.pages.map((page) => page.text).join('\n');
  const sentences = usefulSentences(joined);
  const hookSentences = sentences.filter((sentence) =>
    /\b(offers?|provides?|builds?|develops?|specializes?|helps?|platform|service|product|solution|clients?|customers?)\b/i.test(sentence)
  ).slice(0, 5);
  const hooks = hookSentences.map((fact) => {
    const source = crawl.pages.find((page) => page.text.includes(fact)) ?? crawl.pages[0];
    return {
      fact,
      relevance: 'This public company detail can anchor a specific candidate-company connection.',
      sourceUrl: source.url,
      sourceExcerpt: fact
    };
  });
  const summary = (sentences[0] ?? crawl.pages[0]?.text.slice(0, 500) ?? `${company.name} public website content.`).slice(0, 3000);
  return companyResearchSchema.parse({
    companyName: company.name,
    website: crawl.pages[0]?.url ?? company.website,
    summary,
    industry: company.industry || undefined,
    services: linesNearKeyword(joined, /\bservices?\b/i),
    products: linesNearKeyword(joined, /\bproducts?|platform\b/i),
    solutions: linesNearKeyword(joined, /\bsolutions?\b/i),
    customerTypes: linesNearKeyword(joined, /\b(clients?|customers?|businesses?|enterprises?|startups?)\b/i),
    technologiesMentioned: [],
    locations: linesNearKeyword(joined, /\b(location|located|offices?|headquartered|based in)\b/i),
    hiringSignals: linesNearKeyword(joined, /\b(careers?|join our team|we are hiring|open positions?)\b/i),
    relevantDepartments: [],
    relevantProjects: linesNearKeyword(joined, /\b(projects?|case stud(?:y|ies))\b/i),
    personalizationHooks: hooks,
    sources: crawl.pages.map((page) => ({
      url: page.url,
      title: page.title,
      extractedAt: analyzedAt,
      excerpt: usefulSentences(page.text)[0]?.slice(0, 1000)
    })),
    missingInformation: unique([
      hooks.length ? '' : 'The fetched pages did not provide a clear personalization fact.',
      company.industry ? '' : 'Industry was not confirmed in saved company data.',
      'Current vacancies were not assumed unless explicitly stated in fetched text.'
    ].filter(Boolean)),
    confidenceScore: Math.min(10, Math.round((3 + crawl.pages.length * 0.8 + hooks.length * 0.7) * 10) / 10),
    analyzedAt,
    fetchWarnings: crawl.warnings,
    failedPages: crawl.failedPages
  });
}

function enforceSourceSupport(
  research: CompanyResearch,
  crawl: Awaited<ReturnType<typeof crawlCompanyWebsite>>
) {
  const allSourceText = crawl.pages.map((page) => page.text).join('\n');
  const removed: string[] = [];
  const supportedList = (items: string[]) => items.filter((item) => {
    const supported = isEvidenceSupported(item, allSourceText, 0.24);
    if (!supported) removed.push(item);
    return supported;
  });
  const hooks = research.personalizationHooks.flatMap((hook) => {
    const declaredPage = hook.sourceUrl
      ? crawl.pages.find((page) => page.url === hook.sourceUrl)
      : undefined;
    const supportingPage = declaredPage && bestEvidenceExcerpt(hook.fact, declaredPage.text)
      ? declaredPage
      : crawl.pages.find((page) => bestEvidenceExcerpt(hook.fact, page.text)?.score && isEvidenceSupported(hook.fact, page.text, 0.22));
    if (!supportingPage) {
      removed.push(hook.fact);
      return [];
    }
    const support = bestEvidenceExcerpt(hook.fact, supportingPage.text);
    return support ? [{
      ...hook,
      sourceUrl: supportingPage.url,
      sourceExcerpt: support.excerpt
    }] : [];
  });
  const fallbackHooks = hooks.length ? [] : crawl.pages.flatMap((page) =>
    usefulSentences(page.text)
      .filter((sentence) =>
        /\b(offers?|provides?|builds?|develops?|specializes?|helps?|platform|service|product|solution|clients?|customers?)\b/i.test(sentence)
      )
      .slice(0, 1)
      .map((fact) => ({
        fact,
        relevance: 'This verified website fact can anchor a specific candidate-company connection.',
        sourceUrl: page.url,
        sourceExcerpt: fact
      }))
  ).slice(0, 3);
  const verifiedHooks = hooks.length ? hooks : fallbackHooks;
  const analyzedAt = new Date().toISOString();
  const fallbackSummary = usefulSentences(allSourceText)[0] ?? crawl.pages[0]?.text.slice(0, 800) ?? '';
  return companyResearchSchema.parse({
    ...research,
    summary: isEvidenceSupported(research.summary, allSourceText, 0.2) ? research.summary : fallbackSummary,
    services: supportedList(research.services),
    products: supportedList(research.products),
    solutions: supportedList(research.solutions),
    customerTypes: supportedList(research.customerTypes),
    technologiesMentioned: supportedList(research.technologiesMentioned),
    locations: supportedList(research.locations),
    hiringSignals: supportedList(research.hiringSignals),
    relevantDepartments: supportedList(research.relevantDepartments),
    relevantProjects: supportedList(research.relevantProjects),
    personalizationHooks: verifiedHooks,
    analyzedAt,
    sources: crawl.pages.map((page) => ({
      url: page.url,
      title: page.title,
      extractedAt: analyzedAt,
      excerpt: usefulSentences(page.text)[0]?.slice(0, 1000)
    })),
    fetchWarnings: unique([
      ...crawl.warnings,
      ...(removed.length ? [`${removed.length} unsupported AI conclusion(s) were removed.`] : [])
    ]),
    failedPages: crawl.failedPages,
    missingInformation: unique([
      ...research.missingInformation,
      ...(verifiedHooks.length ? [] : ['No sufficiently supported personalization hook remained after source validation.'])
    ]),
    confidenceScore: verifiedHooks.length
      ? research.confidenceScore
      : Math.min(research.confidenceScore, 4)
  });
}

export async function analyzeCompanyWebsite(
  company: { name: string; website: string; industry?: string | null },
  config?: ProviderConfig
): Promise<{ research: CompanyResearch; metadata: AIExecutionMetadata; promptVersion: string }> {
  const crawl = await crawlCompanyWebsite(company.website);
  const mock = () => mockResearch(company, crawl);
  const execution = await executeStructured({
    schema: companyResearchSchema,
    systemPrompt: JSON_ONLY_SYSTEM_PROMPT,
    userPrompt: buildCompanyResearchPrompt(company, crawl.pages),
    promptVersion: PROMPT_VERSIONS.companyResearch,
    config,
    mock,
    temperature: 0.1,
    maxTokens: 3500,
    operationLabel: 'company analysis',
    validationErrorMessage: 'NVIDIA returned company research that did not match the expected structure.'
  });
  return {
    research: enforceSourceSupport(execution.data, crawl),
    metadata: execution.metadata,
    promptVersion: PROMPT_VERSIONS.companyResearch
  };
}

export { mockResearch };
