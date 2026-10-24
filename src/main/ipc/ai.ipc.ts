import type { AiProviderCapabilities, AuthMode, ConnectProviderInput } from '../../shared/types/ai';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { AiProviderRegistry } from '../ai';
import { requireOneOf, requireProviderId, requireRecord, requireString } from './validation';
import type { IpcRegistrar } from './types';

export type AiIpcDeps = {
  ipc: IpcRegistrar;
  registry: Pick<
    AiProviderRegistry,
    'listProviders' | 'getProviderStatus' | 'connectProvider' | 'disconnectProvider' | 'testConnection' | 'listModels'
  >;
};

const AUTH_MODES: readonly AuthMode[] = ['api_key', 'codex_auth_experimental'];
const CAPABILITIES: ReadonlyArray<keyof AiProviderCapabilities> = [
  'detectLanguage',
  'transcription',
  'segmentTimestamps',
  'wordTimestamps',
  'translation',
  'subtitlePolish',
  'textToSpeech',
  'summary'
];

export function registerAiIpc({ ipc, registry }: AiIpcDeps): void {
  ipc.handle(IPC_CHANNELS.aiListProviders, () => registry.listProviders());

  ipc.handle(IPC_CHANNELS.aiGetProviderStatus, (_event, providerId: unknown) =>
    registry.getProviderStatus(requireProviderId(providerId))
  );

  ipc.handle(IPC_CHANNELS.aiConnectProvider, (_event, payload: unknown) => registry.connectProvider(toConnectInput(payload)));

  ipc.handle(IPC_CHANNELS.aiDisconnectProvider, (_event, providerId: unknown) =>
    registry.disconnectProvider(requireProviderId(providerId))
  );

  ipc.handle(IPC_CHANNELS.aiTestConnection, (_event, providerId: unknown) => registry.testConnection(requireProviderId(providerId)));

  ipc.handle(IPC_CHANNELS.aiListModels, (_event, providerId: unknown, capability: unknown) =>
    registry.listModels(requireProviderId(providerId), requireOneOf(capability, CAPABILITIES, 'capability'))
  );
}

function toConnectInput(payload: unknown): ConnectProviderInput {
  const input = requireRecord(payload, 'input');
  const providerId = requireProviderId(input.providerId);
  const authMode = requireOneOf(input.authMode, AUTH_MODES, 'authMode');
  // The secret goes straight to the credential store and is never echoed or logged.
  if (input.secret === undefined) {
    return { providerId, authMode };
  }
  return { providerId, authMode, secret: requireString(input.secret, 'secret') };
}
