'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export type SavedMessageSummary = {
  id: string;
  subject: string;
  companyName: string;
  targetRole: string;
  language: string;
  qualityScore: number | null;
  createdAt: string;
};

export function SavedMessageHistory({ initialMessages }: { initialMessages: SavedMessageSummary[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [pendingDelete, setPendingDelete] = useState<SavedMessageSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    if (!pendingDelete || deleting) return;
    const target = pendingDelete;
    setDeleting(true);
    setError('');
    try {
      const response = await fetch(`/api/ai/messages/${target.id}`, { method: 'DELETE' });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Could not delete this saved message.');
      setMessages((current) => current.filter((message) => message.id !== target.id));
      setPendingDelete(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not delete this saved message.');
    } finally {
      setDeleting(false);
    }
  }

  if (!messages.length) return null;

  return (
    <section className="mt-8" aria-labelledby="saved-messages-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="saved-messages-title" className="text-sm font-semibold text-on-surface">Saved Message History</h2>
        <span className="text-xs text-on-surface-muted">{messages.length} saved</span>
      </div>
      {error ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        {messages.map((message) => (
          <article key={message.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="truncate font-semibold text-on-surface">{message.subject}</p>
              <p className="mt-1 text-sm text-on-surface-variant">
                {message.companyName || 'Company unavailable'} · {message.targetRole} · {message.language}
              </p>
              <p className="mt-1 text-xs text-on-surface-muted">
                {new Date(message.createdAt).toLocaleString()}
                {message.qualityScore !== null ? ` · Quality ${message.qualityScore}/10` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Link className="btn-secondary" href={`/ai-generator/messages/${message.id}`}>View</Link>
              <button className="btn-danger" type="button" onClick={() => setPendingDelete(message)}>Delete</button>
            </div>
          </article>
        ))}
      </div>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => { if (!deleting) setPendingDelete(null); }}
        onConfirm={remove}
        title="Delete saved message?"
        message={`Delete “${pendingDelete?.subject ?? ''}”? The company, contact, match, and other messages will remain.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete message'}
      />
    </section>
  );
}
