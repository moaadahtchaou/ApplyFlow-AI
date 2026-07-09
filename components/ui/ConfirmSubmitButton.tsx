'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * A submit button that shows a browser-native confirm dialog before submitting.
 * Preserved for backward-compatibility with existing forms that use form action + server action.
 */
export function ConfirmSubmitButton({
  message,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { message: string }) {
  return (
    <button
      type="submit"
      className={cn('btn-danger', className)}
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
      {...props}
    >
      {children}
    </button>
  );
}
