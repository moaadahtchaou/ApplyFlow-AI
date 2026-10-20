'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { messageLanguages, tones } from '@/lib/constants';

type SafeAiSettings = {
  aiProvider: 'mock' | 'nvidia';
  defaultTone: string;
  defaultLanguage: string;
  nvidiaConfigured: boolean;
  model: string;
  mockMode: boolean;
  timeoutMs: number;
};

type TestResult = {
  success: boolean;
  status?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  requestId?: string;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
};

export function SettingsForm({ initialSettings }: { initialSettings: SafeAiSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [provider, setProvider] = useState(initialSettings.aiProvider);
  const [apiKey, setApiKey] = useState('');
  const [language, setLanguage] = useState(initialSettings.defaultLanguage);
  const [tone, setTone] = useState(initialSettings.defaultTone);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  async function save() {
    if (busy) return;
    setBusy('save');
    setMessage(null);
    try {
      const response = await fetch('/api/settings/ai', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiProvider: provider,
          nvidiaApiKey: apiKey,
          defaultTone: tone,
          defaultLanguage: language
        })
      });
      const payload = await response.json() as {
        success?: boolean;
        settings?: SafeAiSettings;
        error?: { message?: string };
      };
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error?.message ?? 'Could not save AI settings.');
      }
      setSettings(payload.settings);
      setProvider(payload.settings.aiProvider);
      setApiKey('');
      setTestResult(null);
      setMessage({
        kind: 'success',
        text: payload.settings.mockMode
          ? 'Mock provider saved and active for the next AI request.'
          : 'NVIDIA provider saved and active for the next AI request.'
      });
      router.refresh();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not save AI settings.' });
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    if (busy) return;
    setBusy('test');
    setMessage(null);
    setTestResult(null);
    try {
      const response = await fetch('/api/settings/ai/test', { method: 'POST' });
      const payload = await response.json() as TestResult;
      setTestResult(payload);
    } catch {
      setTestResult({
        success: false,
        error: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'The connection test could not reach the ApplyFlow server.'
        }
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
      <div className="card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-on-surface">AI Provider & Defaults</h2>
          <p className="mt-0.5 text-xs text-on-surface-muted">
            Mock is used only when explicitly selected. NVIDIA failures never fall back to local output.
          </p>
        </div>
        <div className="grid gap-4 p-5">
          <label className="space-y-2">
            <span className="label">AI provider</span>
            <select
              className="input"
              value={provider}
              onChange={(event) => setProvider(event.target.value as 'mock' | 'nvidia')}
            >
              <option value="nvidia">NVIDIA AI</option>
              <option value="mock">Mock — local testing only</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="label">NVIDIA API key</span>
            <input
              className="input"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="new-password"
              placeholder={settings.nvidiaConfigured ? '•••••••••••• (saved)' : 'nvapi-...'}
            />
            <span className="block text-xs text-on-surface-variant">
              {settings.nvidiaConfigured
                ? 'A key is saved locally. Leave this blank to preserve it.'
                : 'No key is saved. Mock mode does not require one.'}
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="label">Default language</span>
              <select className="input" value={language} onChange={(event) => setLanguage(event.target.value)}>
                {messageLanguages.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="label">Default tone</span>
              <select className="input" value={tone} onChange={(event) => setTone(event.target.value)}>
                {tones.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>
          {message ? (
            <p className={message.kind === 'success'
              ? 'rounded-lg bg-success-soft px-4 py-3 text-sm font-semibold text-success'
              : 'rounded-lg bg-danger-soft px-4 py-3 text-sm font-semibold text-danger'}>
              {message.text}
            </p>
          ) : null}
          <div>
            <button className="btn-primary" type="button" onClick={save} disabled={busy !== null}>
              {busy === 'save' ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-on-surface">Provider Status</h3>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">Active provider</span>
              <Badge variant="success">{settings.aiProvider}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">NVIDIA configured</span>
              <Badge variant={settings.nvidiaConfigured ? 'success' : 'muted'}>
                {settings.nvidiaConfigured ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">Mock mode</span>
              <Badge variant={settings.mockMode ? 'warning' : 'muted'}>
                {settings.mockMode ? 'On' : 'Off'}
              </Badge>
            </div>
            {settings.mockMode ? (
              <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
                Mock mode — testing output
              </p>
            ) : null}
            <div className="border-t border-border-subtle pt-2 text-xs text-on-surface-muted">
              <p>{settings.model}</p>
              <p>Timeout: {Math.round(settings.timeoutMs / 1000)} seconds</p>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-2 text-sm font-semibold text-on-surface">Test NVIDIA connection</h3>
          <p className="mb-4 text-xs leading-5 text-on-surface-muted">
            Sends a minimal JSON request using the saved key. It does not read or change your CV profile.
          </p>
          <button className="btn-sm btn-secondary" type="button" onClick={testConnection} disabled={busy !== null}>
            {busy === 'test' ? 'Testing…' : 'Test NVIDIA connection'}
          </button>
          {testResult ? (
            <div className="mt-4 border-t border-border-subtle pt-3 text-sm">
              <p className={testResult.success ? 'font-semibold text-success' : 'font-semibold text-danger'}>
                {testResult.success ? 'Connected' : 'Failed'}
              </p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-on-surface-muted">Provider</dt>
                <dd className="text-on-surface-variant">{testResult.provider ?? 'nvidia'}</dd>
                <dt className="text-on-surface-muted">Model</dt>
                <dd className="break-all text-on-surface-variant">{testResult.model ?? settings.model}</dd>
                <dt className="text-on-surface-muted">Latency</dt>
                <dd className="text-on-surface-variant">
                  {typeof testResult.latencyMs === 'number' ? `${testResult.latencyMs} ms` : '—'}
                </dd>
                {!testResult.success ? (
                  <>
                    <dt className="text-on-surface-muted">Category</dt>
                    <dd className="text-on-surface-variant">{testResult.error?.code ?? 'UNKNOWN_AI_ERROR'}</dd>
                  </>
                ) : null}
              </dl>
              {!testResult.success && testResult.error?.message ? (
                <p className="mt-2 text-xs leading-5 text-danger">{testResult.error.message}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
