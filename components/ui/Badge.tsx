import { cn } from '@/lib/utils';

export type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'muted' | 'accent';

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

const variantMap: Record<BadgeVariant, string> = {
  primary: 'badge-primary',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  muted: 'badge-muted',
  accent: 'bg-lime-400/20 text-lime-500 dark:bg-lime-400/10 dark:text-lime-400'
};

export function Badge({ variant = 'muted', className, children }: BadgeProps) {
  return (
    <span className={cn('badge', variantMap[variant], className)}>
      {children}
    </span>
  );
}
