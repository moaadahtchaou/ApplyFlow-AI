import { cn, humanize } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700 ring-slate-200',
  priority: 'bg-violet-50 text-violet-700 ring-violet-200',
  archived: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  imported: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  ignored: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  running: 'bg-indigo-50 text-indigo-700 ring-indigo-200'
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={cn('status-chip', statusStyles[value] ?? statusStyles.new)}>
      {humanize(value)}
    </span>
  );
}
