import type { UserSettings } from '@prisma/client';
import { updateProfile } from '@/app/actions';

export function ProfileForm({ settings }: { settings: UserSettings }) {
  return (
    <form action={updateProfile} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2"><span className="label">Full name</span><input className="input" name="fullName" defaultValue={settings.fullName} /></label>
        <label className="space-y-2"><span className="label">Email</span><input className="input" type="email" name="email" defaultValue={settings.email} /></label>
        <label className="space-y-2"><span className="label">Phone</span><input className="input" name="phone" defaultValue={settings.phone} /></label>
        <label className="space-y-2"><span className="label">Location</span><input className="input" name="location" defaultValue={settings.location} /></label>
        <label className="space-y-2"><span className="label">Target role</span><input className="input" name="targetRole" defaultValue={settings.targetRole} /></label>
        <label className="space-y-2"><span className="label">Preferred locations</span><input className="input" name="preferredLocations" defaultValue={settings.preferredLocations} /></label>
        <label className="space-y-2"><span className="label">Skills</span><input className="input" name="skills" defaultValue={settings.skills} /></label>
        <label className="space-y-2"><span className="label">Languages</span><input className="input" name="languages" defaultValue={settings.languages} /></label>
      </div>
      <label className="space-y-2"><span className="label">Experience summary</span><textarea className="input min-h-28" name="experienceSummary" defaultValue={settings.experienceSummary} /></label>
      <label className="space-y-2"><span className="label">Candidate context used by AI</span><textarea className="input min-h-40" name="candidateProfile" defaultValue={settings.candidateProfile} /></label>
      <label className="space-y-2"><span className="label">CV text</span><textarea className="input min-h-52" name="cvText" defaultValue={settings.cvText} /></label>
      <label className="space-y-2"><span className="label">Message signature</span><textarea className="input min-h-24" name="defaultSignature" defaultValue={settings.defaultSignature} placeholder="Best regards,&#10;Your name" /></label>
      <div><button className="btn-primary" type="submit">Save profile</button></div>
    </form>
  );
}
