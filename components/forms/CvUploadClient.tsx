'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type {
  AIExecutionMetadata,
  CandidateProfile,
  CVExtractionResult
} from '@/lib/ai/contracts';

type AiError = {
  code: string;
  message: string;
  retryable?: boolean;
  provider?: 'nvidia' | 'mock';
  model?: string;
  requestId?: string;
  debug?: {
    status?: number;
    correlationId?: string;
    responseContentType?: string;
    responseExcerpt?: string;
    networkCause?: string;
    zodIssues?: Array<{ path: string; message: string }>;
    optionalParametersRemoved?: string[];
    pendingWithoutPollingUrl?: boolean;
  };
};

type AnalyzeResponse = {
  success?: boolean;
  extraction?: CVExtractionResult;
  profile?: CandidateProfile;
  providerMetadata?: AIExecutionMetadata;
  promptVersion?: string;
  error?: AiError | string;
};

function normalizedError(value: AiError | string | undefined, fallback: string): AiError {
  if (typeof value === 'string') return { code: 'UNKNOWN_AI_ERROR', message: value };
  return value ?? { code: 'UNKNOWN_AI_ERROR', message: fallback };
}

function Lines({ items, empty = 'None detected.' }: { items: string[]; empty?: string }) {
  return items.length ? (
    <ul className="divide-y divide-border-subtle rounded-lg border border-border">
      {items.map((item) => <li key={item} className="px-3 py-2 text-sm text-on-surface-variant">{item}</li>)}
    </ul>
  ) : <p className="text-sm text-on-surface-muted">{empty}</p>;
}

function commaValues(value: string) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

