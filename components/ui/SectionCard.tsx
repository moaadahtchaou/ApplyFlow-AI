import { cn } from '@/lib/utils';

interface CardProps {
  className?: string;
  children: React.ReactNode;
  elevated?: boolean;
}

export function Card({ className, children, elevated = false }: CardProps) {
  return (
    <div className={cn(elevated ? 'card-elevated' : 'card', className)}>
      {children}
    </div>
  );
}

interface SectionCardProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  noPadding?: boolean;
}

export function SectionCard({ title, description, action, className, children, noPadding = false }: SectionCardProps) {
  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-on-surface-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn(!noPadding && 'p-5')}>
        {children}
      </div>
    </div>
  );
}
