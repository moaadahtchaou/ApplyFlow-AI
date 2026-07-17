import {
  generatedApplicationMessageContentSchema,
  generatedApplicationMessageSchema,
  type AIExecutionMetadata,
  type CandidateCompanyMatch,
  type CandidateProfile,
  type CompanyResearch,
  type GeneratedApplicationMessage,
  type MessageQualityEvaluation,
  type MessageRequest
} from '@/lib/ai/contracts';
import { executeStructured } from '@/lib/ai/provider';
import { buildMessagePrompt, buildRewritePrompt, JSON_ONLY_SYSTEM_PROMPT, PROMPT_VERSIONS } from '@/lib/ai/prompts';
import { evaluateMessageQuality, needsAutomaticRewrite } from '@/lib/ai/quality';
import { AIProviderError } from '@/lib/ai/storage';
import { isEvidenceSupported } from '@/lib/ai/evidence';

type Context = {
  candidate: CandidateProfile;
  company: CompanyResearch;
  match: CandidateCompanyMatch;
  contact?: { name?: string; title?: string };
  request: MessageRequest;
};

function compact(value: string, max = 350) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trim()}…` : cleaned;
}

function mockMessage(context: Context) {
  const { candidate, company, match, contact, request } = context;
  const hook = company.personalizationHooks.find((item) =>
    match.matchPoints.some((point) => point.sourceUrl === item.sourceUrl)
  ) ?? company.personalizationHooks[0];
  if (!hook) throw new AIProviderError('COMPANY_EVIDENCE_MISSING', 'Company research has no verified fact to use.', 422);
  const evidence = compact(match.strongestCandidateEvidence, 260);
  const technologies = match.technologyOverlap.slice(0, 3);
  const techSentence = technologies.length ? ` using ${technologies.join(', ')}` : '';
  const name = contact?.name?.trim();
  const isFrench = request.language === 'French';
  const isArabic = request.language === 'Arabic';
  const isDarija = request.language === 'Darija';
  const spontaneous = !request.jobOfferText;
  let subject: string;
  let body: string;

  if (isFrench) {
    subject = `Candidature spontanée — ${request.targetRole}`;
    body = `Bonjour${name ? ` ${name}` : ''},\n\n` +
      `Votre site présente ce point concret : ${compact(hook.fact)}. Cette activité fait écho à mon travail sur ${match.relevantProject ?? 'un projet concret'}, où ${evidence}${techSentence}.\n\n` +
      `Je pourrais ainsi contribuer comme ${request.targetRole} en reliant cette expérience à vos besoins réels, sans supposer l’existence d’un poste ouvert. ` +
      `${spontaneous ? 'Il s’agit d’une candidature spontanée.' : 'Ma démarche répond à l’offre transmise.'} ` +
      `Seriez-vous disponible pour un court échange afin d’évaluer la pertinence de ce profil ?\n\n${request.signature || candidate.fullName || 'Cordialement'}`;
  } else if (isArabic) {
    subject = `ترشيح تلقائي — ${request.targetRole}`;
    body = `مرحباً${name ? ` ${name}` : ''}،\n\n` +
      `يعرض موقع ${company.companyName} هذه المعلومة المحددة: ${compact(hook.fact)}. يرتبط ذلك بخبرتي العملية في ${match.relevantProject ?? 'مشروع موثق'}، حيث ${evidence}${techSentence}.\n\n` +
      `يمكنني المساهمة بصفتي ${request.targetRole} من خلال توظيف هذه الخبرة في سياق عملكم الفعلي، من دون افتراض وجود منصب شاغر. ` +
      `${spontaneous ? 'هذا ترشيح تلقائي.' : 'هذا الطلب مرتبط بنص العرض المقدم.'} هل يمكننا ترتيب محادثة قصيرة لمناقشة مدى ملاءمة هذا التعاون؟\n\n${request.signature || candidate.fullName || 'مع التحية'}`;
  } else if (isDarija) {
    subject = `Candidature spontanée — ${request.targetRole}`;
    body = `Salam${name ? ` ${name}` : ''},\n\n` +
      `Site dyal ${company.companyName} kaybayan had l-ma3louma: ${compact(hook.fact)}. Hada kaytla9a m3a l-khedma dyali f ${match.relevantProject ?? 'projet موثق'}, fin ${evidence}${techSentence}.\n\n` +
      `N9der nساهم كـ ${request.targetRole} b had التجربة f السياق الحقيقي dyal khdemtkom, bla ma نفترض belli kayn poste محلول. ` +
      `${spontaneous ? 'Hadi candidature spontanée.' : 'Had الطلب مرتبط بالعرض اللي تعطي.'} واش ممكن نديرو مكالمة قصيرة باش نشوفو واش profil مناسب؟\n\n${request.signature || candidate.fullName || 'Chokran'}`;
  } else {
    subject = `Spontaneous application — ${request.targetRole}`;
    body = `Hello${name ? ` ${name}` : ''},\n\n` +
      `${company.companyName}'s website highlights this specific point: ${compact(hook.fact)}. It connects directly with my work on ${match.relevantProject ?? 'a documented project'}, where ${evidence}${techSentence}.\n\n` +
      `I could contribute as a ${request.targetRole} by applying that experience to your actual work, without assuming that a role is currently open. ` +
      `${spontaneous ? 'This is a spontaneous application.' : 'I am responding to the supplied job description.'} ` +
      `Would you be open to a short conversation to see whether this background could be useful to your team?\n\n${request.signature || candidate.fullName || 'Best regards'}`;
  }
  return generatedApplicationMessageContentSchema.parse({
    subject,
    body,
    companyFactUsed: hook.fact,
    companyFactSourceUrl: hook.sourceUrl,
    candidateEvidenceUsed: evidence,
    selectedProject: match.relevantProject,
    matchingAngle: match.strongestAngle
  });
}

