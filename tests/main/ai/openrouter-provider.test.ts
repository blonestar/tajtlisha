import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryCredentialStore } from '../../../src/main/credentials/memory-credential-store';
import { AiProviderRegistry } from '../../../src/main/ai';
import { OpenRouterProvider } from '../../../src/main/ai/openrouter-provider';

const SECRET = 'sk-or-test-secret-abcdef123456';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function connectedProvider(): Promise<OpenRouterProvider> {
  const credentialStore = new MemoryCredentialStore();
  await credentialStore.set({ providerId: 'openrouter', authMode: 'api_key', secret: SECRET });
  return new OpenRouterProvider({ credentialStore });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as Record<string, unknown>;
}

describe('OpenRouter summary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the system prompt and transcript as chat messages, with no reasoning parameter by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'Post.' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    const text = await (await connectedProvider()).summarizeText({ systemPrompt: 'Make a post.', transcript: '[0:01] Hi' });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(requestBody(fetchMock)).toEqual({
      model: 'openai/gpt-4.1-mini',
      messages: [
        { role: 'system', content: 'Make a post.' },
        { role: 'user', content: '[0:01] Hi' }
      ]
    });
    expect(text).toBe('Post.');
  });

  it('uses the requested model and sends the reasoning effort when given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: ' Post. ' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    const text = await (await connectedProvider()).summarizeText({
      systemPrompt: 'p',
      transcript: 't',
      modelId: 'openai/o4-mini',
      reasoningEffort: 'low'
    });

    expect(requestBody(fetchMock)).toMatchObject({ model: 'openai/o4-mini', reasoning: { effort: 'low' } });
    expect(text).toBe('Post.');
  });

  it('fails with PROVIDER_REQUEST_FAILED when the content is empty or missing', async () => {
    const provider = await connectedProvider();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: '  ' } }] })));
    await expect(provider.summarizeText({ systemPrompt: 'p', transcript: 't' })).rejects.toMatchObject({
      code: 'PROVIDER_REQUEST_FAILED'
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ choices: [] })));
    await expect(provider.summarizeText({ systemPrompt: 'p', transcript: 't' })).rejects.toThrow(
      'OpenRouter returned an empty summary.'
    );
  });

  it('lists live text models for summary with the summary capability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 mini', architecture: { output_modalities: ['text'] } },
            { id: 'openai/whisper-large-v3', name: 'Whisper', architecture: { output_modalities: ['text'] } },
            { id: 'black-forest/flux', name: 'Flux', architecture: { output_modalities: ['image'] } }
          ]
        })
      )
    );

    const models = await (await connectedProvider()).listModels('summary');

    expect(models).toEqual([
      { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 mini (openai/gpt-4.1-mini)', capability: 'summary' },
      { id: 'openai/whisper-large-v3', label: 'Whisper (openai/whisper-large-v3)', capability: 'summary' }
    ]);
  });

  it('is reachable through the registry because the provider declares the summary capability', async () => {
    const credentialStore = new MemoryCredentialStore();
    await credentialStore.set({ providerId: 'openrouter', authMode: 'api_key', secret: SECRET });
    const registry = new AiProviderRegistry([new OpenRouterProvider({ credentialStore })], credentialStore);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'Routed.' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(registry.summarizeText('openrouter', { systemPrompt: 'p', transcript: 't' })).resolves.toBe('Routed.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
