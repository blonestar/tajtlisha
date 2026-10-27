import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/shared/errors';
import { MemoryCredentialStore } from '../../../src/main/credentials/memory-credential-store';
import {
  buildOpenAiTranscriptionForm,
  OpenAiProvider,
  parseOpenAiTranscription
} from '../../../src/main/ai/openai-provider';
import { parseCaptionItems } from '../../../src/main/ai/text-prompts';

const SECRET = 'sk-proj-test-secret-abcdef123456';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function connectedProvider(): Promise<OpenAiProvider> {
  const credentialStore = new MemoryCredentialStore();
  await credentialStore.set({ providerId: 'openai', authMode: 'api_key', secret: SECRET });
  return new OpenAiProvider({ credentialStore });
}

function blob(): Blob {
  return new Blob(['fake mp3'], { type: 'audio/mpeg' });
}

describe('OpenAI transcription request building', () => {
  it('sends verbose_json with word and segment granularities for whisper-1', () => {
    const form = buildOpenAiTranscriptionForm({ modelId: 'whisper-1', audio: blob(), fileName: 'audio.mp3' });

    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.getAll('timestamp_granularities[]')).toEqual(['word', 'segment']);
    expect(form.get('file')).toBeInstanceOf(File);
  });

  it('sends plain json and no granularities for gpt-transcribe and the 4o transcribe models', () => {
    for (const modelId of ['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe']) {
      const form = buildOpenAiTranscriptionForm({ modelId, audio: blob(), fileName: 'audio.mp3' });

      expect(form.get('response_format')).toBe('json');
      expect(form.getAll('timestamp_granularities[]')).toEqual([]);
    }
  });

  it('sends language only when provided, using the ISO base code for script variants', () => {
    expect(buildOpenAiTranscriptionForm({ modelId: 'whisper-1', audio: blob(), fileName: 'a.mp3' }).has('language')).toBe(false);
    expect(
      buildOpenAiTranscriptionForm({ modelId: 'whisper-1', language: 'sr-Latn', audio: blob(), fileName: 'a.mp3' }).get('language')
    ).toBe('sr');
    expect(
      buildOpenAiTranscriptionForm({ modelId: 'whisper-1', language: 'und', audio: blob(), fileName: 'a.mp3' }).has('language')
    ).toBe(false);
  });

  it('parses verbose_json words and segments into millisecond timings and maps the language name', () => {
    const result = parseOpenAiTranscription(
      {
        language: 'english',
        text: ' Hello there. ',
        words: [
          { word: 'Hello', start: 0.1, end: 0.5 },
          { word: ' there.', start: 0.6, end: 1.2 },
          { word: '  ', start: 1.3, end: 1.4 }
        ],
        segments: [{ start: 0.1, end: 1.2, text: 'Hello there.' }]
      },
      { modelId: 'whisper-1' }
    );

    expect(result).toEqual({
      language: 'en',
      text: 'Hello there.',
      words: [
        { text: 'Hello', startMs: 100, endMs: 500 },
        { text: 'there.', startMs: 600, endMs: 1200 }
      ],
      segments: [{ text: 'Hello there.', startMs: 100, endMs: 1200 }]
    });
  });

  it('returns text only for json models and prefers the requested language', () => {
    const result = parseOpenAiTranscription({ text: 'Zdravo svete' }, { modelId: 'gpt-transcribe', requestedLanguage: 'sr-Latn' });

    expect(result).toEqual({ language: 'sr-Latn', text: 'Zdravo svete' });
    expect(result).not.toHaveProperty('words');
    expect(result).not.toHaveProperty('segments');
  });

  it('falls back to und when neither the request nor the response names a language', () => {
    expect(parseOpenAiTranscription({ text: 'hi' }, { modelId: 'gpt-transcribe' }).language).toBe('und');
  });

  it('maps Asian languages detected by Whisper to ISO codes', () => {
    const detected = (name: string): string =>
      parseOpenAiTranscription({ language: name, text: 'x' }, { modelId: 'whisper-1' }).language;

    expect(detected('indonesian')).toBe('id');
    expect(detected('Japanese')).toBe('ja');
    expect(detected('chinese')).toBe('zh');
    expect(detected('korean')).toBe('ko');
    expect(detected('thai')).toBe('th');
    expect(detected('hindi')).toBe('hi');
    expect(detected('malay')).toBe('ms');
    expect(detected('javanese')).toBe('jv');
    expect(detected('serbian')).toBe('sr-Latn');
    expect(detected('klingon')).toBe('und');
  });
});