function assertEvidence(message: GeneratedApplicationMessage, context: Context) {
  const sourceSupported = context.company.personalizationHooks.some((hook) =>
    (!message.companyFactSourceUrl || hook.sourceUrl === message.companyFactSourceUrl) &&
    isEvidenceSupported(message.companyFactUsed, `${hook.fact} ${hook.sourceExcerpt ?? ''}`, 0.25)
  );
  const evidenceSupported = isEvidenceSupported(
    message.candidateEvidenceUsed,
    `${JSON.stringify(context.candidate)} ${context.match.strongestCandidateEvidence}`,
    0.25
  );
  if (!sourceSupported || !evidenceSupported) {
    throw new AIProviderError(
      'AI_UNSUPPORTED_OUTPUT',
      'The generated message contained evidence that could not be verified, so it was not accepted.',
      422
    );
  }
}

async function generateOnce(
  context: Context,
  prompt: string,
  promptVersion: string,
  config?: { requestedProvider?: string; apiKey?: string; model?: string }
) {
  const execution = await executeStructured({
    schema: generatedApplicationMessageContentSchema,
    systemPrompt:
      `${JSON_ONLY_SYSTEM_PROMPT} You write concise, human application messages and must cite the supplied company source URL.`,
    userPrompt: prompt,
    promptVersion,
    config,
    mock: () => mockMessage(context),
    temperature: 0.35,
    maxTokens: 1800,
    operationLabel: 'message generation',
    validationErrorMessage: 'The generated application message did not match the expected structure.'
  });
  const message = generatedApplicationMessageSchema.parse({
    ...execution.data,
    providerMetadata: execution.metadata,
    promptVersion,
    automaticRewriteUsed: false
  });
  const hook = context.company.personalizationHooks.find((item) =>
    item.sourceUrl === message.companyFactSourceUrl ||
    isEvidenceSupported(message.companyFactUsed, `${item.fact} ${item.sourceExcerpt ?? ''}`, 0.25)
  ) ?? context.company.personalizationHooks[0];
  return generatedApplicationMessageSchema.parse({
    ...message,
    companyFactUsed: hook?.fact ?? message.companyFactUsed,
    companyFactSourceUrl: hook?.sourceUrl ?? message.companyFactSourceUrl,
    candidateEvidenceUsed: context.match.strongestCandidateEvidence,
    selectedProject: context.match.relevantProject
  });
}

export async function runMessagePipeline(
  context: Context,
  config?: { requestedProvider?: string; apiKey?: string; model?: string }
): Promise<{
  message: GeneratedApplicationMessage;
  evaluation: MessageQualityEvaluation;
  firstEvaluation: MessageQualityEvaluation;
}> {
  const generationPrompt = buildMessagePrompt(context);
  const first = await generateOnce(context, generationPrompt, PROMPT_VERSIONS.messageGeneration, config);
  const firstEvaluation = evaluateMessageQuality({
    message: first,
    candidate: context.candidate,
    company: context.company,
    hasJobOffer: Boolean(context.request.jobOfferText)
  });
  if (!context.request.forceImprove && !needsAutomaticRewrite(firstEvaluation)) {
    assertEvidence(first, context);
    return { message: first, evaluation: firstEvaluation, firstEvaluation };
  }

  const rewritten = await generateOnce(
    context,
    buildRewritePrompt({
      original: { subject: first.subject, body: first.body },
      evaluation: firstEvaluation,
      generationPrompt
    }),
    PROMPT_VERSIONS.messageRewrite,
    config
  );
  const rewrittenWithFlag = { ...rewritten, automaticRewriteUsed: true };
  const secondEvaluation = evaluateMessageQuality({
    message: rewrittenWithFlag,
    candidate: context.candidate,
    company: context.company,
    hasJobOffer: Boolean(context.request.jobOfferText)
  });
  const selected = secondEvaluation.overallScore >= firstEvaluation.overallScore
    ? { message: rewrittenWithFlag, evaluation: secondEvaluation, firstEvaluation }
    : { message: { ...first, automaticRewriteUsed: true }, evaluation: firstEvaluation, firstEvaluation };
  try {
    assertEvidence(selected.message, context);
    return selected;
  } catch {
    const safe = generatedApplicationMessageSchema.parse({
      ...mockMessage(context),
      providerMetadata: selected.message.providerMetadata,
      promptVersion: PROMPT_VERSIONS.messageRewrite,
      automaticRewriteUsed: true
    });
    const evaluation = evaluateMessageQuality({
      message: safe,
      candidate: context.candidate,
      company: context.company,
      hasJobOffer: Boolean(context.request.jobOfferText)
    });
    assertEvidence(safe, context);
    return { message: safe, evaluation, firstEvaluation };
  }
}

export function executionMetadataForClient(metadata: AIExecutionMetadata) {
  return metadata;
}
