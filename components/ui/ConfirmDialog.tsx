'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKey);
      requestAnimationFrame(() => cancelRef.current?.focus());
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [open, handleKey]);

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-overlay animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-desc"
        className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-dialog animate-scale-in"
      >
        <h2 id="dialog-title" className="text-base font-semibold text-on-surface">
          {title}
        </h2>
        <p id="dialog-desc" className="mt-2 text-sm text-on-surface-variant">
          {message}
        </p>
        <div className="mt-5 flex gap-3">
          <button
            ref={cancelRef}
            onClick={onClose}
            className="btn-secondary flex-1"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={danger ? 'btn-danger flex-1' : 'btn-primary flex-1'}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
