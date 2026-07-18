'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type ProfileDraft = {
  candidateProfile: string;
  defaultSignature: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  targetRole: string;
  experienceSummary: string;
  skills: string;
  languages: string;
  preferredLocations: string;
  cvText: string;
};

export function ProfileForm({ settings }: { settings: ProfileDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  function field(name: keyof ProfileDraft) {
    return {
      name,
      value: draft[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        {
          setDraft((current) => ({ ...current, [name]: event.target.value }));
          setNotice(null);
        }
    };
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      });
      const payload = await response.json() as {
        settings?: ProfileDraft;
        error?: { message?: string };
      };
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error?.message ?? 'The profile could not be saved.');
      }
      setDraft(payload.settings);
      setNotice({ kind: 'success', text: 'Profile saved. Existing company matches are now outdated.' });
      router.refresh();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'The profile could not be saved.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2"><span className="label">Full name</span><input className="input" {...field('fullName')} /></label>
        <label className="space-y-2"><span className="label">Email</span><input className="input" type="email" {...field('email')} /></label>
        <label className="space-y-2"><span className="label">Phone</span><input className="input" {...field('phone')} /></label>
        <label className="space-y-2"><span className="label">Location</span><input className="input" {...field('location')} /></label>
        <label className="space-y-2"><span className="label">Target role</span><input className="input" {...field('targetRole')} /></label>
        <label className="space-y-2"><span className="label">Preferred locations</span><input className="input" {...field('preferredLocations')} /></label>
        <label className="space-y-2"><span className="label">Skills</span><input className="input" {...field('skills')} /></label>
        <label className="space-y-2"><span className="label">Languages</span><input className="input" {...field('languages')} /></label>
      </div>
      <label className="space-y-2"><span className="label">Experience summary</span><textarea className="input min-h-28" {...field('experienceSummary')} /></label>
      <label className="space-y-2"><span className="label">Candidate context used by AI</span><textarea className="input min-h-40" {...field('candidateProfile')} /></label>
      <label className="space-y-2"><span className="label">CV text</span><textarea className="input min-h-52" {...field('cvText')} /></label>
      <label className="space-y-2"><span className="label">Message signature</span><textarea className="input min-h-24" {...field('defaultSignature')} placeholder={'Best regards,\nYour name'} /></label>
      {notice ? (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm font-semibold ${
          notice.kind === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
        }`}>{notice.text}</p>
      ) : null}
      <div><button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving profile…' : 'Save profile'}</button></div>
    </form>
  );
}
