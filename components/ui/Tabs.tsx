'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Tab {
  value: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (value: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onTabChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 border-b border-border', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          role="tab"
          aria-selected={activeTab === tab.value}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-all -mb-px',
            activeTab === tab.value
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-muted hover:text-on-surface-variant hover:border-border'
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                activeTab === tab.value
                  ? 'bg-primary-soft text-primary-text'
                  : 'bg-surface-soft text-on-surface-muted'
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
