'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export function CopyMessageButton({
  text,
  label = 'Copy',
  size = 'sm'
}: {
  text: string;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className={cn(
        size === 'sm' ? 'btn-sm' : '',
        copied
          ? 'btn-sm inline-flex items-center gap-1.5 rounded-lg border border-success/30 bg-success-soft text-success px-3 py-1.5 text-xs font-semibold'
          : 'btn-secondary'
      )}
      type="button"
      onClick={copy}
    >
      {copied ? (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
