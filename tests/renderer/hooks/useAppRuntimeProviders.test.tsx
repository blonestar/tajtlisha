import type { ReactNode } from 'react';
import { createElement } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderStatus, ProviderSummary } from '../../../src/shared/types/ai';
import { useAppRuntime } from '../../../src/renderer/src/hooks/useAppRuntime';
import { createI18n } from '../../../src/renderer/src/i18n';
import { mockProviderStatuses, mockSettings } from '../settings/mockSettings';
import { installFakeApi, removeFakeApi } from '../settings/fixtures';

afterEach(() => {
  removeFakeApi();
});

function wrapper({ children }: { children: ReactNode }) {
  return createElement(I18nextProvider, { i18n: createI18n('en') }, children);
}

const claudeStatus: ProviderStatus = {
  ...mockProviderStatuses[0],
  id: 'claude_code_cli',
  displayName: 'Claude Code (local)',
  authModes: ['local_cli'],
  experimental: true,
  enabled: false,
  connected: false,
  maskedCredential: undefined,
  message: 'Claude Code (local) is turned off.'
};

const summaries: ProviderSummary[] = [mockProviderStatuses[0], claudeStatus];

describe('useAppRuntime provider lists', () => {
  it('exposes only turned-on connectors as providers, and every connector as allProviders', async () => {
    installFakeApi({
      settings: { get: async () => mockSettings, update: async (patch: object) => ({ ...mockSettings, ...patch }) },
      ai: {
        listProviders: async () => summaries,
        getProviderStatus: async (providerId: string) => (providerId === 'claude_code_cli' ? claudeStatus : mockProviderStatuses[0])
      },
      app: { setZoomFactor: vi.fn() }
    });

    const { result } = renderHook(() => useAppRuntime(mockSettings), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    expect(result.current.allProviders.map((provider) => provider.id)).toEqual(['openai', 'claude_code_cli']);
    expect(result.current.providers.map((provider) => provider.id)).toEqual(['openai']);
  });

  it('treats a status without the enabled flag as turned on', async () => {
    const { enabled: _enabled, ...withoutFlag } = mockProviderStatuses[0];
    installFakeApi({
      settings: { get: async () => mockSettings, update: async (patch: object) => ({ ...mockSettings, ...patch }) },
      ai: { listProviders: async () => [mockProviderStatuses[0]], getProviderStatus: async () => withoutFlag as ProviderStatus },
      app: { setZoomFactor: vi.fn() }
    });

    const { result } = renderHook(() => useAppRuntime(mockSettings), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    expect(result.current.providers.map((provider) => provider.id)).toEqual(['openai']);
  });

  it('moves a connector out of providers after a refresh reports it turned off', async () => {
    let claudeEnabled = true;
    const claudeWhenOn: ProviderStatus = { ...claudeStatus, enabled: true, connected: true, message: undefined };
    installFakeApi({
      settings: { get: async () => mockSettings, update: async (patch: object) => ({ ...mockSettings, ...patch }) },
      ai: {
        listProviders: async () => summaries,
        getProviderStatus: async (providerId: string) =>
          providerId === 'claude_code_cli' ? (claudeEnabled ? claudeWhenOn : claudeStatus) : mockProviderStatuses[0]
      },
      app: { setZoomFactor: vi.fn() }
    });

    const { result } = renderHook(() => useAppRuntime(mockSettings), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.providers.map((provider) => provider.id)).toEqual(['openai', 'claude_code_cli']);

    claudeEnabled = false;
    await act(async () => {
      await result.current.refreshProviders();
    });
    expect(result.current.providers.map((provider) => provider.id)).toEqual(['openai']);
  });
});
