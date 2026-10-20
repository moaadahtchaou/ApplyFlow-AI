'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type {
  CandidateCompanyMatch,
  CompanyResearch,
  GeneratedApplicationMessage,
  MessageQualityEvaluation
} from '@/lib/ai/contracts';
import { messageLanguages, tones } from '@/lib/constants';

type CompanyOption = {
  id: string;
  name: string;
  email: string | null;
  website: string | null;
  researchStatus: string;
  researchAnalyzedAt: string | null;
  researchConfidence: number | null;
};
type ContactOption = {
  id: string;
  fullName: string;
  title: string | null;
  email: string;
  companyId: string | null;
};
type SettingsDraft = {
  defaultSignature: string;
  defaultTone: string;
  defaultLanguage: string;
  targetRole: string;
  candidateStatus: string;
  candidateAnalyzedAt: string | null;
};
type ApiError = {
  code?: string;
  message?: string;
  retryable?: boolean;
  requestId?: string;
};
type ResearchResponse = {
  research?: CompanyResearch | null;
  providerMetadata?: { provider: 'nvidia' | 'mock'; model?: string; fallbackUsed: boolean; generatedAt: string };
  status?: string;
  error?: string | ApiError;
};
type MatchResponse = {
  match?: CandidateCompanyMatch;
  matchId?: string;
  status?: string;
  error?: string | ApiError;
};
type GenerationResponse = {
  message?: GeneratedApplicationMessage;
  evaluation?: MessageQualityEvaluation;
  firstEvaluation?: MessageQualityEvaluation;
  matchId?: string;
  error?: string | ApiError;
};
type GeneratedState = {
  message: GeneratedApplicationMessage;
  evaluation: MessageQualityEvaluation;
  firstEvaluation: MessageQualityEvaluation;
  matchId: string;
};

function errorMessage(error: string | ApiError | undefined, fallback: string) {
  if (typeof error === 'string') return error;
  const message = error?.message ?? fallback;
  return error?.code ? `${message} (${error.code})` : message;
}

function Status({ status }: { status: string }) {
  const label = status === 'ready' ? 'Ready' : status === 'limited' ? 'Limited' :
    status === 'processing' || status === 'analyzing' ? 'Processing' :
    status === 'outdated' ? 'Outdated' : status === 'failed' ? 'Failed' :
      status === 'insufficient_evidence' ? 'Needs evidence' : 'Not started';
  const color = status === 'ready' ? 'text-success' : status === 'failed' ? 'text-danger' :
    status === 'outdated' || status === 'limited' ? 'text-warning' : 'text-on-surface-muted';
  return <span className={`text-xs font-semibold ${color}`}>{label}</span>;
}

function PipelineRow({ number, label, status }: { number: number; label: string; status: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-2 last:border-0">
      <span className="text-sm text-on-surface-variant">{number}. {label}</span>
      <Status status={status} />
    </div>
  );
}