export function CvUploadClient({
  initialExtraction,
  initialProfile,
  initialMetadata,
  initialPromptVersion,
  activeProvider,
  activeModel
}: {
  initialExtraction?: CVExtractionResult | null;
  initialProfile?: CandidateProfile | null;
  initialMetadata?: AIExecutionMetadata | null;
  initialPromptVersion?: string | null;
  activeProvider: 'nvidia' | 'mock';
  activeModel: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState('');
  const [extraction, setExtraction] = useState<CVExtractionResult | null>(initialExtraction ?? null);
  const [profile, setProfile] = useState<CandidateProfile | null>(initialProfile ?? null);
  const [metadata, setMetadata] = useState<AIExecutionMetadata | null>(initialMetadata ?? null);
  const [promptVersion, setPromptVersion] = useState(initialPromptVersion ?? '');
  const [busy, setBusy] = useState<'extract' | 'analyze' | 'save' | null>(null);
  const [operationError, setOperationError] = useState('');
  const [analysisError, setAnalysisError] = useState<AiError | null>(null);
  const [success, setSuccess] = useState('');
  const [analysisOutdated, setAnalysisOutdated] = useState(false);
  const [textEdited, setTextEdited] = useState(false);

  function markAnalysisOutdated() {
    setAnalysisOutdated(Boolean(profile));
    setSuccess('');
    setAnalysisError(null);
  }

  async function extract() {
    if (busy) return;
    if (!file && manualText.trim().length < 20) {
      setOperationError('Choose a PDF, DOCX, or text file, or paste at least 20 characters.');
      return;
    }
    setBusy('extract');
    setOperationError('');
    setAnalysisError(null);
    setSuccess('');
    try {
      const formData = new FormData();
      if (file) formData.append('file', file);
      else formData.append('manualText', manualText);
      const response = await fetch('/api/settings/cv/analyze', { method: 'POST', body: formData });
      const payload = (await response.json()) as AnalyzeResponse;
      if (!response.ok || !payload.extraction) {
        throw new Error(normalizedError(payload.error, 'Could not extract CV text.').message);
      }
      setExtraction(payload.extraction);
      setTextEdited(false);
      setAnalysisOutdated(Boolean(profile));
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Could not extract CV text.');
    } finally {
      setBusy(null);
    }
  }

  async function analyze() {
    if (!extraction || busy) return;
    setBusy('analyze');
    setOperationError('');
    setAnalysisError(null);
    setSuccess('');
    try {
      const response = await fetch('/api/settings/cv/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extraction.text, extraction })
      });
      const payload = (await response.json()) as AnalyzeResponse;
      if (!response.ok || !payload.profile || !payload.providerMetadata || !payload.extraction) {
        setAnalysisError(normalizedError(payload.error, 'Could not structure this CV.'));
        return;
      }
      setExtraction(payload.extraction);
      setProfile(payload.profile);
      setMetadata(payload.providerMetadata);
      setPromptVersion(payload.promptVersion ?? '');
      setAnalysisOutdated(false);
      setTextEdited(false);
      setSuccess(
        payload.providerMetadata.provider === 'mock'
          ? 'CV analysis completed in Mock mode. Review the testing output before saving.'
          : 'CV analysis completed with NVIDIA. Review the structured profile before saving.'
      );
    } catch {
      setAnalysisError({
        code: 'PROVIDER_UNAVAILABLE',
        message: 'The analysis request could not reach the ApplyFlow server.',
        retryable: true,
        provider: activeProvider,
        model: activeModel
      });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!extraction || !profile || !metadata || !promptVersion || analysisOutdated || busy) return;
    setBusy('save');
    setOperationError('');
    setAnalysisError(null);
    try {
      const response = await fetch('/api/settings/cv/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraction, profile, providerMetadata: metadata, promptVersion })
      });
      const payload = (await response.json()) as AnalyzeResponse;
      if (!response.ok) {
        const failure = normalizedError(payload.error, 'The candidate profile could not be saved.');
        setAnalysisError(failure);
        return;
      }
      setSuccess('Structured candidate profile saved. Existing company matches are now marked outdated.');
      router.refresh();
    } catch {
      setAnalysisError({
        code: 'DATABASE_SAVE_FAILED',
        message: 'The candidate profile could not be saved.',
        retryable: true
      });
    } finally {
      setBusy(null);
    }
  }

  const status = busy === 'analyze'
    ? 'Analysis in progress'
    : analysisError
      ? analysisError.code === 'INVALID_JSON'
        ? 'Invalid JSON'
        : analysisError.code === 'SCHEMA_VALIDATION_FAILED'
          ? 'Schema validation failure'
          : analysisError.code === 'DATABASE_SAVE_FAILED'
            ? 'Candidate profile save failure'
            : 'Provider connection failure'
      : analysisOutdated
        ? 'Analysis outdated'
        : metadata
          ? `Analysis successful with ${metadata.provider === 'mock' ? 'Mock' : 'NVIDIA'}`
          : extraction
            ? textEdited ? 'CV text edited — analysis not started' : 'CV text extracted — analysis not started'
            : 'CV not uploaded';

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-on-surface">{status}</span>
          <span className="text-xs text-on-surface-muted">
            {activeProvider === 'mock' ? 'Mock' : 'NVIDIA'} · {activeModel}
          </span>
        </div>
        {activeProvider === 'mock' ? (
          <p className="mt-2 text-xs leading-5 text-warning">
            Mock mode is active. This analysis is intended for testing and may be generic.
          </p>
        ) : null}
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-surface-soft/40 p-4">
        <label className="block space-y-2">
          <span className="label">CV file</span>
          <input
            className="input"
            type="file"
            accept=".pdf,.docx,.txt,.text,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setOperationError('');
            }}
          />
        </label>
        <div className="text-center text-xs text-on-surface-muted">or</div>
        <label className="block space-y-2">
          <span className="label">Paste CV text manually</span>
          <textarea
            className="input min-h-28"
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            placeholder="Use this when the PDF has no usable text layer."
          />
        </label>
        <p className="text-xs leading-5 text-on-surface-muted">
          PDF, DOCX, or text; maximum 5 MB. The original file is not stored.
        </p>
        <button className="btn-primary" type="button" onClick={extract} disabled={busy !== null}>
          {busy === 'extract' ? 'Extracting text…' : extraction ? 'Extract new text' : 'Extract text'}
        </button>
      </div>

      {operationError ? (
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{operationError}</p>
      ) : null}
      {analysisError ? (
        <div className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          <p className="font-semibold">{analysisError.message}</p>
          <p className="mt-1 text-xs">
            {analysisError.code}
            {analysisError.requestId ? ` · Request ${analysisError.requestId}` : ''}
          </p>
          {analysisError.retryable && extraction ? (
            <button className="btn-sm btn-secondary mt-3" type="button" onClick={analyze} disabled={busy !== null}>
              Retry analysis
            </button>
          ) : null}
          {analysisError.debug ? (
            <details className="mt-3 border-t border-danger/20 pt-3 text-xs text-on-surface-variant">
              <summary className="cursor-pointer font-semibold">Development debug details</summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt>Provider</dt><dd>{analysisError.provider ?? activeProvider}</dd>
                <dt>Model</dt><dd className="break-all">{analysisError.model ?? activeModel}</dd>
                <dt>HTTP status</dt><dd>{analysisError.debug.status ?? '—'}</dd>
                <dt>Error code</dt><dd>{analysisError.code}</dd>
                <dt>Request ID</dt><dd className="break-all">{analysisError.requestId ?? '—'}</dd>
                <dt>Retryable</dt><dd>{analysisError.retryable ? 'Yes' : 'No'}</dd>
                <dt>Content type</dt><dd>{analysisError.debug.responseContentType ?? '—'}</dd>
              </dl>
              {analysisError.debug.networkCause ? <p className="mt-2">{analysisError.debug.networkCause}</p> : null}
              {analysisError.debug.responseExcerpt ? (
                <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-2">
                  {analysisError.debug.responseExcerpt}
                </pre>
              ) : null}
              {analysisError.debug.zodIssues?.length ? (
                <ul className="mt-2 space-y-1">
                  {analysisError.debug.zodIssues.map((issue) => (
                    <li key={`${issue.path}:${issue.message}`}>{issue.path}: {issue.message}</li>
                  ))}
                </ul>
              ) : null}
            </details>
          ) : null}
        </div>
      ) : null}
      {success ? <p className="rounded-lg bg-success-soft px-4 py-3 text-sm font-semibold text-success">{success}</p> : null}

      {extraction ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-on-surface-muted">Extraction quality</p>
              <p className="mt-1 font-semibold text-on-surface">{extraction.qualityScore}/10</p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-on-surface-muted">Readable words</p>
              <p className="mt-1 font-semibold text-on-surface">{extraction.wordCount}</p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-on-surface-muted">Input</p>
              <p className="mt-1 truncate font-semibold text-on-surface">{extraction.fileName ?? extraction.fileKind}</p>
            </div>
          </div>

          {extraction.warnings.length ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-warning">Extraction warnings</p>
              <Lines items={extraction.warnings} />
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-semibold text-on-surface">Detected sections</p>
            <p className="text-sm text-on-surface-variant">
              {extraction.detectedSections.join(' · ') || 'No common sections detected.'}
            </p>
          </div>

          <label className="block space-y-2">
            <span className="label">Extracted text — review and edit before analysis</span>
            <textarea
              className="input min-h-80 font-mono text-xs leading-5"
              value={extraction.text}
              onChange={(event) => {
                setExtraction({ ...extraction, text: event.target.value });
                setTextEdited(true);
                markAnalysisOutdated();
              }}
            />
          </label>
          <button className="btn-primary" type="button" onClick={analyze} disabled={busy !== null}>
            {busy === 'analyze' ? 'Analyzing CV…' : metadata ? 'Re-analyze CV' : 'Analyze CV'}
          </button>
        </div>
      ) : null}

      {profile && metadata ? (
        <div className="space-y-5 border-t border-border pt-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-on-surface">Analysis:</span>
            <span className="rounded-md border border-border px-2 py-1 text-on-surface-variant">
              {metadata.provider === 'mock' ? 'Mock mode — testing output' : 'NVIDIA'}
            </span>
            <span className="text-on-surface-muted">{metadata.model}</span>
            {typeof metadata.latencyMs === 'number' ? (
              <span className="text-on-surface-muted">{metadata.latencyMs} ms</span>
            ) : null}
          </div>
          {analysisOutdated ? (
            <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
              This profile belongs to the previous CV text. Re-analyze before saving.
            </p>
          ) : null}

          <label className="block space-y-2">
            <span className="label">Professional summary</span>
            <textarea
              className="input min-h-28"
              value={profile.professionalSummary ?? ''}
              onChange={(event) => setProfile({ ...profile, professionalSummary: event.target.value || undefined })}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ['Full name', 'fullName'],
              ['Email', 'email'],
              ['Phone', 'phone'],
              ['Location', 'location']
            ] as const).map(([label, field]) => (
              <label key={field} className="block space-y-2">
                <span className="label">{label}</span>
                <input
                  className="input"
                  type={field === 'email' ? 'email' : 'text'}
                  value={profile[field] ?? ''}
                  onChange={(event) => setProfile({ ...profile, [field]: event.target.value || undefined })}
                />
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="label">Target roles</span>
              <textarea
                className="input min-h-24"
                value={profile.targetRoles.join('\n')}
                onChange={(event) => setProfile({ ...profile, targetRoles: commaValues(event.target.value) })}
              />
            </label>
            <label className="block space-y-2">
              <span className="label">Skills</span>
              <textarea
                className="input min-h-24"
                value={profile.skills.join(', ')}
                onChange={(event) => setProfile({ ...profile, skills: commaValues(event.target.value) })}
              />
            </label>
            <label className="block space-y-2">
              <span className="label">Strengths</span>
              <textarea
                className="input min-h-24"
                value={profile.strengths.join('\n')}
                onChange={(event) => setProfile({ ...profile, strengths: commaValues(event.target.value) })}
              />
            </label>
            <label className="block space-y-2">
              <span className="label">Best-fit evidence</span>
              <textarea
                className="input min-h-24"
                value={profile.bestFitBullets.join('\n')}
                onChange={(event) => setProfile({ ...profile, bestFitBullets: commaValues(event.target.value) })}
              />
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold text-on-surface">Projects ({profile.projects.length})</p>
              <Lines items={profile.projects.map((project) => `${project.name} — ${project.description}`)} />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-on-surface">Experience ({profile.experiences.length})</p>
              <Lines items={profile.experiences.map((experience) =>
                [experience.role, experience.company, experience.description].filter(Boolean).join(' — ')
              )} />
            </div>
          </div>

          {profile.missingInformation.length ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-warning">Missing or uncertain information</p>
              <Lines items={profile.missingInformation} />
            </div>
          ) : null}

          <button className="btn-primary" type="button" onClick={save} disabled={busy !== null || analysisOutdated}>
            {busy === 'save' ? 'Saving profile…' : 'Save structured profile'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
