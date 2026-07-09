'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  side?: 'right' | 'left';
}

const sizeMap = {
  sm: 'w-full max-w-sm',
  md: 'w-full max-w-md',
  lg: 'w-full max-w-lg'
};

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  side = 'right'
}: DrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKey);
      document.body.style.overflow = 'hidden';
      // Focus the close button after animation frame
      requestAnimationFrame(() => closeRef.current?.focus());
      return () => {
        document.removeEventListener('keydown', handleKey);
        document.body.style.overflow = '';
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [open, handleKey]);

  if (!open) return null;

  const content = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-overlay animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        aria-describedby={description ? 'drawer-desc' : undefined}
        className={cn(
          'fixed inset-y-0 z-50 flex flex-col bg-surface shadow-drawer',
          side === 'right' ? 'right-0 animate-slide-in-right' : 'left-0 animate-slide-in-left',
          sizeMap[size]
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="drawer-title" className="text-base font-semibold text-on-surface">
              {title}
            </h2>
            {description && (
              <p id="drawer-desc" className="mt-0.5 text-sm text-on-surface-muted">
                {description}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="btn-icon shrink-0"
            aria-label="Close drawer"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
