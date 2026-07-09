'use client';

import { ThemeToggle } from './ThemeToggle';
import { useTheme } from './ThemeProvider';

export function ThemeSection() {
  const { theme, resolvedTheme } = useTheme();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-on-surface">Color theme</p>
        <p className="mt-0.5 text-xs text-on-surface-muted">
          Currently: <span className="font-semibold capitalize">{theme}</span>
          {theme === 'system' && ` (resolved: ${resolvedTheme})`}
        </p>
      </div>
      <ThemeToggle />
    </div>
  );
}
