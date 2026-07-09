'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface DropdownItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface DropdownMenuProps {
  items: DropdownItem[];
  align?: 'left' | 'right';
  children?: React.ReactNode;
}

export function DropdownMenu({ items, align = 'right', children }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handler);
      document.addEventListener('keydown', keyHandler);
    }
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      {children ? (
        <div onClick={() => setOpen((o) => !o)}>{children}</div>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className="btn-icon"
          aria-label="More actions"
          aria-expanded={open}
          aria-haspopup="true"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      )}

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-30 mt-1 min-w-[160px] rounded-xl border border-border bg-surface p-1 shadow-drawer animate-scale-in',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {items.map((item, i) => {
            if (item.separator) {
              return <div key={i} className="my-1 border-t border-border-subtle" />;
            }
            return (
              <button
                key={i}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition',
                  item.danger
                    ? 'text-danger hover:bg-danger-soft'
                    : 'text-on-surface-variant hover:bg-surface-soft hover:text-on-surface',
                  item.disabled && 'pointer-events-none opacity-50'
                )}
              >
                {item.icon && <span className="h-4 w-4 shrink-0">{item.icon}</span>}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
