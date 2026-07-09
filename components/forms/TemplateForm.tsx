import type { EmailTemplate } from '@prisma/client';
import { createTemplate, updateTemplate } from '@/app/actions';
import { templateTypes } from '@/lib/constants';

export function TemplateForm({ template }: { template?: EmailTemplate | null }) {
  const action = template ? updateTemplate.bind(null, template.id) : createTemplate;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2">
        <span className="label">Template name</span>
        <input className="input" name="name" defaultValue={template?.name ?? ''} placeholder="Job introduction" required />
      </label>
      <label className="space-y-2">
        <span className="label">Type</span>
        <select className="input" name="type" defaultValue={template?.type ?? 'job_application'}>
          {templateTypes.map((type) => (
            <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>
          ))}
        </select>
      </label>
      <label className="space-y-2 sm:col-span-2">
        <span className="label">Subject</span>
        <input className="input" name="subject" defaultValue={template?.subject ?? ''} placeholder="{{purpose}} — {{companyName}}" required />
      </label>
      <label className="space-y-2 sm:col-span-2">
        <span className="label">Body</span>
        <textarea className="input min-h-52" name="body" defaultValue={template?.body ?? ''} placeholder="Hello {{contactName}}, ..." required />
      </label>
      <div className="sm:col-span-2">
        <button className="btn-primary" type="submit">{template ? 'Update template' : 'Create template'}</button>
      </div>
    </form>
  );
}
