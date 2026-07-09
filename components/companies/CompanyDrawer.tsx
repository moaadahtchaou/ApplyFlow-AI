'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import { CompanyForm } from '@/components/forms/CompanyForm';
import type { Company } from '@prisma/client';

interface CompanyDrawerProps {
  company?: Company | null;
}

export function CompanyDrawer({ company }: CompanyDrawerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const isOpen = searchParams.has('new') || searchParams.has('edit');

  const handleClose = () => {
    // Remove drawer params while preserving filters
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    params.delete('edit');
    router.push(`/companies${params.size > 0 ? `?${params}` : ''}`);
  };

  return (
    <Drawer
      open={isOpen}
      onClose={handleClose}
      title={company ? 'Edit company' : 'Add company'}
      description="Keep each company profile useful for AI personalization."
      size="md"
    >
      <CompanyForm company={company} />
    </Drawer>
  );
}
