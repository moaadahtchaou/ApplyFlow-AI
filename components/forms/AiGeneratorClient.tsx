'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { messageLanguages, tones } from '@/lib/constants';

type CompanyOption = { id: string; name: string; email: string | null };
type ContactOption = { id: string; fullName: string; email: string; companyId: string | null };
type SettingsDraft = {
  candidateProfile: string;
  defaultSignature: string;
  defaultTone: string;
  defaultLanguage: string;
  targetRole: string;
};
type GeneratedMessage = { subject: string; body: string; provider: 'nvidia' | 'mock' };
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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
  const [companyId, setCompanyId] = useState(initialCompanyId ?? companies[0]?.id ?? '');
  const [contactId, setContactId] = useState(initialContactId ?? '');
  const [purpose, setPurpose] = useState(settings.targetRole);
  const [candidateProfile, setCandidateProfile] = useState(settings.candidateProfile);
  const [tone, setTone] = useState(settings.defaultTone || 'professional');
  const [language, setLanguage] = useState(settings.defaultLanguage || 'English');
  const [signature, setSignature] = useState(settings.defaultSignature);
  const [generated, setGenerated] = useState<GeneratedMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [copied, setCopied] = useState(false);

  const filteredContacts = useMemo(
    () => companyId ? contacts.filter((contact) => contact.companyId === companyId) : contacts,
    [companyId, contacts]
  );

  async function generate() {
    setLoading(true);
    setError(null);
    setSaveStatus('idle');
    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, contactId, purpose, candidateProfile, tone, language, signature })
      });
      const payload = (await response.json()) as { email?: GeneratedMessage; error?: string };
      if (!response.ok || !payload.email) throw new Error(payload.error ?? 'Could not generate a message.');
      setGenerated(payload.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!generated) return;
    setSaveStatus('saving');
    setError(null);
    try {
      const response = await fetch('/api/ai/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, contactId, purpose, tone, language, ...generated })
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Could not save this message.');
      }
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      setError(err instanceof Error ? err.message : 'Could not save this message.');
    }
  }

  async function copyMessage() {
    if (!generated) return;
    await navigator.clipboard.writeText(`${generated.subject}\n\n${generated.body}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="card p-5 sm:p-6">
        <h2 className="text-2xl font-black tracking-[-0.03em] text-on-surface">Message context</h2>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">Choose who you want to contact and what the message should achieve.</p>
        <div className="mt-6 grid gap-4">
          <label className="space-y-2">
            <span className="label">Company</span>
            <select className="input" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setContactId(''); }}>
              <option value="">No company</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="label">Contact (optional)</span>
            <select className="input" value={contactId} onChange={(event) => setContactId(event.target.value)}>
              <option value="">No contact</option>
              {filteredContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName} — {contact.email}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="label">Target role or message purpose</span>
            <input className="input" value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Frontend Developer role or partnership introduction" />
          </label>
          <label className="space-y-2">
            <span className="label">Candidate profile</span>
            <textarea className="input min-h-36" value={candidateProfile} onChange={(event) => setCandidateProfile(event.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="label">Language</span>
              <select className="input" value={language} onChange={(event) => setLanguage(event.target.value)}>
                {messageLanguages.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="label">Tone</span>
              <select className="input" value={tone} onChange={(event) => setTone(event.target.value)}>
                {tones.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <label className="space-y-2">
            <span className="label">Signature</span>
            <textarea className="input min-h-24" value={signature} onChange={(event) => setSignature(event.target.value)} />
          </label>
          {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
          <button className="btn-primary" type="button" onClick={generate} disabled={loading}>
            {loading ? 'Generating...' : generated ? 'Regenerate message' : 'Generate message'}
          </button>
        </div>
      </div>

      <div className="card min-h-[42rem] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black tracking-[-0.03em] text-on-surface">Generated message</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Edit, copy, and send it manually using any platform.</p>
          </div>
          {generated ? <span className="status-chip bg-emerald-50 text-emerald-700 ring-emerald-200">{generated.provider}</span> : null}
        </div>
        {generated ? (
          <div className="mt-6 grid gap-4">
            <label className="space-y-2">
              <span className="label">Subject / title</span>
              <input className="input" value={generated.subject} onChange={(event) => { setGenerated({ ...generated, subject: event.target.value }); setSaveStatus('idle'); }} />
            </label>
            <label className="space-y-2">
              <span className="label">Message</span>
              <textarea className="input min-h-96 whitespace-pre-wrap" value={generated.body} onChange={(event) => { setGenerated({ ...generated, body: event.target.value }); setSaveStatus('idle'); }} />
            </label>
            {saveStatus === 'saved' ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">Saved to message history.</p> : null}
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" type="button" onClick={copyMessage}>{copied ? 'Copied!' : 'Copy message'}</button>
              <button className="btn-secondary" type="button" onClick={save} disabled={saveStatus === 'saving' || saveStatus === 'saved'}>
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save message'}
              </button>
              <button className="btn-secondary" type="button" onClick={generate} disabled={loading}>Regenerate</button>
              <Link className="btn-secondary" href="/templates">Templates</Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex min-h-[30rem] items-center justify-center rounded-xl border border-dashed border-outline/80 bg-surface-soft/45 p-8 text-center">
            <div>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-2xl text-primary">✦</div>
              <h3 className="mt-4 text-lg font-black text-on-surface">No message yet</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-on-surface-variant">Mock mode works locally without an API key.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