export function AiGeneratorClient({
  companies,
  contacts,
  settings,
  initialCompanyId,
  initialContactId
}: {
  companies: CompanyOption[];
  contacts: ContactOption[];
  settings: SettingsDraft;
  initialCompanyId?: string;
  initialContactId?: string;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(initialCompanyId ?? companies[0]?.id ?? '');
  const [contactId, setContactId] = useState(initialContactId ?? '');
  const [targetRole, setTargetRole] = useState(settings.targetRole);
  const [tone, setTone] = useState(settings.defaultTone || 'professional');
  const [language, setLanguage] = useState(settings.defaultLanguage || 'English');
  const [signature, setSignature] = useState(settings.defaultSignature);
  const [jobOfferText, setJobOfferText] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [research, setResearch] = useState<CompanyResearch | null>(null);
  const [researchStatus, setResearchStatus] = useState('not_analyzed');
  const [match, setMatch] = useState<CandidateCompanyMatch | null>(null);
  const [matchId, setMatchId] = useState('');
  const [matchStatus, setMatchStatus] = useState('not_started');
  const [generated, setGenerated] = useState<GeneratedState | null>(null);
  const [busy, setBusy] = useState<'research' | 'match' | 'generate' | 'improve' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<'subject' | 'message' | null>(null);

  const selectedCompany = companies.find((company) => company.id === companyId);
  const filteredContacts = useMemo(
    () => companyId ? contacts.filter((contact) => contact.companyId === companyId) : [],
    [companyId, contacts]
  );
  const pipelineReady = settings.candidateStatus === 'ready' && researchStatus === 'ready' &&
    ['ready', 'limited'].includes(matchStatus) && Boolean(match && matchId);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    fetch(`/api/companies/${companyId}/research`)
      .then((response) => response.json())
      .then((payload: ResearchResponse) => {
        if (!active) return;
        setResearch(payload.research ?? null);
        setResearchStatus(payload.status ?? 'not_analyzed');
      })
      .catch(() => {
        if (active) setResearchStatus('failed');
      });
    return () => { active = false; };
  }, [companyId]);

  function invalidateMatch() {
    setMatch(null);
    setMatchId('');
    setMatchStatus('not_started');
    setGenerated(null);
    setSaved(false);
  }

  async function analyzeCompany() {
    if (!companyId) return;
    setBusy('research');
    setResearchStatus('analyzing');
    setError('');
    invalidateMatch();
    try {
      const response = await fetch(`/api/companies/${companyId}/research`, { method: 'POST' });
      const payload = (await response.json()) as ResearchResponse;
      if (!response.ok || !payload.research) {
        throw new Error(errorMessage(payload.error, 'Could not analyze this company.'));
      }
      setResearch(payload.research);
      setResearchStatus(payload.status ?? 'insufficient_evidence');
    } catch (err) {
      setResearchStatus(research ? 'ready' : 'failed');
      setError(err instanceof Error ? err.message : 'Could not analyze this company.');
    } finally {
      setBusy(null);
    }
  }

  async function calculateMatch() {
    setBusy('match');
    setMatchStatus('processing');
    setError('');
    setGenerated(null);
    setSaved(false);
    try {
      const response = await fetch('/api/ai/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, contactId: contactId || undefined, targetRole, jobOfferText: jobOfferText || undefined, additionalInstructions: additionalInstructions || undefined })
      });
      const payload = (await response.json()) as MatchResponse;
      if (!response.ok || !payload.match || !payload.matchId) {
        throw new Error(errorMessage(payload.error, 'Could not calculate the match.'));
      }
      setMatch(payload.match);
      setMatchId(payload.matchId);
      setMatchStatus(payload.status ?? 'failed');
    } catch (err) {
      setMatchStatus('failed');
      setError(err instanceof Error ? err.message : 'Could not calculate the match.');
    } finally {
      setBusy(null);
    }
  }

  async function generate(forceImprove = false) {
    if (!matchId) return;
    setBusy(forceImprove ? 'improve' : 'generate');
    setError('');
    setSaved(false);
    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          contactId: contactId || undefined,
          matchId,
          language,
          tone,
          messageType: jobOfferText ? 'job_application' : 'spontaneous_application',
          targetRole,
          jobOfferText: jobOfferText || undefined,
          additionalInstructions: additionalInstructions || undefined,
          signature: signature || undefined,
          limitedContext: matchStatus === 'limited',
          forceImprove,
          existingMessage: forceImprove && generated ? {
            subject: generated.message.subject,
            body: generated.message.body
          } : undefined
        })
      });
      const payload = (await response.json()) as GenerationResponse;
      if (!response.ok || !payload.message || !payload.evaluation || !payload.firstEvaluation || !payload.matchId) {
        throw new Error(errorMessage(payload.error, 'Could not generate a verified message.'));
      }
      setGenerated({
        message: payload.message,
        evaluation: payload.evaluation,
        firstEvaluation: payload.firstEvaluation,
        matchId: payload.matchId
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a verified message.');
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!generated) return;
    setBusy('save');
    setError('');
    try {
      const response = await fetch('/api/ai/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          contactId: contactId || undefined,
          matchId: generated.matchId,
          purpose: targetRole,
          tone,
          language,
          signature: signature || undefined,
          messageType: jobOfferText ? 'job_application' : 'spontaneous_application',
          ...generated.message,
          evaluation: generated.evaluation
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Could not save this message.');
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this message.');
    } finally {
      setBusy(null);
    }
  }

  async function copy(kind: 'subject' | 'message') {
    if (!generated) return;
    await navigator.clipboard.writeText(kind === 'subject' ? generated.message.subject : generated.message.body);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <aside className="card h-fit p-4">
          <p className="mb-2 text-sm font-semibold text-on-surface">Generation pipeline</p>
          <PipelineRow number={1} label="CV extraction" status={settings.candidateStatus} />
          <PipelineRow number={2} label="Candidate profile" status={settings.candidateStatus} />
          <PipelineRow number={3} label="Company analysis" status={researchStatus} />
          <PipelineRow number={4} label="Candidate-company match" status={matchStatus} />
          <PipelineRow number={5} label="Message generation" status={generated ? 'ready' : 'not_analyzed'} />
          <PipelineRow number={6} label="Quality evaluation" status={generated ? 'ready' : 'not_analyzed'} />
          {settings.candidateStatus !== 'ready' ? (
            <Link className="mt-4 block text-sm font-semibold text-primary hover:underline" href="/profile">Review candidate profile →</Link>
          ) : null}
        </aside>

        <div className="card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="label">Company</span>
              <select
                className="input"
                value={companyId}
                onChange={(event) => {
                  setCompanyId(event.target.value);
                  setContactId('');
                  setResearch(null);
                  setResearchStatus('not_analyzed');
                  invalidateMatch();
                }}
              >
                <option value="">Choose a company</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="label">Contact (optional)</span>
              <select className="input" value={contactId} onChange={(event) => { setContactId(event.target.value); invalidateMatch(); }}>
                <option value="">Neutral greeting</option>
                {filteredContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName} — {contact.title || contact.email}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="label">Target role</span>
              <input className="input" value={targetRole} onChange={(event) => { setTargetRole(event.target.value); invalidateMatch(); }} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-2">
                <span className="label">Language</span>
                <select className="input" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {messageLanguages.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="label">Tone</span>
                <select className="input" value={tone} onChange={(event) => setTone(event.target.value)}>
                  {tones.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="mt-4 grid gap-4">
            <label className="space-y-2">
              <span className="label">Job offer text (optional)</span>
              <textarea
                className="input min-h-24"
                value={jobOfferText}
                onChange={(event) => { setJobOfferText(event.target.value); invalidateMatch(); }}
                placeholder="Leave empty for a spontaneous application."
              />
            </label>
            <label className="space-y-2">
              <span className="label">Additional instructions (optional)</span>
              <textarea className="input min-h-20" value={additionalInstructions} onChange={(event) => { setAdditionalInstructions(event.target.value); invalidateMatch(); }} />
            </label>
            <label className="space-y-2">
              <span className="label">Signature</span>
              <textarea className="input min-h-20" value={signature} onChange={(event) => setSignature(event.target.value)} />
            </label>
          </div>
        </div>
      </div>

      <div className="card p-5">
        {matchStatus === 'limited' ? (
          <p className="mb-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
            Limited match: available evidence supports only moderate personalization.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-on-surface">Company research</p>
            <p className="mt-1 text-sm text-on-surface-muted">
              {selectedCompany?.website || 'No website saved for this company.'}
            </p>
          </div>
          <button className="btn-secondary" type="button" onClick={analyzeCompany} disabled={!companyId || !selectedCompany?.website || busy !== null}>
            {busy === 'research' ? 'Analyzing company…' : research ? 'Re-analyze company' : 'Analyze company'}
          </button>
        </div>
        {research ? (
          <details className="mt-4 border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-on-surface">
              Research preview · {research.confidenceScore}/10 confidence · {research.sources.length} sources
            </summary>
            <div className="mt-4 grid gap-4 text-sm">
              <p className="leading-6 text-on-surface-variant">{research.summary}</p>
              <div>
                <p className="mb-2 font-semibold text-on-surface">Verified personalization hooks</p>
                <div className="space-y-2">
                  {research.personalizationHooks.map((hook) => (
                    <div key={`${hook.sourceUrl}-${hook.fact}`} className="rounded-lg border border-border px-3 py-2">
                      <p className="text-on-surface-variant">{hook.fact}</p>
                      {hook.sourceExcerpt ? (
                        <p className="mt-2 border-l-2 border-border pl-3 text-xs leading-5 text-on-surface-muted">
                          Source excerpt: {hook.sourceExcerpt}
                        </p>
                      ) : null}
                      <a className="mt-1 block break-all text-xs font-semibold text-primary hover:underline" href={hook.sourceUrl} target="_blank" rel="noreferrer">{hook.sourceUrl}</a>
                    </div>
                  ))}
                  {!research.personalizationHooks.length ? (
                    <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-on-surface-variant">
                      No website fact has enough source evidence for personalization. Research is not ready for matching.
                    </p>
                  ) : null}
                </div>
              </div>
              {research.fetchWarnings.length || research.failedPages.length ? (
                <div>
                  <p className="mb-2 font-semibold text-warning">Fetch notes</p>
                  {[...research.fetchWarnings, ...research.failedPages.map((page) => `${page.url}: ${page.reason}`)].map((warning) =>
                    <p key={warning} className="py-1 text-on-surface-variant">{warning}</p>
                  )}
                </div>
              ) : null}
              <div>
                <p className="mb-2 font-semibold text-on-surface">Sources</p>
                {research.sources.map((source) => (
                  <a key={source.url} className="block break-all py-1 text-primary hover:underline" href={source.url} target="_blank" rel="noreferrer">
                    {source.title || source.url}
                  </a>
                ))}
              </div>
            </div>
          </details>
        ) : <p className="mt-4 text-sm text-on-surface-muted">No website research is available yet.</p>}
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-on-surface">Candidate-company match</p>
            <p className="mt-1 text-sm text-on-surface-muted">Recalculate after changing the target, contact, job offer, CV, or company research.</p>
          </div>
          <button
            className="btn-secondary"
            type="button"
            onClick={calculateMatch}
            disabled={settings.candidateStatus !== 'ready' || researchStatus !== 'ready' || !targetRole.trim() || busy !== null}
          >
            {busy === 'match' ? 'Calculating match…' : match ? 'Recalculate match' : 'Calculate match'}
          </button>
        </div>
        {match ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-on-surface-muted">Target role · match {match.matchScore}/10</p>
              <p className="mt-1 font-semibold text-on-surface">{match.recommendedTargetRole}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-on-surface-muted">Selected project or experience</p>
              <p className="mt-1 font-semibold text-on-surface">
                {match.selectedCandidateItem || match.relevantProject || match.strongestCandidateEvidence}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3 md:col-span-2">
              <p className="text-xs text-on-surface-muted">Matching angle</p>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">{match.strongestAngle}</p>
            </div>
            {match.matchPoints[0] ? (
              <div className="rounded-lg border border-border p-3 md:col-span-2">
                <p className="text-xs text-on-surface-muted">Company fact selected</p>
                <p className="mt-1 text-sm text-on-surface-variant">{match.matchPoints[0].companyContext}</p>
                {match.matchPoints[0].sourceUrl ? (
                  <a className="mt-1 block break-all text-xs font-semibold text-primary hover:underline" href={match.matchPoints[0].sourceUrl} target="_blank" rel="noreferrer">
                    {match.matchPoints[0].sourceUrl}
                  </a>
                ) : null}
              </div>
            ) : null}
            {match.missingInformation.length ? (
              <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-on-surface-variant md:col-span-2">
                {match.missingInformation.join(' ')}
              </div>
            ) : null}
            {match.itemRanking.length ? (
              <details className="rounded-lg border border-border p-3 md:col-span-2">
                <summary className="cursor-pointer text-sm font-semibold text-on-surface">How projects and experience were ranked</summary>
                <ol className="mt-3 divide-y divide-border-subtle">
                  {match.itemRanking.map((item, index) => (
                    <li key={`${item.itemType}-${item.itemName ?? item.projectName}-${index}`} className="py-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="font-semibold text-on-surface">
                          {item.itemName ?? item.projectName} <span className="font-normal text-on-surface-muted">· {item.itemType}</span>
                        </span>
                        <span className="text-on-surface-muted">{item.score}/10</span>
                      </div>
                      <p className="mt-1 leading-5 text-on-surface-variant">{item.explanation}</p>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </div>
        ) : <p className="mt-4 text-sm text-on-surface-muted">No current match. Complete the prior pipeline steps first.</p>}
      </div>

      {error ? <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{error}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
        <div className="card min-h-80 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold text-on-surface">Generated message</p>
            {generated ? (
              <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-on-surface-variant">
                {generated.message.providerMetadata.provider === 'mock' ? 'Mock mode' : 'NVIDIA active'} · {generated.message.providerMetadata.model}
              </span>
            ) : null}
          </div>
          {generated ? (
            <div className="mt-4 space-y-4">
              <label className="space-y-2">
                <span className="label">Subject</span>
                <input
                  className="input"
                  value={generated.message.subject}
                  onChange={(event) => {
                    setGenerated({ ...generated, message: { ...generated.message, subject: event.target.value } });
                    setSaved(false);
                  }}
                />
              </label>
              <label className="space-y-2">
                <span className="label">Message</span>
                <textarea
                  className="input min-h-80 whitespace-pre-wrap"
                  value={generated.message.body}
                  onChange={(event) => {
                    setGenerated({ ...generated, message: { ...generated.message, body: event.target.value } });
                    setSaved(false);
                  }}
                />
              </label>
              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-semibold text-on-surface">Evidence used</summary>
                <dl className="mt-3 grid gap-3 text-sm">
                  <div><dt className="text-xs text-on-surface-muted">Company fact</dt><dd className="mt-1 text-on-surface-variant">{generated.message.companyFactUsed}</dd></div>
                  <div><dt className="text-xs text-on-surface-muted">Candidate evidence</dt><dd className="mt-1 text-on-surface-variant">{generated.message.candidateEvidenceUsed}</dd></div>
                  <div><dt className="text-xs text-on-surface-muted">Matching angle</dt><dd className="mt-1 text-on-surface-variant">{generated.message.matchingAngle}</dd></div>
                </dl>
              </details>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" type="button" onClick={() => copy('subject')}>{copied === 'subject' ? 'Subject copied' : 'Copy subject'}</button>
                <button className="btn-primary" type="button" onClick={() => copy('message')}>{copied === 'message' ? 'Message copied' : 'Copy message'}</button>
                <button className="btn-secondary" type="button" onClick={() => generate(true)} disabled={busy !== null}>{busy === 'improve' ? 'Improving…' : 'Improve message'}</button>
                <button className="btn-secondary" type="button" onClick={save} disabled={busy !== null || saved}>{busy === 'save' ? 'Saving…' : saved ? 'Saved' : 'Save message'}</button>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm leading-6 text-on-surface-muted">
              The message becomes available after the CV, company research, and current match are ready.
            </p>
          )}
        </div>

        <div className="card h-fit w-full p-5 lg:w-72">
          <p className="font-semibold text-on-surface">Quality evaluation</p>
          {generated ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs text-on-surface-muted">Overall score</p>
                <p className="mt-1 text-2xl font-semibold text-on-surface">{generated.evaluation.overallScore}/10</p>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-on-surface-muted">Personalization</dt><dd>{generated.evaluation.personalizationScore}/10</dd></div>
                <div className="flex justify-between"><dt className="text-on-surface-muted">Evidence</dt><dd>{generated.evaluation.evidenceScore}/10</dd></div>
                <div className="flex justify-between"><dt className="text-on-surface-muted">Naturalness</dt><dd>{generated.evaluation.naturalnessScore}/10</dd></div>
                <div className="flex justify-between"><dt className="text-on-surface-muted">Clarity</dt><dd>{generated.evaluation.clarityScore}/10</dd></div>
              </dl>
              <p className="text-sm text-on-surface-variant">
                {generated.message.automaticRewriteUsed ? 'One automatic rewrite was used.' : 'No automatic rewrite was needed.'}
              </p>
              {generated.evaluation.problems.length ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-warning">Remaining notes</p>
                  {generated.evaluation.problems.map((problem) => <p key={problem} className="py-1 text-sm text-on-surface-variant">{problem}</p>)}
                </div>
              ) : <p className="text-sm text-success">No evaluation problems detected.</p>}
            </div>
          ) : <p className="mt-4 text-sm text-on-surface-muted">No message to evaluate.</p>}
        </div>
      </div>

      <button className="btn-primary w-full sm:w-auto" type="button" onClick={() => generate(false)} disabled={!pipelineReady || busy !== null}>
        {busy === 'generate' ? 'Generating and evaluating…' : 'Generate message'}
      </button>
    </div>
  );
}
