import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiProviderId, ProviderStatus } from '../../../src/shared/types/ai';
import { useAppRuntime } from '../../../src/renderer/src/hooks/useAppRuntime';
import { createI18n } from '../../../src/renderer/src/i18n';
import { OPENAI_STATUS, SETTINGS } from '../editor/fixtures';

function wrapper({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={createI18n('en')}>{children}</I18nextProvider>;
}

const OPENROUTER_DISCONNECTED: ProviderStatus = {
  ...OPENAI_STATUS,
  id: 'openrouter',
  displayName: 'OpenRouter',
  enabled: true,
  connected: false,
  maskedCredential: undefined
};

/** Installs a fake bridge whose providers are the given statuses; connecting a provider marks it connected. */
function installBridge(statuses: ProviderStatus[]) {
  const byId = new Map<AiProviderId, ProviderStatus>(statuses.map((status) => [status.id, status]));
  const update = vi.fn(async (patch: Record<string, unknown>) => ({ ...SETTINGS, ...patch }));
  const connectProvider = vi.fn(async ({ providerId }: { providerId: AiProviderId }) => {
    const next = { ...byId.get(providerId)!, connected: true, maskedCredential: 'API key ending in 9999' };
    byId.set(providerId, next);
    return next;
  });
  vi.stubGlobal('tajtlisha', {
    app: { setZoomFactor: vi.fn() },
    settings: { get: async () => SETTINGS, update },
    ai: {
      listProviders: async () => [...byId.values()].map(({ id, displayName, authModes, capabilities }) => ({ id, displayName, authModes, capabilities })),
      getProviderStatus: async (providerId: AiProviderId) => byId.get(providerId),
      connectProvider
    }
  });
  return { update, connectProvider };
}

async function connect(settings: typeof SETTINGS, statuses: ProviderStatus[]) {
  const bridge = installBridge(statuses);
  const hook = renderHook(() => useAppRuntime(settings), { wrapper });
  await waitFor(() => expect(hook.result.current.phase).toBe('ready'));

  await act(async () => {
    await hook.result.current.connectProvider('openrouter', 'api_key', 'sk-test-9999');
  });
  return bridge;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connecting an API provider', () => {
  it('keeps the transcription provider when it is still connected', async () => {
    const { update } = await connect(SETTINGS, [OPENAI_STATUS, OPENROUTER_DISCONNECTED]);

    expect(update).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({
        activeProviderId: 'openai',
        authModeByProvider: expect.objectContaining({ openrouter: 'api_key' })
      })
    });
  });

  it('chooses the new provider for transcription when none was chosen', async () => {
    const settings = { ...SETTINGS, aiConnector: { ...SETTINGS.aiConnector, activeProviderId: undefined } };
    const { update } = await connect(settings, [{ ...OPENAI_STATUS, connected: false }, OPENROUTER_DISCONNECTED]);

    expect(update).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ activeProviderId: 'openrouter' })
    });
  });

  it('chooses the new provider for transcription when the chosen one is not connected', async () => {
    const { update } = await connect(SETTINGS, [{ ...OPENAI_STATUS, connected: false }, OPENROUTER_DISCONNECTED]);

    expect(update).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ activeProviderId: 'openrouter' })
    });
  });
});