describe('OpenAI provider requests', () => {
  let tempDir: string;
  let audioPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'tajtlisha-openai-test-'));
    audioPath = join(tempDir, 'audio.mp3');
    await writeFile(audioPath, 'fake mp3');
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('posts multipart audio with whisper-1 by default and returns word timings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ language: 'english', text: 'Hi', words: [{ word: 'Hi', start: 0, end: 0.4 }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = await connectedProvider();
    const result = await provider.transcribe({ audioPath, audioFormat: 'mp3' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('model')).toBe('whisper-1');
    expect(result.words).toEqual([{ text: 'Hi', startMs: 0, endMs: 400 }]);
  });

  it('passes the abort signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ text: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await (await connectedProvider()).transcribe({ audioPath, audioFormat: 'mp3', modelId: 'gpt-transcribe', signal: controller.signal });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].signal).toBe(controller.signal);
  });

  it('sends the Responses API request with store false and the caption JSON schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ output_text: JSON.stringify({ items: [{ id: 'c1', text: 'Zdravo' }] }) })
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = await connectedProvider();
    const items = await provider.translateTexts({
      items: [{ id: 'c1', text: 'Hello' }],
      sourceLanguage: 'en',
      targetLanguage: 'sr-Latn',
      maxCharsPerLine: 42,
      maxLinesPerCaption: 2
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      model: string;
      store: boolean;
      input: Array<{ role: string; content: string }>;
      text: { format: { type: string; name: string; strict: boolean; schema: { required: string[] } } };
    };
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(body.model).toBe('gpt-4.1-mini');
    expect(body.store).toBe(false);
    expect(body.input[0].content).toContain('Serbian (Latin script)');
    expect(body.input[0].content).toContain('at most 2 lines of about 42 characters');
    expect(body.input[1].content).toBe(JSON.stringify({ items: [{ id: 'c1', text: 'Hello' }] }));
    expect(body.text.format).toMatchObject({ type: 'json_schema', name: 'caption_items', strict: true });
    expect(body.text.format.schema.required).toEqual(['items']);
    expect(items).toEqual([{ id: 'c1', text: 'Zdravo' }]);
  });

  it('uses the requested polish model and mode in the polish instructions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ output_text: JSON.stringify({ items: [] }) }));
    vi.stubGlobal('fetch', fetchMock);

    await (await connectedProvider()).polishTexts({
      items: [],
      language: 'sr-Cyrl',
      mode: 'social_caption',
      modelId: 'gpt-4.1',
      maxCharsPerLine: 30,
      maxLinesPerCaption: 1
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
      model: string;
      input: Array<{ content: string }>;
    };
    expect(body.model).toBe('gpt-4.1');
    expect(body.input[0].content).toContain('Serbian (Cyrillic script)');
    expect(body.input[0].content).toContain('punchy');
    expect(body.input[0].content).toContain('on one line');
  });

  it('fails with PROVIDER_NOT_CONNECTED before any request when no key is stored', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiProvider({ credentialStore: new MemoryCredentialStore() });

    await expect(provider.transcribe({ audioPath, audioFormat: 'mp3' })).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONNECTED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('OpenAI error mapping', () => {
  let tempDir: string;
  let audioPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'tajtlisha-openai-errors-'));
    audioPath = join(tempDir, 'audio.mp3');
    await writeFile(audioPath, 'fake mp3');
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(tempDir, { recursive: true, force: true });
  });

  async function failWith(response: Response): Promise<AppError> {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const provider = await connectedProvider();
    try {
      await provider.transcribe({ audioPath, audioFormat: 'mp3', modelId: 'gpt-transcribe' });
    } catch (error) {
      return error as AppError;
    }
    throw new Error('expected transcribe to fail');
  }

  it('maps 401 and 403 to PROVIDER_AUTH_FAILED', async () => {
    for (const status of [401, 403]) {
      const error = await failWith(jsonResponse({ error: { message: `Incorrect API key provided: ${SECRET}` } }, status));
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('PROVIDER_AUTH_FAILED');
      expect(error.message).not.toContain(SECRET);
    }
  });

  it('maps 429 to PROVIDER_RATE_LIMITED', async () => {
    expect((await failWith(jsonResponse({ error: { message: 'quota' } }, 429))).code).toBe('PROVIDER_RATE_LIMITED');
  });

  it('maps 413 to AUDIO_TOO_LARGE', async () => {
    expect((await failWith(new Response('', { status: 413 }))).code).toBe('AUDIO_TOO_LARGE');
  });

  it('maps other statuses to PROVIDER_REQUEST_FAILED with the status and the API message', async () => {
    const error = await failWith(jsonResponse({ error: { message: 'Invalid file format.' } }, 400));

    expect(error.code).toBe('PROVIDER_REQUEST_FAILED');
    expect(error.message).toContain('HTTP 400');
    expect(error.message).toContain('Invalid file format.');
  });

  it('scrubs the API key and key-like strings from API error messages', async () => {
    const error = await failWith(
      jsonResponse({ error: { message: `Upstream echoed ${SECRET} and sk-another-key-9999` } }, 500)
    );

    expect(error.code).toBe('PROVIDER_REQUEST_FAILED');
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain('sk-another-key-9999');
    expect(error.message).toContain('[redacted]');
  });

  it('does not expose a raw non-JSON error body', async () => {
    const error = await failWith(new Response('<html>secret html body</html>', { status: 502 }));

    expect(error.code).toBe('PROVIDER_REQUEST_FAILED');
    expect(error.detail).toBe('OpenAI request failed (HTTP 502).');
    expect(error.message).not.toContain('secret html body');
  });

  it('maps a network failure to PROVIDER_REQUEST_FAILED without leaking the key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError(`fetch failed ${SECRET}`)));
    const provider = await connectedProvider();

    const attempt = provider.transcribe({ audioPath, audioFormat: 'mp3', modelId: 'gpt-transcribe' });

    await expect(attempt).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
    await expect(attempt).rejects.toThrow('Unable to reach OpenAI');
    await expect(attempt).rejects.not.toThrow(SECRET);
  });

  it('maps an aborted request to JOB_CANCELED', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
      })
    );
    const provider = await connectedProvider();

    await expect(
      provider.transcribe({ audioPath, audioFormat: 'mp3', modelId: 'gpt-transcribe', signal: controller.signal })
    ).rejects.toMatchObject({ code: 'JOB_CANCELED' });
  });
});

