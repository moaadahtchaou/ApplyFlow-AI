import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ title, description, action, icon, className, compact = false }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      compact ? 'py-8 px-4' : 'py-12 px-6',
      className
    )}>
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-soft text-on-surface-muted">
          {icon}
        </div>
      ) : (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-soft">
          <svg className="h-6 w-6 text-on-surface-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 01-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 011-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 011.52 0C14.51 3.81 17 5 19 5a1 1 0 011 1z" />
          </svg>
        </div>
      )}
      <p className="text-sm font-semibold text-on-surface">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-on-surface-muted max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
