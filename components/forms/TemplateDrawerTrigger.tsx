'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import { TemplateForm } from '@/components/forms/TemplateForm';
import type { EmailTemplate } from '@prisma/client';

interface TemplateDrawerTriggerProps {
  template?: EmailTemplate | null;
  isOpen: boolean;
}

export function TemplateDrawerTrigger({ template, isOpen }: TemplateDrawerTriggerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleClose = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    params.delete('edit');
    router.push(`/templates${params.size > 0 ? `?${params}` : ''}`);
  };

  return (
    <Drawer
      open={isOpen}
      onClose={handleClose}
      title={template ? 'Edit template' : 'Create template'}
      description="Use placeholders like {{companyName}}, {{contactName}}, {{purpose}}, {{candidateProfile}}, and {{signature}}."
      size="lg"
    >
      <TemplateForm template={template} />
    </Drawer>
  );
}
