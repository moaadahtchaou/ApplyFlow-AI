'use client';

import Link from 'next/link';

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger-soft">
        <svg className="h-8 w-8 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div>
        <h1 className="text-xl font-bold text-on-surface">Something went wrong</h1>
        <p className="mt-2 text-sm text-on-surface-muted">
          {error.message ?? 'An unexpected error occurred.'}
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-on-surface-muted font-mono">Digest: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={reset} className="btn-primary">Try again</button>
        <Link href="/" className="btn-secondary">Go to Dashboard</Link>
      </div>
    </div>
  );
}
