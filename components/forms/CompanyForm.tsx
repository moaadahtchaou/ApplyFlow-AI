import type { Company } from '@prisma/client';
import { createCompany, updateCompany } from '@/app/actions';
import { companyStatuses } from '@/lib/constants';

export function CompanyForm({ company }: { company?: Company | null }) {
  const action = company ? updateCompany.bind(null, company.id) : createCompany;
  const status = companyStatuses.includes(company?.status as (typeof companyStatuses)[number]) ? company!.status : 'new';

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="status" value={status} />
      <label className="space-y-2">
        <span className="label">Company name</span>
        <input className="input" name="name" defaultValue={company?.name ?? ''} placeholder="Acme Robotics" required />
      </label>
      <label className="space-y-2">
        <span className="label">Contact source URL</span>
        <input className="input" name="sourceUrl" defaultValue={company?.sourceUrl ?? ''} placeholder="https://linkedin.com/... or careers page" />
      </label>
      <label className="space-y-2">
        <span className="label">Website</span>
        <input className="input" name="website" defaultValue={company?.website ?? ''} placeholder="https://company.com" />
      </label>
      <label className="space-y-2">
        <span className="label">Company email</span>
        <input className="input" type="email" name="email" defaultValue={company?.email ?? ''} placeholder="careers@company.com" />
      </label>
      <label className="space-y-2">
        <span className="label">Company phone</span>
        <input className="input" type="tel" name="phone" defaultValue={company?.phone ?? ''} placeholder="+212 5..." />
      </label>
      <label className="space-y-2">
        <span className="label">Company LinkedIn</span>
        <input className="input" name="linkedinUrl" defaultValue={company?.linkedinUrl ?? ''} placeholder="https://linkedin.com/company/..." />
      </label>
      <label className="space-y-2">
        <span className="label">Industry</span>
        <input className="input" name="industry" defaultValue={company?.industry ?? ''} placeholder="SaaS, Fintech, AI..." />
      </label>
      <label className="space-y-2">
        <span className="label">Location</span>
        <input className="input" name="location" defaultValue={company?.location ?? ''} placeholder="Berlin / Remote" />
      </label>
      <label className="space-y-2">
        <span className="label">City tag</span>
        <input className="input" name="city" defaultValue={company?.city ?? ''} placeholder="Casablanca" />
      </label>
      <label className="space-y-2 sm:col-span-2">
        <span className="label">Notes</span>
        <textarea className="input min-h-28" name="notes" defaultValue={company?.notes ?? ''} placeholder="Context, interests, or personalization notes." />
      </label>
      <div className="sm:col-span-2">
        <button className="btn-primary" type="submit">{company ? 'Update company' : 'Add company'}</button>
      </div>
    </form>
  );
}
