import Link from 'next/link';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  /** Build the URL for a given page number. Caller handles other search params. */
  getPageUrl: (page: number) => string;
  className?: string;
}

export function Pagination({ page, totalPages, getPageUrl, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const prev = page - 1;
  const next = page + 1;

  // Generate page numbers to show
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={cn('flex items-center justify-center gap-1', className)}
    >
      <Link
        href={prev >= 1 ? getPageUrl(prev) : '#'}
        aria-label="Previous page"
        aria-disabled={page <= 1}
        className={cn(
          'btn-icon h-8 w-8',
          page <= 1 && 'pointer-events-none opacity-40'
        )}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-sm text-on-surface-muted">
            ···
          </span>
        ) : (
          <Link
            key={p}
            href={getPageUrl(p as number)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition',
              p === page
                ? 'bg-primary text-white'
                : 'text-on-surface-variant hover:bg-surface-soft hover:text-on-surface'
            )}
          >
            {p}
          </Link>
        )
      )}

      <Link
        href={next <= totalPages ? getPageUrl(next) : '#'}
        aria-label="Next page"
        aria-disabled={page >= totalPages}
        className={cn(
          'btn-icon h-8 w-8',
          page >= totalPages && 'pointer-events-none opacity-40'
        )}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </Link>
    </nav>
  );
}
