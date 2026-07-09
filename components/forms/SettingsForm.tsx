import type { UserSettings } from '@prisma/client';
import { updateSystemSettings } from '@/app/actions';
import { messageLanguages, tones } from '@/lib/constants';

export function SettingsForm({ settings }: { settings: UserSettings }) {
  return (
    <form action={updateSystemSettings} className="grid gap-4">
      <label className="space-y-2">
        <span className="label">AI provider</span>
        <select className="input" name="aiProvider" defaultValue={settings.aiProvider}>
          <option value="mock">Mock (local, no key required)</option>
          <option value="nvidia">NVIDIA</option>
        </select>
      </label>
      <label className="space-y-2">
        <span className="label">NVIDIA API key</span>
        <input className="input" type="password" name="nvidiaApiKey" defaultValue={settings.nvidiaApiKey} autoComplete="off" placeholder="nvapi-..." />
        <span className="block text-xs text-on-surface-variant">Stored only in your local SQLite database. Leave empty to use mock AI.</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="label">Default language</span>
          <select className="input" name="defaultLanguage" defaultValue={settings.defaultLanguage}>
            {messageLanguages.map((language) => <option key={language} value={language}>{language}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="label">Default tone</span>
          <select className="input" name="defaultTone" defaultValue={settings.defaultTone}>
            {tones.map((tone) => <option key={tone} value={tone}>{tone}</option>)}
          </select>
        </label>
      </div>
      <div><button className="btn-primary" type="submit">Save settings</button></div>
    </form>
  );
}
