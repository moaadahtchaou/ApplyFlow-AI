'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandLogo';

// ── Nav Item Types ─────────────────────────────────────────────────────────
interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  group?: string;
}

const navItems: NavItem[] = [
  // Workspace
  {
    href: '/',
    label: 'Dashboard',
    group: 'Workspace',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    )
  },
  {
    href: '/companies',
    label: 'Companies',
    group: 'Workspace',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
        <path d="M9 9h1M9 13h1M9 17h1M15 13h1M15 17h1" />
      </svg>
    )
  },
  {
    href: '/contacts',
    label: 'Contacts',
    group: 'Workspace',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  },
  // Create
  {
    href: '/lead-finder',
    label: 'Lead Finder',
    group: 'Create',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
    )
  },
  {
    href: '/ai-generator',
    label: 'AI Generator',
    group: 'Create',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
      </svg>
    )
  },
  {
    href: '/templates',
    label: 'Templates',
    group: 'Create',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" />
      </svg>
    )
  },
  // Account
  {
    href: '/profile',
    label: 'Profile / CV',
    group: 'Account',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    )
  },
  {
    href: '/settings',
    label: 'Settings',
    group: 'Account',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
        <path d="M12 2v2M12 20v2M4.9 4.9 7 7M17 17l2.1 2.1M2 12h2M20 12h2M4.9 19.1 7 17M17 7l2.1-2.1" />
      </svg>
    )
  }
];

const groups = ['Workspace', 'Create', 'Account'];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

// ── Brand Mark SVG ─────────────────────────────────────────────────────────
// ── Sidebar ────────────────────────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-border bg-surface',
        'transition-all duration-300 lg:flex',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      {/* Logo / Brand */}
      <div className={cn('flex items-center border-b border-border px-4 py-5', collapsed && 'justify-center px-0')}>
        {collapsed ? (
          <Link href="/" aria-label="Go to dashboard">
            <BrandMark className="h-9 w-9" priority />
          </Link>
        ) : (
          <Link href="/" aria-label="ApplyFlow AI dashboard" className="min-w-0">
            <BrandWordmark className="h-11 w-[196px]" priority />
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2.5" aria-label="Main navigation">
        {groups.map((group) => {
          const items = navItems.filter((item) => item.group === group);
          return (
            <div key={group} className="mb-4">
              {!collapsed && (
                <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-muted">
                  {group}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                        collapsed && 'justify-center px-0 py-3',
                        active
                          ? 'bg-primary-soft text-primary-text'
                          : 'text-on-surface-variant hover:bg-surface-soft hover:text-on-surface'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center',
                          active ? 'text-primary' : 'text-on-surface-muted group-hover:text-on-surface-variant'
                        )}
                      >
                        {item.icon}
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom controls */}
      <div className={cn('border-t border-border p-3', collapsed ? 'flex flex-col items-center gap-2' : 'space-y-3')}>
        {!collapsed && (
          <div className="px-1">
            <ThemeToggle />
          </div>
        )}
        {collapsed && <ThemeToggle compact />}

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className={cn(
            'flex h-8 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium text-on-surface-muted',
            'transition hover:bg-surface-soft hover:text-on-surface-variant',
            collapsed && 'w-8 justify-center px-0'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
          </svg>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
