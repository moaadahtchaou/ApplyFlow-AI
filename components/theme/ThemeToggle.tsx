'use client';

import { useTheme } from '@/components/theme/ThemeProvider';
import type { ThemeMode } from '@/components/theme/ThemeProvider';
import { cn } from '@/lib/utils';

const options: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    )
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    )
  },
  {
    value: 'system',
    label: 'System',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    )
  }
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  if (compact) {
    // Icon-only cycle button
    const current = options.find((o) => o.value === theme) ?? options[2];
    const next = options[(options.indexOf(current) + 1) % options.length];
    return (
      <button
        onClick={() => setTheme(next.value)}
        className="btn-icon"
        title={`Switch to ${next.label} mode`}
        aria-label={`Current: ${current.label} mode. Click to switch to ${next.label}.`}
      >
        {current.icon}
      </button>
    );
  }

  return (
    <div className="flex items-center rounded-lg border border-border bg-surface-soft p-1 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all',
            theme === opt.value
              ? 'bg-surface text-on-surface shadow-sm'
              : 'text-on-surface-muted hover:text-on-surface-variant'
          )}
          aria-pressed={theme === opt.value}
          title={`${opt.label} mode`}
        >
          {opt.icon}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