describe('caption item parsing', () => {
  it('keeps well-formed items and drops malformed ones', () => {
    expect(
      parseCaptionItems(
        JSON.stringify({ items: [{ id: 'a', text: 'Yes' }, { id: 7, text: 'bad' }, { id: 'b' }, { id: 'c', text: '' }] }),
        'OpenAI'
      )
    ).toEqual([
      { id: 'a', text: 'Yes' },
      { id: 'c', text: '' }
    ]);
  });

  it('accepts a fenced JSON response', () => {
    expect(parseCaptionItems('```json\n{"items":[{"id":"a","text":"Da"}]}\n```', 'OpenRouter')).toEqual([{ id: 'a', text: 'Da' }]);
  });

  it('rejects responses without an items array', () => {
    expect(() => parseCaptionItems('{"segments":[]}', 'OpenAI')).toThrow('OpenAI returned an invalid caption response.');
    expect(() => parseCaptionItems('not json', 'OpenAI')).toThrow(AppError);
  });
});

describe('OpenAI summary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Body of the most recent fetch call. */
  function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    return JSON.parse(String(calls[calls.length - 1][1].body)) as Record<string, unknown>;
  }

  it('sends the system prompt as instructions and the transcript as plain input, with no text format', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ output_text: 'Short post.' }));
    vi.stubGlobal('fetch', fetchMock);

    const text = await (await connectedProvider()).summarizeText({
      systemPrompt: 'Summarize for a tweet.',
      transcript: '[0:01] Hello'
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('https://api.openai.com/v1/responses');
    expect(requestBody(fetchMock)).toEqual({
      model: 'gpt-4.1-mini',
      store: false,
      instructions: 'Summarize for a tweet.',
      input: '[0:01] Hello'
    });
    expect(text).toBe('Short post.');
  });

  it('uses the requested model and sends reasoning only when an effort is given', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ output_text: 'Post.' }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = await connectedProvider();

    await provider.summarizeText({ systemPrompt: 'p', transcript: 't', modelId: 'gpt-4.1', reasoningEffort: 'high' });
    expect(requestBody(fetchMock)).toMatchObject({ model: 'gpt-4.1', reasoning: { effort: 'high' } });

    await provider.summarizeText({ systemPrompt: 'p', transcript: 't', reasoningEffort: 'none' });
    expect(requestBody(fetchMock)).toMatchObject({ reasoning: { effort: 'none' } });

    await provider.summarizeText({ systemPrompt: 'p', transcript: 't' });
    expect(requestBody(fetchMock)).not.toHaveProperty('reasoning');
  });

  it('reads the message text that follows a reasoning item and ignores reasoning text parts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          output: [
            { type: 'reasoning', id: 'rs_1', summary: [] },
            { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'thinking' }] },
            { type: 'message', content: [{ type: 'output_text', text: '  Post text  ' }] }
          ]
        })
      )
    );

    await expect((await connectedProvider()).summarizeText({ systemPrompt: 'p', transcript: 't' })).resolves.toBe('Post text');
  });

  it('fails with PROVIDER_REQUEST_FAILED when the message text is blank', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          output: [
            { type: 'reasoning', summary: [] },
            { type: 'message', content: [{ type: 'output_text', text: '   ' }] }
          ]
        })
      )
    );

    await expect((await connectedProvider()).summarizeText({ systemPrompt: 'p', transcript: 't' })).rejects.toMatchObject({
      code: 'PROVIDER_REQUEST_FAILED',
      message: '[PROVIDER_REQUEST_FAILED] OpenAI returned an empty summary.'
    });
  });

  it('fails with the same error when the response has only a reasoning item', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ output: [{ type: 'reasoning', summary: [] }] })));

    await expect((await connectedProvider()).summarizeText({ systemPrompt: 'p', transcript: 't' })).rejects.toThrow(
      'OpenAI returned an empty summary.'
    );
  });

  it('lists live chat models for summary, drops non-text models, and sorts the ids', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'gpt-4o' },
          { id: 'whisper-1' },
          { id: 'gpt-4o-transcribe' },
          { id: 'text-embedding-3-small' },
          { id: 'o3-mini' },
          { id: 'gpt-4o-audio-preview' },
          { id: 'gpt-4o-realtime-preview' },
          { id: 'dall-e-3' },
          { id: 'tts-1' },
          { id: 'omni-moderation-latest' },
          { id: 'gpt-3.5-turbo-instruct' },
          { id: 'gpt-4.1-mini' },
          { id: 42 }
        ]
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const models = await (await connectedProvider()).listModels('summary');

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe('https://api.openai.com/v1/models');
    expect(models).toEqual([
      { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini', capability: 'summary' },
      { id: 'gpt-4o', label: 'gpt-4o', capability: 'summary' },
      { id: 'o3-mini', label: 'o3-mini', capability: 'summary' }
    ]);
  });

  it('falls back to the static summary models when the live list fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect((await connectedProvider()).listModels('summary')).resolves.toEqual([
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', capability: 'summary', available: true },
      { id: 'gpt-4.1', label: 'GPT-4.1', capability: 'summary', available: true }
    ]);
  });

  it('falls back to the static summary models on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'server error' } }, 500)));

    const models = await (await connectedProvider()).listModels('summary');
    expect(models.map((model) => model.id)).toEqual(['gpt-4.1-mini', 'gpt-4.1']);
  });

  it('returns the static summary models without a network call when no key is stored', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiProvider({ credentialStore: new MemoryCredentialStore() });

    await expect(provider.listModels('summary')).resolves.toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
