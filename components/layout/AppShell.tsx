'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { MobileDrawer } from './MobileDrawer';
import { cn } from '@/lib/utils';

const SIDEBAR_STORAGE_KEY = 'applyflow-sidebar-collapsed';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore persisted collapse state
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
      } catch {}
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  };

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />

      {/* Mobile header */}
      <MobileHeader onOpenMenu={() => setMobileOpen(true)} />

      {/* Mobile slide-over drawer */}
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main content area */}
      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          'pt-14 lg:pt-0', // account for mobile header
          collapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]'
        )}
      >
        <div className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
