import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryCredentialStore } from '../../../src/main/credentials/memory-credential-store';
import { OpenAiProvider } from '../../../src/main/ai/openai-provider';
import { OpenRouterProvider } from '../../../src/main/ai/openrouter-provider';
import { AiProviderRegistry, createDefaultAiProviderRegistry } from '../../../src/main/ai';
import { ClaudeCodeCliProvider } from '../../../src/main/ai/claude-code-cli-provider';
import { CodexCliProvider } from '../../../src/main/ai/codex-cli-provider';
import type { AiProvider } from '../../../src/main/ai/provider';
import type { AiProviderCapabilities, ProviderSummary } from '../../../src/shared/types/ai';
import { AppError } from '../../../src/shared/errors';
import { failed, fakeRunner, installedResolveDeps, missingResolveDeps, ok } from './local-cli-fakes';

function createRegistry(store = new MemoryCredentialStore()): AiProviderRegistry {
  return createDefaultAiProviderRegistry(store);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI provider registry', () => {
  it('lists OpenAI, OpenRouter, and Codex CLI with truthful capability flags', async () => {
    const providers = await createRegistry().listProviders();

    expect(providers.map((provider) => provider.id)).toEqual(['openai', 'openrouter', 'codex_cli']);
    expect(providers.find((provider) => provider.id === 'openrouter')?.capabilities).toMatchObject({
      transcription: true,
      wordTimestamps: false,
      segmentTimestamps: false,
      translation: true
    });
    expect(providers.find((provider) => provider.id === 'codex_cli')).toMatchObject({
      displayName: 'Codex CLI (local)',
      authModes: ['local_cli'],
      experimental: true,
      capabilities: { transcription: false, translation: true, subtitlePolish: true, summary: true }
    });
  });

  it('hides Claude Code (local) unless enableClaudeCode is set', async () => {
    const hidden = await createDefaultAiProviderRegistry(new MemoryCredentialStore(), { enableClaudeCode: false }).listProviders();
    const shown = await createDefaultAiProviderRegistry(new MemoryCredentialStore(), { enableClaudeCode: true }).listProviders();

    expect(hidden.map((provider) => provider.id)).not.toContain('claude_code_cli');
    expect(shown.find((provider) => provider.id === 'claude_code_cli')).toMatchObject({
      displayName: 'Claude Code (local)',
      authModes: ['local_cli'],
      experimental: true
    });
  });

  it('reports a found local CLI as connected from detection, without reading the credential store', async () => {
    const store = new MemoryCredentialStore();
    const getSpy = vi.spyOn(store, 'get');
    const registry = new AiProviderRegistry(
      [new CodexCliProvider({ runner: fakeRunner(() => ok('codex-cli 0.165.0\n')).runner, resolveDeps: installedResolveDeps('codex') })],
      store
    );

    const status = await registry.getProviderStatus('codex_cli');

    expect(status).toMatchObject({
      connected: true,
      activeAuthMode: 'local_cli',
      cliVersion: 'codex-cli 0.165.0',
      cliPath: '/opt/bin/codex',
      message: 'Codex CLI (local) found (codex-cli 0.165.0).',
      experimental: true
    });
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('reports a missing local CLI as not connected', async () => {
    const registry = new AiProviderRegistry(
      [new ClaudeCodeCliProvider({ runner: fakeRunner().runner, resolveDeps: missingResolveDeps() })],
      new MemoryCredentialStore()
    );

    await expect(registry.getProviderStatus('claude_code_cli')).resolves.toMatchObject({
      connected: false,
      activeAuthMode: undefined,
      cliVersion: undefined,
      cliPath: undefined,
      message: 'Claude Code (local) was not found on this computer.'
    });
  });

  it('connects and disconnects a local CLI without storing or deleting any credential', async () => {
    const store = new MemoryCredentialStore();
    const setSpy = vi.spyOn(store, 'set');
    const deleteSpy = vi.spyOn(store, 'delete');
    const registry = new AiProviderRegistry(
      [new CodexCliProvider({ runner: fakeRunner(() => ok('codex-cli 0.165.0')).runner, resolveDeps: installedResolveDeps('codex') })],
      store
    );

    const connected = await registry.connectProvider({ providerId: 'codex_cli', authMode: 'local_cli', secret: 'ignored' });
    const disconnected = await registry.disconnectProvider('codex_cli');

    expect(connected).toMatchObject({ connected: true, activeAuthMode: 'local_cli' });
    expect(disconnected).toMatchObject({ connected: true, activeAuthMode: 'local_cli' });
    expect(setSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('rejects local_cli auth for an API-key provider', async () => {
    await expect(
      createRegistry().connectProvider({ providerId: 'openai', authMode: 'local_cli' })
    ).rejects.toThrow('OpenAI does not support auth mode local_cli.');
  });

  it('routes text requests for a local CLI and reports its failure as an AppError', async () => {
    const registry = new AiProviderRegistry(
      [new CodexCliProvider({ runner: fakeRunner(() => failed('Not logged in')).runner, resolveDeps: installedResolveDeps('codex') })],
      new MemoryCredentialStore()
    );

    await expect(
      registry.summarizeText('codex_cli', { systemPrompt: 'Summarize.', transcript: '[0:00] Hi' })
    ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
  });

  it('connects, masks status, tests, and disconnects without exposing raw secrets', async () => {
    const registry = createRegistry();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));

    const connected = await registry.connectProvider({
      providerId: 'openai',
      authMode: 'api_key',
      secret: 'sk-test-secret-1234'
    });

    expect(connected.connected).toBe(true);
    expect(connected.activeAuthMode).toBe('api_key');
    expect(connected.maskedCredential).toBe('sk-t********1234');
    expect(JSON.stringify(connected)).not.toContain('sk-test-secret-1234');

    await expect(registry.testConnection('openai')).resolves.toMatchObject({ ok: true, providerId: 'openai' });

    const disconnected = await registry.disconnectProvider('openai');
    expect(disconnected.connected).toBe(false);
    expect(disconnected.maskedCredential).toBeUndefined();
  });

  it('reports a rejected key from testConnection with a safe message', async () => {
    const registry = createRegistry();
    await registry.connectProvider({ providerId: 'openai', authMode: 'api_key', secret: 'sk-test-secret-1234' });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: 'raw provider body that must not reach the renderer' } }, 401)
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(registry.testConnection('openai')).resolves.toMatchObject({
      ok: false,
      message: 'OpenAI rejected the API key.'
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({ method: 'GET', headers: expect.any(Headers) })
    );
  });

  it('reports not connected from testConnection without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(createRegistry().testConnection('openai')).resolves.toMatchObject({
      ok: false,
      message: 'OpenAI is not connected.'
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects Codex auth reuse without reading private auth cache files', async () => {
    await expect(
      createRegistry().connectProvider({
        providerId: 'openai',
        authMode: 'codex_auth_experimental',
        secret: 'unused'
      })
    ).rejects.toThrow('Tajtlisha will not read ~/.codex/auth.json');
  });

  it('lists OpenRouter transcription models and verifies its API key over the network', async () => {
    const registry = createRegistry();
    await registry.connectProvider({ providerId: 'openrouter', authMode: 'api_key', secret: 'sk-or-test-secret' });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(registry.listModels('openrouter', 'transcription')).resolves.toEqual([
      expect.objectContaining({ id: 'openai/whisper-large-v3', timestamps: 'none' })
    ]);
    await expect(registry.testConnection('openrouter')).resolves.toMatchObject({ ok: true, providerId: 'openrouter' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({ method: 'GET', headers: expect.any(Headers) })
    );
  });

  it('lists OpenAI transcription models with their timestamp behavior', async () => {
    const models = await createRegistry().listModels('openai', 'transcription');

    expect(models.map((model) => [model.id, model.timestamps])).toEqual([
      ['whisper-1', 'word'],
      ['gpt-transcribe', 'none'],
      ['gpt-4o-transcribe', 'none'],
      ['gpt-4o-mini-transcribe', 'none']
    ]);
  });

  it('lists text models for translation and polish', async () => {
    const registry = createRegistry();

    await expect(registry.listModels('openai', 'translation')).resolves.toEqual([
      expect.objectContaining({ id: 'gpt-4.1-mini' }),
      expect.objectContaining({ id: 'gpt-4.1' })
    ]);
    await expect(registry.listModels('openai', 'subtitlePolish')).resolves.toHaveLength(2);
  });

  it('requires a credential before running OpenAI operations', async () => {
    await expect(
      createRegistry().transcribe('openai', { audioPath: '/tmp/audio.mp3', audioFormat: 'mp3' })
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONNECTED' });
  });

  it('routes transcription to the provider and returns word timings from whisper-1', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'tajtlisha-registry-'));
    const audioPath = join(tempDir, 'audio.mp3');
    await writeFile(audioPath, 'fake mp3');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ language: 'english', text: 'Hello', words: [{ word: 'Hello', start: 0, end: 1.25 }] })
      )
    );

    try {
      const registry = createRegistry();
      await registry.connectProvider({ providerId: 'openai', authMode: 'api_key', secret: 'sk-test-secret-1234' });

      const result = await registry.transcribe('openai', { audioPath, audioFormat: 'mp3' });

      expect(result).toEqual({
        language: 'en',
        text: 'Hello',
        words: [{ text: 'Hello', startMs: 0, endMs: 1250 }]
      });
      expect(JSON.stringify(result)).not.toContain('sk-test-secret-1234');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns text only from OpenRouter transcription, with no fake whole-clip segment', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'tajtlisha-openrouter-'));
    const audioPath = join(tempDir, 'audio.mp3');
    await writeFile(audioPath, 'fake mp3');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ text: 'Hello from OpenRouter' })));

    try {
      const registry = createRegistry();
      await registry.connectProvider({ providerId: 'openrouter', authMode: 'api_key', secret: 'sk-or-test-secret' });

      const result = await registry.transcribe('openrouter', { audioPath, audioFormat: 'mp3' });

      expect(result).toEqual({ language: 'und', text: 'Hello from OpenRouter' });
      expect(result).not.toHaveProperty('segments');
      expect(result).not.toHaveProperty('words');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('routes translation and polish requests through the registry', async () => {
    const registry = createRegistry();
    await registry.connectProvider({ providerId: 'openai', authMode: 'api_key', secret: 'sk-test-secret-1234' });
    // A fresh Response per call: a Response body can only be read once.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () =>
        jsonResponse({ output_text: JSON.stringify({ items: [{ id: 'c1', text: 'Zdravo' }] }) })
      )
    );

    await expect(
      registry.translateTexts('openai', {
        items: [{ id: 'c1', text: 'Hello' }],
        sourceLanguage: 'en',
        targetLanguage: 'sr-Latn',
        maxCharsPerLine: 42,
        maxLinesPerCaption: 2
      })
    ).resolves.toEqual([{ id: 'c1', text: 'Zdravo' }]);

    await expect(
      registry.polishTexts('openai', {
        items: [{ id: 'c1', text: 'Zdravo' }],
        language: 'sr-Latn',
        mode: 'conservative',
        maxCharsPerLine: 42,
        maxLinesPerCaption: 2
      })
    ).resolves.toEqual([{ id: 'c1', text: 'Zdravo' }]);
  });

  it('refuses a capability the provider does not declare with PROVIDER_UNSUPPORTED', async () => {
    const textOnly: AiProvider = {
      id: 'openrouter',
      displayName: 'Text only',
      authModes: ['api_key'],
      capabilities: {
        detectLanguage: false,
        transcription: false,
        segmentTimestamps: false,
        wordTimestamps: false,
        translation: true,
        subtitlePolish: false,
        textToSpeech: false,
        summary: false
      } satisfies AiProviderCapabilities,
      listModels: async () => [],
      testConnection: async () => ({ ok: true, providerId: 'openrouter', checkedAt: '' }),
      transcribe: vi.fn(),
      translateTexts: vi.fn(async () => []),
      polishTexts: vi.fn(async () => []),
      summarizeText: vi.fn(async () => 'should not run')
    };
    const store = new MemoryCredentialStore();
    await store.set({ providerId: 'openrouter', authMode: 'api_key', secret: 'sk-or-test-secret' });
    const registry = new AiProviderRegistry([textOnly], store);

    await expect(registry.summarizeText('openrouter', { systemPrompt: 'p', transcript: 't' })).rejects.toMatchObject({
      code: 'PROVIDER_UNSUPPORTED'
    });
    expect(textOnly.summarizeText).not.toHaveBeenCalled();

    await expect(registry.transcribe('openrouter', { audioPath: '/tmp/a.mp3', audioFormat: 'mp3' })).rejects.toMatchObject({
      code: 'PROVIDER_UNSUPPORTED'
    });
    await expect(
      registry.polishTexts('openrouter', {
        items: [],
        language: 'en',
        mode: 'conservative',
        maxCharsPerLine: 42,
        maxLinesPerCaption: 2
      })
    ).rejects.toBeInstanceOf(AppError);
    expect(textOnly.transcribe).not.toHaveBeenCalled();
  });

  it('exposes providers through the shared summary shape only', async () => {
    const summaries: ProviderSummary[] = await createRegistry().listProviders();

    expect(summaries.every((summary) => !('listModels' in summary))).toBe(true);
    expect(new OpenAiProvider({ credentialStore: new MemoryCredentialStore() }).id).toBe('openai');
    expect(new OpenRouterProvider({ credentialStore: new MemoryCredentialStore() }).id).toBe('openrouter');
  });
});
