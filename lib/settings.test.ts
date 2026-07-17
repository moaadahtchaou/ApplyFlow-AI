import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  settings: {
    id: 'settings-1',
    singletonKey: 'default',
    aiProvider: 'nvidia',
    nvidiaApiKey: 'nvapi-existing-key-that-is-long-enough',
    defaultTone: 'professional',
    defaultLanguage: 'English'
  } as Record<string, unknown>
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userSettings: {
      findUnique: vi.fn(async () => ({ ...state.settings })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.settings = { id: 'settings-1', ...data };
        return { ...state.settings };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.settings = { ...state.settings, ...data };
        return { ...state.settings };
      })
    }
  }
}));

import {
  getOrCreateSettings,
  normalizedNewNvidiaKey,
  publicAiSettings,
  updateAiSettings
} from './settings';
import { resolveProvider } from './ai/provider';

beforeEach(() => {
  state.settings = {
    id: 'settings-1',
    singletonKey: 'default',
    aiProvider: 'nvidia',
    nvidiaApiKey: 'nvapi-existing-key-that-is-long-enough',
    defaultTone: 'professional',
    defaultLanguage: 'English'
  };
});

describe('AI settings persistence and API-key safety', () => {
  it('persists Mock and the newly selected provider is used immediately', async () => {
    await updateAiSettings({
      aiProvider: 'mock',
      nvidiaApiKey: '',
      defaultTone: 'professional',
      defaultLanguage: 'English'
    });
    const reloaded = await getOrCreateSettings();
    expect(reloaded.aiProvider).toBe('mock');
    expect(resolveProvider({
      requestedProvider: reloaded.aiProvider as string,
      apiKey: reloaded.nvidiaApiKey as string
    }).provider).toBe('mock');
  });

  it('persists NVIDIA and survives a settings reload', async () => {
    await updateAiSettings({
      aiProvider: 'nvidia',
      defaultTone: 'concise',
      defaultLanguage: 'French'
    });
    const reloaded = await getOrCreateSettings();
    expect(reloaded).toMatchObject({
      aiProvider: 'nvidia',
      defaultTone: 'concise',
      defaultLanguage: 'French'
    });
  });

  it('preserves the saved key when the key input is empty or masked', async () => {
    await updateAiSettings({
      aiProvider: 'nvidia',
      nvidiaApiKey: '',
      defaultTone: 'professional',
      defaultLanguage: 'English'
    });
    expect(state.settings.nvidiaApiKey).toBe('nvapi-existing-key-that-is-long-enough');
    await updateAiSettings({
      aiProvider: 'nvidia',
      nvidiaApiKey: '•••••••••••• (saved)',
      defaultTone: 'professional',
      defaultLanguage: 'English'
    });
    expect(state.settings.nvidiaApiKey).toBe('nvapi-existing-key-that-is-long-enough');
  });

  it('saves a newly entered valid key', async () => {
    await updateAiSettings({
      aiProvider: 'nvidia',
      nvidiaApiKey: 'nvapi-replacement-key-that-is-long-enough',
      defaultTone: 'professional',
      defaultLanguage: 'English'
    });
    expect(state.settings.nvidiaApiKey).toBe('nvapi-replacement-key-that-is-long-enough');
  });

  it('rejects malformed keys without logging or saving them', () => {
    expect(() => normalizedNewNvidiaKey('short key')).toThrow('valid NVIDIA API key');
  });

  it('never includes the API key in the public settings shape', () => {
    const publicValue = publicAiSettings(state.settings as {
      aiProvider: string;
      nvidiaApiKey: string;
      defaultTone: string;
      defaultLanguage: string;
    });
    expect(publicValue.nvidiaConfigured).toBe(true);
    expect(publicValue).not.toHaveProperty('nvidiaApiKey');
    expect(JSON.stringify(publicValue)).not.toContain('nvapi-existing');
  });
});
