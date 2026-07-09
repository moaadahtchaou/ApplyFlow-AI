import type { Company, Contact } from '@prisma/client';
import { createContact, updateContact } from '@/app/actions';

export function ContactForm({
  contact,
  companies,
  lockedCompanyId,
  redirectTo,
  submitLabel
}: {
  contact?: Contact | null;
  companies: Company[];
  lockedCompanyId?: string;
  redirectTo?: string;
  submitLabel?: string;
}) {
  const action = contact ? updateContact.bind(null, contact.id) : createContact;
  const selectedCompanyId = lockedCompanyId ?? contact?.companyId ?? '';
  const lockedCompany = lockedCompanyId ? companies.find((company) => company.id === lockedCompanyId) : null;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
      {lockedCompanyId ? <input type="hidden" name="companyId" value={lockedCompanyId} /> : null}
      <label className="space-y-2">
        <span className="label">Full name</span>
        <input className="input" name="fullName" defaultValue={contact?.fullName ?? ''} placeholder="Lina Schneider" required />
      </label>
      <label className="space-y-2">
        <span className="label">Role / title</span>
        <input className="input" name="title" defaultValue={contact?.title ?? ''} placeholder="Recruiter, CTO, Hiring Manager..." />
      </label>
      <label className="space-y-2">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" defaultValue={contact?.email ?? ''} placeholder="name@company.com" required />
      </label>
      <label className="space-y-2">
        <span className="label">LinkedIn URL</span>
        <input className="input" name="linkedinUrl" defaultValue={contact?.linkedinUrl ?? ''} placeholder="https://linkedin.com/in/..." />
      </label>
      <label className="space-y-2">
        <span className="label">Phone</span>
        <input className="input" type="tel" name="phone" defaultValue={contact?.phone ?? ''} placeholder="+212 6..." />
      </label>
      <label className="space-y-2">
        <span className="label">Company</span>
        {lockedCompanyId ? (
          <div className="input flex items-center font-bold text-slate-700">{lockedCompany?.name ?? 'Selected company'}</div>
        ) : (
          <select className="input" name="companyId" defaultValue={selectedCompanyId}>
            <option value="">No company</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        )}
      </label>
      <label className="space-y-2 sm:col-span-2">
        <span className="label">Notes</span>
        <textarea className="input min-h-28" name="notes" defaultValue={contact?.notes ?? ''} placeholder="Context that can improve personalized messages." />
      </label>
      <div className="sm:col-span-2">
        <button className="btn-primary" type="submit">{submitLabel ?? (contact ? 'Update contact' : 'Add contact')}</button>
      </div>
    </form>
  );
}
