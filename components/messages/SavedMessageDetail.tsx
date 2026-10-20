'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type SavedMessageDetailProps = {
  message: {
    id: string;
    subject: string;
    body: string;
    companyName: string;
    companyWebsite: string | null;
    contact: Record<string, string | null> | null;
    targetRole: string;
    language: string;
    tone: string;
    signature: string | null;
    messageType: string;
    provider: string;
    providerModel: string | null;
    qualityScore: number | null;
    matchingAngle: string | null;
    evidence: Record<string, unknown> | null;
    automaticRewriteUsed: boolean;
    generatedAt: string | null;
    createdAt: string;
    profileVersion: number | null;
    researchVersion: string | null;
    matchVersion: string | null;
  };
};

export function SavedMessageDetail({ message }: SavedMessageDetailProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState('');

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setNotice(`${label} copied.`);
  }

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    const response = await fetch(`/api/ai/messages/${message.id}`, { method: 'DELETE' });
    if (response.ok) {
      router.replace('/ai-generator');
      router.refresh();
      return;
    }
    const payload = await response.json() as { error?: string };
    setNotice(payload.error ?? 'Could not delete this message.');
    setDeleting(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Link className="btn-secondary" href="/ai-generator">Back to history</Link>
        <button className="btn-secondary" type="button" onClick={() => copy(message.subject, 'Subject')}>Copy subject</button>
        <button className="btn-primary" type="button" onClick={() => copy(message.body, 'Message')}>Copy message</button>
        <button className="btn-danger" type="button" onClick={() => setConfirming(true)}>Delete</button>
      </div>
      {notice ? <p role="status" className="rounded-lg border border-border px-3 py-2 text-sm text-on-surface-variant">{notice}</p> : null}
      <section className="card p-5">
        <h2 className="text-base font-semibold text-on-surface">{message.subject}</h2>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-on-surface-muted">Company</dt><dd className="mt-1 text-on-surface">{message.companyName}</dd></div>
          <div><dt className="text-on-surface-muted">Website</dt><dd className="mt-1 break-all text-on-surface">{message.companyWebsite ?? '—'}</dd></div>
          <div><dt className="text-on-surface-muted">Target role</dt><dd className="mt-1 text-on-surface">{message.targetRole}</dd></div>
          <div><dt className="text-on-surface-muted">Language and tone</dt><dd className="mt-1 text-on-surface">{message.language} · {message.tone}</dd></div>
          <div><dt className="text-on-surface-muted">Type</dt><dd className="mt-1 text-on-surface">{message.messageType.replaceAll('_', ' ')}</dd></div>
          <div><dt className="text-on-surface-muted">Saved</dt><dd className="mt-1 text-on-surface">{new Date(message.createdAt).toLocaleString()}</dd></div>
          <div><dt className="text-on-surface-muted">Provider</dt><dd className="mt-1 text-on-surface">{message.provider}{message.providerModel ? ` · ${message.providerModel}` : ''}</dd></div>
          <div><dt className="text-on-surface-muted">Quality</dt><dd className="mt-1 text-on-surface">{message.qualityScore === null ? '—' : `${message.qualityScore}/10`}</dd></div>
          <div><dt className="text-on-surface-muted">Automatic rewrite</dt><dd className="mt-1 text-on-surface">{message.automaticRewriteUsed ? 'Yes' : 'No'}</dd></div>
          <div><dt className="text-on-surface-muted">Signature</dt><dd className="mt-1 whitespace-pre-wrap text-on-surface">{message.signature ?? '—'}</dd></div>
        </dl>
      </section>
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-on-surface">Message</h2>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-on-surface-variant">{message.body}</p>
      </section>
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-on-surface">Persisted evidence</h2>
        <p className="mt-3 text-sm leading-6 text-on-surface-variant">{message.matchingAngle ?? 'No matching angle was saved.'}</p>
        <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-soft p-3 text-xs text-on-surface-variant">
          {JSON.stringify(message.evidence ?? {}, null, 2)}
        </pre>
        {message.contact ? (
          <p className="mt-3 text-sm text-on-surface-variant">
            Contact: {[message.contact.fullName, message.contact.title, message.contact.email].filter(Boolean).join(' · ')}
          </p>
        ) : null}
      </section>
      <ConfirmDialog
        open={confirming}
        onClose={() => { if (!deleting) setConfirming(false); }}
        onConfirm={remove}
        title="Delete saved message?"
        message="This deletes only this message snapshot. Related profile, company, contact, and match data will remain."
        confirmLabel={deleting ? 'Deleting…' : 'Delete message'}
      />
    </div>
  );
}
