'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import { ContactForm } from '@/components/forms/ContactForm';
import type { Company, Contact } from '@prisma/client';

interface ContactDrawerProps {
  contact?: Contact | null;
  companies: Company[];
}

export function ContactDrawer({ contact, companies }: ContactDrawerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const isOpen = searchParams.has('new') || searchParams.has('edit');

  const handleClose = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    params.delete('edit');
    router.push(`/contacts${params.size > 0 ? `?${params}` : ''}`);
  };

  return (
    <Drawer
      open={isOpen}
      onClose={handleClose}
      title={contact ? 'Edit contact' : 'Add contact'}
      description="A detailed contact record makes generated messages much more personal."
      size="md"
    >
      <ContactForm contact={contact} companies={companies} />
    </Drawer>
  );
}
