'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs } from '@/components/ui/Tabs';

const TAB_DEFS = [
  { value: 'overview', label: 'Overview' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'messages', label: 'Saved Messages' },
  { value: 'leads', label: 'Lead Sources' }
];

interface CompanyTabsProps {
  contactCount: number;
  messageCount: number;
  leadCount: number;
  companyId: string;
}

export function CompanyTabs({ contactCount, messageCount, leadCount, companyId }: CompanyTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'overview';

  const tabs = TAB_DEFS.map((t) => {
    const count =
      t.value === 'contacts' ? contactCount
        : t.value === 'messages' ? messageCount
        : t.value === 'leads' ? leadCount
        : undefined;
    return { ...t, count };
  });

  const handleChange = (value: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set('tab', value);
    router.push(`/companies/${companyId}?${p}`);
  };

  return <Tabs tabs={tabs} activeTab={activeTab} onTabChange={handleChange} />;
}
