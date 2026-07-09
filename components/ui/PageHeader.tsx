import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  breadcrumb?: string;
  className?: string;
}

export function PageHeader({ title, description, action, breadcrumb, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex items-start justify-between gap-4', className)}>
      <div>
        {breadcrumb && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-on-surface-muted">
            {breadcrumb}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-on-surface-muted max-w-xl">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </div>
  );
}
