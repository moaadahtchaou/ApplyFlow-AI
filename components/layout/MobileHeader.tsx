'use client';

import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { BrandMark } from '@/components/brand/BrandLogo';

interface MobileHeaderProps {
  onOpenMenu: () => void;
}

// Derive page title from pathname
function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  const segment = pathname.split('/')[1];
  const map: Record<string, string> = {
    companies: 'Companies',
    contacts: 'Contacts',
    'lead-finder': 'Lead Finder',
    'ai-generator': 'AI Generator',
    templates: 'Templates',
    profile: 'Profile / CV',
    settings: 'Settings'
  };
  return map[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
}

export function MobileHeader({ onOpenMenu }: MobileHeaderProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="fixed left-0 top-0 right-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/95 backdrop-blur px-4 lg:hidden">
      {/* Hamburger */}
      <button
        onClick={onOpenMenu}
        className="btn-icon"
        aria-label="Open navigation menu"
        id="mobile-menu-btn"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Logo + page title */}
      <div className="flex items-center gap-2">
        <BrandMark className="h-7 w-7 rounded-md" priority />
        <span className="text-sm font-semibold text-on-surface">{title}</span>
      </div>

      {/* Theme toggle */}
      <ThemeToggle compact />
    </header>
  );
}
