'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type CvDraft = {
  cvText: string;
  candidateProfile: string;
  skills: string;
  experienceSummary: string;
  targetRole: string;
  languages: string;
  preferredLocations: string;
  bestFitBullets: string[];
  targetRolesDetected: string[];
  missingProfileWarnings: string[];
};

type AnalyzeResponse = {
  fileName?: string;
  fileKind?: 'pdf' | 'text';
  draft?: CvDraft;
  provider?: 'nvidia' | 'mock';
  fallbackReason?: string;
  error?: string;
};

type ApplyResponse = {
  error?: string;
};

type DraftTextKey =
  | 'cvText'
  | 'candidateProfile'
  | 'skills'
  | 'experienceSummary'
  | 'targetRole'
  | 'languages'
  | 'preferredLocations';

function PillList({ items, tone = 'slate' }: { items: string[]; tone?: 'slate' | 'amber' | 'indigo' }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">Nothing detected yet.</p>;
  }

  const toneClass =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : tone === 'indigo'
        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
        : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className={`rounded-full border px-3 py-1 text-xs font-bold ${toneClass}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function CvUploadClient() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<CvDraft | null>(null);
  const [provider, setProvider] = useState<'nvidia' | 'mock' | null>(null);
  const [fileName, setFileName] = useState('');
  const [fallbackReason, setFallbackReason] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateDraft(key: DraftTextKey, value: string) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function analyze() {
    if (!file) {
      setError('Choose a PDF or text CV first.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setSuccess(null);
    setFallbackReason('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/settings/cv/analyze', {
        method: 'POST',
        body: formData
      });
      const payload = (await response.json()) as AnalyzeResponse;

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error ?? 'Could not analyze this CV.');
      }

      setDraft(payload.draft);
      setProvider(payload.provider ?? 'mock');
      setFileName(payload.fileName ?? file.name);
      setFallbackReason(payload.fallbackReason ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not analyze this CV.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function applyDraft() {
    if (!draft) return;

    setApplying(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/settings/cv/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft })
      });
      const payload = (await response.json()) as ApplyResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not save CV context.');
      }

      setSuccess('CV context saved. AI Generator will now use this candidate profile by default.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save CV context.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-dashed border-outline/90 bg-surface-soft/50 p-4">
        <label className="space-y-2">
          <span className="label">CV file</span>
          <input
            className="input"
            type="file"
            accept=".pdf,.txt,.text,.md,application/pdf,text/plain,text/markdown"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setDraft(null);
              setError(null);
              setSuccess(null);
              setProvider(null);
              setFileName('');
              setFallbackReason('');
            }}
          />
        </label>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          PDF/TXT only, max 5 MB. The original file is not stored; ApplyFlow saves only extracted text and reviewed context.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button className="btn-primary" type="button" onClick={analyze} disabled={!file || analyzing}>
            {analyzing ? 'Analyzing CV...' : 'Analyze CV'}
          </button>
          {provider ? (
            <span className="status-chip bg-indigo-50 text-indigo-700 ring-indigo-200">
              Provider: {provider}
            </span>
          ) : null}
          {fileName ? <span className="text-xs font-semibold text-slate-500">Analyzed: {fileName}</span> : null}
        </div>
      </div>

      {fallbackReason ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          NVIDIA fallback: {fallbackReason}
        </p>
      ) : null}
      {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
      {success ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</p> : null}

      {draft ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="label">Target role</span>
              <input className="input" value={draft.targetRole} onChange={(event) => updateDraft('targetRole', event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="label">Preferred locations</span>
              <input className="input" value={draft.preferredLocations} onChange={(event) => updateDraft('preferredLocations', event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="label">Skills</span>
              <input className="input" value={draft.skills} onChange={(event) => updateDraft('skills', event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="label">Languages</span>
              <input className="input" value={draft.languages} onChange={(event) => updateDraft('languages', event.target.value)} />
            </label>
          </div>

          <label className="space-y-2">
            <span className="label">Experience summary</span>
            <textarea className="input min-h-28" value={draft.experienceSummary} onChange={(event) => updateDraft('experienceSummary', event.target.value)} />
          </label>

          <label className="space-y-2">
            <span className="label">Candidate profile for AI Generator</span>
            <textarea className="input min-h-40" value={draft.candidateProfile} onChange={(event) => updateDraft('candidateProfile', event.target.value)} />
          </label>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-outline/70 bg-white p-4 shadow-card">
              <p className="mb-3 text-sm font-black text-on-surface">Best-fit bullets</p>
              <PillList items={draft.bestFitBullets} tone="indigo" />
            </div>
            <div className="rounded-xl border border-outline/70 bg-white p-4 shadow-card">
              <p className="mb-3 text-sm font-black text-on-surface">Target roles detected</p>
              <PillList items={draft.targetRolesDetected} />
            </div>
            <div className="rounded-xl border border-outline/70 bg-white p-4 shadow-card">
              <p className="mb-3 text-sm font-black text-on-surface">Missing profile warnings</p>
              <PillList items={draft.missingProfileWarnings} tone="amber" />
            </div>
          </div>

          <label className="space-y-2">
            <span className="label">Extracted CV text (editable before save)</span>
            <textarea className="input min-h-72 font-mono text-xs" value={draft.cvText} onChange={(event) => updateDraft('cvText', event.target.value)} />
          </label>

          <button className="btn-primary" type="button" onClick={applyDraft} disabled={applying}>
            {applying ? 'Saving context...' : 'Apply to Settings'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
