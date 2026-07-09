'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { BrandWordmark } from '@/components/brand/BrandLogo';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { href: '/', label: 'Dashboard', group: 'Workspace', icon: '⌂' },
  { href: '/companies', label: 'Companies', group: 'Workspace', icon: '🏢' },
  { href: '/contacts', label: 'Contacts', group: 'Workspace', icon: '👥' },
  { href: '/lead-finder', label: 'Lead Finder', group: 'Create', icon: '🔍' },
  { href: '/ai-generator', label: 'AI Generator', group: 'Create', icon: '✨' },
  { href: '/templates', label: 'Templates', group: 'Create', icon: '📄' },
  { href: '/profile', label: 'Profile / CV', group: 'Account', icon: '👤' },
  { href: '/settings', label: 'Settings', group: 'Account', icon: '⚙️' }
];

const groups = ['Workspace', 'Create', 'Account'];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Close on route change
  useEffect(() => {
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Focus management + keyboard trap
  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleKey);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleKey);
        document.body.style.overflow = '';
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-overlay lg:hidden animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-surface shadow-drawer lg:hidden animate-slide-in-left"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-5">
          <Link href="/" onClick={onClose} aria-label="ApplyFlow AI dashboard">
            <BrandWordmark className="h-10 w-40" priority />
          </Link>

          <button
            ref={closeRef}
            onClick={onClose}
            className="btn-icon"
            aria-label="Close navigation menu"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label="Mobile navigation">
          {groups.map((group) => {
            const items = navItems.filter((item) => item.group === group);
            return (
              <div key={group} className="mb-5">
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-muted">
                  {group}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                          active
                            ? 'bg-primary-soft text-primary-text'
                            : 'text-on-surface-variant hover:bg-surface-soft hover:text-on-surface'
                        )}
                      >
                        <span className="text-base leading-none">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <ThemeToggle />
        </div>
      </div>
    </>
  );
}
