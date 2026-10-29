import { describe, expect, it } from 'vitest';
import type { ProviderStatus } from '../../../src/shared/types/ai';
import { activeProviderAfterConnect, generateProviderInfo, providerRolesOf } from '../../../src/renderer/src/utils/providerRoles';
import { OPENAI_STATUS, SETTINGS } from '../editor/fixtures';

const openRouter: ProviderStatus = {
  ...OPENAI_STATUS,
  id: 'openrouter',
  displayName: 'OpenRouter',
  connected: false,
  maskedCredential: undefined
};

const codex: ProviderStatus = {
  ...OPENAI_STATUS,
  id: 'codex_cli',
  displayName: 'Codex CLI (local)',
  authModes: ['local_cli'],
  capabilities: { ...OPENAI_STATUS.capabilities, transcription: false }
};

describe('providerRolesOf', () => {
  it('resolves translation and summary providers, falling back to the transcription provider', () => {
    expect(providerRolesOf(SETTINGS, [OPENAI_STATUS])).toEqual({
      transcriptionId: 'openai',
      textId: 'openai',
      summaryId: 'openai'
    });
  });

  it('uses the stored text and summary providers when they are registered', () => {
    const settings = {
      ...SETTINGS,
      aiConnector: { ...SETTINGS.aiConnector, textProviderId: 'codex_cli' as const },
      summary: { ...SETTINGS.summary, providerId: 'openrouter' as const }
    };

    expect(providerRolesOf(settings, [OPENAI_STATUS, codex, openRouter])).toEqual({
      transcriptionId: 'openai',
      textId: 'codex_cli',
      summaryId: 'openrouter'
    });
  });

  it('ignores a turned-off transcription provider, so no role is left on it', () => {
    const settings = { ...SETTINGS, aiConnector: { ...SETTINGS.aiConnector, activeProviderId: 'claude_code_cli' as const } };

    expect(providerRolesOf(settings, [OPENAI_STATUS])).toEqual({
      transcriptionId: undefined,
      textId: undefined,
      summaryId: undefined
    });
  });

  it('keeps a turned-on text provider when the transcription provider is turned off', () => {
    const settings = {
      ...SETTINGS,
      aiConnector: { ...SETTINGS.aiConnector, activeProviderId: 'claude_code_cli' as const, textProviderId: 'codex_cli' as const }
    };

    expect(providerRolesOf(settings, [codex]).transcriptionId).toBeUndefined();
    expect(providerRolesOf(settings, [codex]).textId).toBe('codex_cli');
  });

  it('falls back to the text provider when the summary provider is not registered', () => {
    const settings = {
      ...SETTINGS,
      aiConnector: { ...SETTINGS.aiConnector, textProviderId: 'codex_cli' as const },
      summary: { ...SETTINGS.summary, providerId: 'openrouter' as const }
    };

    expect(providerRolesOf(settings, [OPENAI_STATUS, codex]).summaryId).toBe('codex_cli');
  });
});

describe('activeProviderAfterConnect', () => {
  it('gives the transcription role to the first connected provider', () => {
    expect(activeProviderAfterConnect(undefined, 'openrouter', [{ ...openRouter, connected: true }])).toBe('openrouter');
  });

  it('keeps the chosen transcription provider when it is still connected', () => {
    expect(activeProviderAfterConnect('openai', 'openrouter', [OPENAI_STATUS, { ...openRouter, connected: true }])).toBe('openai');
  });

  it('moves the transcription role when the chosen provider is not connected', () => {
    expect(
      activeProviderAfterConnect('openai', 'openrouter', [{ ...OPENAI_STATUS, connected: false }, { ...openRouter, connected: true }])
    ).toBe('openrouter');
  });

  it('never gives the transcription role to a provider that cannot transcribe', () => {
    expect(activeProviderAfterConnect(undefined, 'codex_cli', [{ ...codex, connected: true }])).toBeUndefined();
  });
});

describe('generateProviderInfo', () => {
  it('describes a registered provider from its status', () => {
    expect(generateProviderInfo('codex_cli', [codex])).toEqual({
      id: 'codex_cli',
      displayName: 'Codex CLI (local)',
      connected: true,
      canTranscribe: false,
      canTranslate: true,
      canSummarize: true
    });
  });

  it('keeps the id as the name and reports nothing as capable for an unknown provider', () => {
    expect(generateProviderInfo('openrouter', [])).toEqual({
      id: 'openrouter',
      displayName: 'openrouter',
      connected: false,
      canTranscribe: false,
      canTranslate: false,
      canSummarize: false
    });
  });

  it('is null when no provider is chosen', () => {
    expect(generateProviderInfo(undefined, [OPENAI_STATUS])).toBeNull();
  });
});
