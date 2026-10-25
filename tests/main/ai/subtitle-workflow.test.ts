import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/shared/errors';
import type { TranscribeClipRequest, TranslateCaptionsRequest, JobStage, SummarizeTranscriptRequest } from '../../../src/shared/types/jobs';
import type { AiProviderRegistry } from '../../../src/main/ai/provider-registry';
import type { ProviderPolishRequest, ProviderSummarizeRequest, ProviderTextItem, ProviderTranscribeRequest, ProviderTranscribeResult, ProviderTranslateRequest } from '../../../src/main/ai/provider';
import { MAX_AUDIO_BYTES, SubtitleWorkflowService, TRANSLATION_BATCH_SIZE, type WorkflowProgress } from '../../../src/main/ai/subtitle-workflow';
import type { MediaService, MediaRunOptions } from '../../../src/main/media/media-service';
import type { AudioExtractRequest, AudioExtractResult } from '../../../src/shared/types/media';
import type { FfmpegService } from '../../../src/main/ffmpeg';

const SILENCE_STDERR = `Duration: 00:00:04.00, start: 0
[silencedetect @ 0x1] silence_start: 1
[silencedetect @ 0x1] silence_end: 1.5 | silence_duration: 0.5`;

type Registry = Pick<AiProviderRegistry, 'transcribe' | 'translateTexts' | 'polishTexts' | 'summarizeText'>;

function createRequest(overrides: Partial<TranscribeClipRequest> = {}): TranscribeClipRequest {
  return {
    jobId: 'job-1',
    inputPath: '/clips/source.mp4',
    trim: { startMs: 1000, endMs: 5000 },
    providerId: 'openai',
    maxCharsPerLine: 42,
    maxLinesPerCaption: 2,
    ...overrides
  };
}

/** Fake media service: writes `bytes` of audio to the requested output path, or throws `error`. */
function fakeMedia(options: { bytes?: number; error?: Error; progressOutMs?: number[] } = {}) {
  const extractAudio = vi.fn(async (input: AudioExtractRequest, runOptions?: MediaRunOptions): Promise<AudioExtractResult> => {
    for (const outTimeMs of options.progressOutMs ?? []) {
      runOptions?.onProgress?.(outTimeMs);
    }
    if (options.error) throw options.error;
    await writeFile(input.outputPath, Buffer.alloc(options.bytes ?? 2048));
    return { outputPath: input.outputPath, format: input.format };
  });

  return { extractAudio, service: { extractAudio } as unknown as Pick<MediaService, 'extractAudio'> };
}

function fakeFfmpeg(stderr = SILENCE_STDERR) {
  const run = vi.fn(async () => ({ stdout: '', stderr }));
  return { run, service: { run } as unknown as Pick<FfmpegService, 'run'> };
}

function fakeRegistry(overrides: Partial<Registry> = {}): Registry & {
  transcribe: ReturnType<typeof vi.fn>;
  translateTexts: ReturnType<typeof vi.fn>;
  polishTexts: ReturnType<typeof vi.fn>;
  summarizeText: ReturnType<typeof vi.fn>;
} {
  return {
    transcribe: vi.fn(async (_providerId: string, _request: ProviderTranscribeRequest): Promise<ProviderTranscribeResult> => ({
      language: 'en',
      text: 'Hello world.'
    })),
    translateTexts: vi.fn(async (_providerId: string, request: ProviderTranslateRequest) =>
      request.items.map((item) => ({ id: item.id, text: item.text.toUpperCase() }))
    ),
    polishTexts: vi.fn(async (_providerId: string, request: ProviderPolishRequest) => request.items),
    summarizeText: vi.fn(async (_providerId: string, _request: ProviderSummarizeRequest) => 'Summary.'),
    ...overrides
  } as never;
}

function createService(options: {
  registry?: Registry;
  media?: ReturnType<typeof fakeMedia>;
  ffmpeg?: ReturnType<typeof fakeFfmpeg>;
} = {}) {
  const media = options.media ?? fakeMedia();
  const ffmpeg = options.ffmpeg ?? fakeFfmpeg();
  const registry = options.registry ?? fakeRegistry();
  return {
    media,
    ffmpeg,
    registry,
    service: new SubtitleWorkflowService(registry, media.service, ffmpeg.service)
  };
}

async function captureProgress(): Promise<{ events: WorkflowProgress[]; onProgress: (event: WorkflowProgress) => void }> {
  const events: WorkflowProgress[] = [];
  return { events, onProgress: (event) => events.push(event) };
}

function stagesOf(events: WorkflowProgress[]): JobStage[] {
  return events.map((event) => event.stage).filter((stage, index, all) => all.indexOf(stage) === index);
}

describe('SubtitleWorkflowService.transcribe', () => {
  it('extracts the trimmed range, uses word timing, and offsets captions into source time', async () => {
    const media = fakeMedia();
    const registry = fakeRegistry({
      transcribe: vi.fn(async () => ({
        language: 'en',
        text: 'Hello world.',
        words: [
          { text: 'Hello', startMs: 0, endMs: 400 },
          { text: 'world.', startMs: 500, endMs: 900 }
        ]
      }))
    } as never);
    const { service } = createService({ media, registry });

    const result = await service.transcribe(createRequest());

    expect(media.extractAudio).toHaveBeenCalledWith(
      expect.objectContaining({ inputPath: '/clips/source.mp4', format: 'mp3', startMs: 1000, endMs: 5000 }),
      expect.any(Object)
    );
    expect(result.timingSource).toBe('word');
    expect(result.language).toBe('en');
    expect(result.captions).toHaveLength(1);
    expect(result.captions[0]).toMatchObject({ startMs: 1000, endMs: 1900, original: 'Hello world.', translation: '' });
    expect(result.captions[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('sends the mp3 path, format, and language to the provider', async () => {
    const registry = fakeRegistry({
      transcribe: vi.fn(async () => ({ language: 'sr-Latn', text: 'Zdravo', segments: [{ text: 'Zdravo', startMs: 0, endMs: 800 }] }))
    } as never);
    const { service } = createService({ registry });

    await service.transcribe(createRequest({ modelId: 'gpt-transcribe', language: 'sr-Latn' }));

    expect(registry.transcribe).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({ audioFormat: 'mp3', modelId: 'gpt-transcribe', language: 'sr-Latn', audioPath: expect.stringMatching(/audio\.mp3$/) })
    );
  });

  it('converts Cyrillic transcription text to Latin when the language is sr-Latn', async () => {
    const registry = fakeRegistry({
      transcribe: vi.fn(async () => ({
        language: 'sr-Latn',
        text: 'Љубав и џем.',
        words: [
          { text: 'Љубав', startMs: 0, endMs: 400 },
          { text: 'и', startMs: 450, endMs: 500 },
          { text: 'џем.', startMs: 550, endMs: 900 }
        ]
      }))
    } as never);
    const { service } = createService({ registry });

    const result = await service.transcribe(createRequest({ language: 'sr-Latn' }));

    expect(result.captions[0].original).toBe('Ljubav i džem.');
  });

  it('labels an undetected Serbian Cyrillic transcript as sr-Latn and converts it', async () => {
    const registry = fakeRegistry({
      transcribe: vi.fn(async () => ({ language: 'und', text: 'Ово је кућа.', segments: [{ text: 'Ово је кућа.', startMs: 0, endMs: 800 }] }))
    } as never);
    const { service } = createService({ registry });

    const result = await service.transcribe(createRequest());

    expect(result.language).toBe('sr-Latn');
    expect(result.captions[0].original).toBe('Ovo je kuća.');
  });

  it('leaves an undetected Cyrillic transcript without Serbian-only letters unchanged', async () => {
    const registry = fakeRegistry({
      transcribe: vi.fn(async () => ({ language: 'und', text: 'Привет, мир.', segments: [{ text: 'Привет, мир.', startMs: 0, endMs: 800 }] }))
    } as never);
    const { service } = createService({ registry });

    const result = await service.transcribe(createRequest());

    expect(result.language).toBe('und');
    expect(result.captions[0].original).toBe('Привет, мир.');
  });

  it('keeps Cyrillic transcription text when the language is sr-Cyrl', async () => {
    const registry = fakeRegistry({
      transcribe: vi.fn(async () => ({ language: 'sr-Cyrl', text: 'Здраво', segments: [{ text: 'Здраво', startMs: 0, endMs: 800 }] }))
    } as never);
    const { service } = createService({ registry });

    const result = await service.transcribe(createRequest({ language: 'sr-Cyrl' }));

    expect(result.captions[0].original).toBe('Здраво');
  });

  it('falls back to segment timing when the provider returns no words', async () => {
    const registry = fakeRegistry({
      transcribe: vi.fn(async () => ({
        language: 'en',
        text: 'Hello there',
        segments: [{ text: 'Hello there', startMs: 0, endMs: 1200 }]
      }))
    } as never);
    const { service } = createService({ registry });

    const result = await service.transcribe(createRequest());

    expect(result.timingSource).toBe('segment');
    expect(result.captions).toEqual([expect.objectContaining({ startMs: 1000, endMs: 2200, original: 'Hello there' })]);
  });

  it('uses speech detection when the provider returns text only, placing text inside speech regions', async () => {
    const ffmpeg = fakeFfmpeg();
    const { service } = createService({ ffmpeg });
    const progress = await captureProgress();

    const result = await service.transcribe(createRequest({ trim: { startMs: 1000, endMs: 5000 } }), progress);

    expect(ffmpeg.run).toHaveBeenCalledWith(expect.arrayContaining(['silencedetect=noise=-35dB:d=0.35']), expect.any(Object));
    expect(result.timingSource).toBe('speech_detection');
    expect(result.captions).toHaveLength(1);
    expect(result.captions[0].original).toBe('Hello world.');
    // Speech is [0,1000] and [1500,4000] in clip time; this caption falls in the second region.
    expect(result.captions[0].startMs).toBeGreaterThanOrEqual(2500);
    expect(result.captions[0].endMs).toBeLessThanOrEqual(5000);
    expect(stagesOf(progress.events)).toEqual(['extracting_audio', 'transcribing', 'detecting_speech']);
  });

  it('fails with NO_SPEECH when the provider text is blank', async () => {
    const registry = fakeRegistry({ transcribe: vi.fn(async () => ({ language: 'en', text: '   ' })) } as never);
    const { service } = createService({ registry });

    await expect(service.transcribe(createRequest())).rejects.toMatchObject({ code: 'NO_SPEECH' });
  });

  it('fails with NO_SPEECH when speech detection finds no speech', async () => {
    const registry = fakeRegistry({ transcribe: vi.fn(async () => ({ language: 'en', text: 'Hallucinated text' })) } as never);
    const { service } = createService({ registry, ffmpeg: fakeFfmpeg('Duration: 00:00:04.00, start: 0\n[silencedetect @ 0x1] silence_start: 0\n[silencedetect @ 0x1] silence_end: 4 | silence_duration: 4') });

    await expect(service.transcribe(createRequest())).rejects.toMatchObject({ code: 'NO_SPEECH' });
  });

  it('maps an input with no audio stream to NO_AUDIO', async () => {
    const media = fakeMedia({
      error: new AppError('FFMPEG_FAILED', 'ffmpeg exited with code 1: Output file #0 does not contain any stream')
    });
    const { service, registry } = createService({ media });

    await expect(service.transcribe(createRequest())).rejects.toMatchObject({ code: 'NO_AUDIO' });
    expect(registry.transcribe).not.toHaveBeenCalled();
  });

  it('passes other ffmpeg failures through unchanged', async () => {
    const media = fakeMedia({ error: new AppError('FFMPEG_FAILED', 'ffmpeg exited with code 1: Invalid data') });
    const { service } = createService({ media });

    await expect(service.transcribe(createRequest())).rejects.toMatchObject({ code: 'FFMPEG_FAILED' });
  });

  it('rejects an invalid trim before extracting audio', async () => {
    const media = fakeMedia();
    const { service } = createService({ media });

    await expect(service.transcribe(createRequest({ trim: { startMs: 2000, endMs: 2000 } }))).rejects.toMatchObject({ code: 'INVALID_TRIM' });
    expect(media.extractAudio).not.toHaveBeenCalled();
  });

  it('rejects audio over the upload limit before calling the provider', async () => {
    const media = fakeMedia({ bytes: MAX_AUDIO_BYTES + 1 });
    const { service, registry } = createService({ media });

    await expect(service.transcribe(createRequest())).rejects.toMatchObject({ code: 'AUDIO_TOO_LARGE' });
    expect(registry.transcribe).not.toHaveBeenCalled();
  });

  it('deletes the temporary audio when the job is canceled mid-transcription', async () => {
    const controller = new AbortController();
    const media = fakeMedia();
    const registry = fakeRegistry({
      transcribe: vi.fn(async (_providerId: string, request: ProviderTranscribeRequest) => {
        controller.abort();
        expect(request.signal).toBe(controller.signal);
        throw new AppError('JOB_CANCELED');
      })
    } as never);
    const { service } = createService({ media, registry });

    await expect(service.transcribe(createRequest(), { signal: controller.signal })).rejects.toMatchObject({ code: 'JOB_CANCELED' });

    const audioPath = (registry.transcribe.mock.calls[0] as [string, ProviderTranscribeRequest])[1].audioPath;
    await expect(stat(audioPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(dirname(audioPath))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not start work when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const media = fakeMedia();
    const { service } = createService({ media });

    await expect(service.transcribe(createRequest(), { signal: controller.signal })).rejects.toMatchObject({ code: 'JOB_CANCELED' });
    expect(media.extractAudio).not.toHaveBeenCalled();
  });

  it('removes the temporary audio after a successful run', async () => {
    const registry = fakeRegistry();
    const { service } = createService({ registry });

    await service.transcribe(createRequest());

    const audioPath = (registry.transcribe.mock.calls[0] as [string, ProviderTranscribeRequest])[1].audioPath;
    await expect(stat(audioPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reports extraction progress as a fraction of the clip and emits stages in order', async () => {
    const media = fakeMedia({ progressOutMs: [2000] });
    const { service } = createService({ media });
    const progress = await captureProgress();

    await service.transcribe(createRequest(), progress);

    expect(progress.events).toContainEqual({ stage: 'extracting_audio', progress: 0.5 });
    // The default fake provider returns text only, so timing comes from speech detection.
    expect(stagesOf(progress.events)).toEqual(['extracting_audio', 'transcribing', 'detecting_speech']);
  });

  it('clamps caption times inside the trimmed range', async () => {
    // A 9 s segment runs past the 4 s trim. Its captions must stay within 1000..5000.
    const registry = fakeRegistry({
      transcribe: vi.fn(async () => ({
        language: 'en',
        text: 'Long segment',
        segments: [{ text: 'Long segment', startMs: 0, endMs: 9000 }]
      }))
    } as never);
    const { service } = createService({ registry });

    const result = await service.transcribe(createRequest({ trim: { startMs: 1000, endMs: 5000 } }));

    expect(result.captions.length).toBeGreaterThan(0);
    expect(result.captions[0].startMs).toBe(1000);
    expect(result.captions[result.captions.length - 1].endMs).toBe(5000);
    for (const caption of result.captions) {
      expect(caption.startMs).toBeGreaterThanOrEqual(1000);
      expect(caption.endMs).toBeLessThanOrEqual(5000);
    }
  });
});

function translateRequest(overrides: Partial<TranslateCaptionsRequest> = {}): TranslateCaptionsRequest {
  return {
    jobId: 'job-2',
    providerId: 'openai',
    sourceLanguage: 'en',
    targetLanguage: 'sr-Latn',
    captions: [
      { id: 'a', text: 'hello' },
      { id: 'b', text: 'world' }
    ],
    polish: 'none',
    maxCharsPerLine: 42,
    maxLinesPerCaption: 2,
    ...overrides
  };
}

function numbered(count: number): ProviderTextItem[] {
  return Array.from({ length: count }, (_, index) => ({ id: `id-${index}`, text: `text ${index}` }));
}

describe('SubtitleWorkflowService.translate', () => {
  it('translates in batches of 40 and returns translations in request order', async () => {
    const registry = fakeRegistry();
    const { service } = createService({ registry });
    const captions = numbered(85);
    const progress = await captureProgress();

    const result = await service.translate(translateRequest({ captions }), progress);

    expect(registry.translateTexts.mock.calls.map(([, request]) => (request as ProviderTranslateRequest).items.length)).toEqual([
      TRANSLATION_BATCH_SIZE,
      TRANSLATION_BATCH_SIZE,
      5
    ]);
    expect(result.translations.map((item) => item.id)).toEqual(captions.map((item) => item.id));
    expect(result.translations[84].text).toBe('TEXT 84');
    expect(progress.events.filter((event) => event.stage === 'translating').at(-1)).toEqual({ stage: 'translating', progress: 1 });
  });

  it('converts Cyrillic output to Latin for an sr-Latn target, also after polish', async () => {
    const registry = fakeRegistry({
      translateTexts: vi.fn(async (_providerId: string, request: ProviderTranslateRequest) =>
        request.items.map((item) => ({ id: item.id, text: 'Здраво свете' }))
      ),
      polishTexts: vi.fn(async (_providerId: string, request: ProviderPolishRequest) =>
        request.items.map((item) => ({ id: item.id, text: 'ЊУШКА' }))
      )
    } as never);
    const { service } = createService({ registry });

    const plain = await service.translate(translateRequest({ targetLanguage: 'sr-Latn' }));
    const polished = await service.translate(translateRequest({ targetLanguage: 'sr-Latn', polish: 'conservative' }));

    expect(plain.translations.map((item) => item.text)).toEqual(['Zdravo svete', 'Zdravo svete']);
    expect(polished.translations.map((item) => item.text)).toEqual(['NJUŠKA', 'NJUŠKA']);
  });

  it('leaves Cyrillic output as is for an sr-Cyrl target', async () => {
    const registry = fakeRegistry({
      translateTexts: vi.fn(async (_providerId: string, request: ProviderTranslateRequest) =>
        request.items.map((item) => ({ id: item.id, text: 'Здраво' }))
      )
    } as never);
    const { service } = createService({ registry });

    const result = await service.translate(translateRequest({ targetLanguage: 'sr-Cyrl' }));

    expect(result.translations.map((item) => item.text)).toEqual(['Здраво', 'Здраво']);
  });

  it('retries once for only the missing ids', async () => {
    let calls = 0;
    const registry = fakeRegistry({
      translateTexts: vi.fn(async (_providerId: string, request: ProviderTranslateRequest) => {
        calls += 1;
        return request.items.filter((item) => item.id !== 'b' || calls > 1).map((item) => ({ id: item.id, text: `T-${item.text}` }));
      })
    } as never);
    const { service } = createService({ registry });

    const result = await service.translate(translateRequest());

    expect(registry.translateTexts).toHaveBeenCalledTimes(2);
    expect((registry.translateTexts.mock.calls[1] as [string, ProviderTranslateRequest])[1].items.map((item) => item.id)).toEqual(['b']);
    expect(result.translations).toEqual([
      { id: 'a', text: 'T-hello' },
      { id: 'b', text: 'T-world' }
    ]);
  });

  it('fails with TRANSLATION_INCOMPLETE and lists the ids instead of using source text', async () => {
    const registry = fakeRegistry({
      translateTexts: vi.fn(async (_providerId: string, request: ProviderTranslateRequest) =>
        request.items.filter((item) => item.id !== 'b').map((item) => ({ id: item.id, text: 'Translated' }))
      )
    } as never);
    const { service } = createService({ registry });

    const error = await service.translate(translateRequest()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('TRANSLATION_INCOMPLETE');
    expect((error as AppError).message).toContain('b');
    expect((error as AppError).message).not.toContain('hello');
    expect(registry.translateTexts).toHaveBeenCalledTimes(2);
  });

  it('treats blank translated text as missing', async () => {
    const registry = fakeRegistry({
      translateTexts: vi.fn(async (_providerId: string, request: ProviderTranslateRequest) =>
        request.items.map((item) => ({ id: item.id, text: item.id === 'a' ? '   ' : 'Ok' }))
      )
    } as never);
    const { service } = createService({ registry });

    await expect(service.translate(translateRequest())).rejects.toMatchObject({ code: 'TRANSLATION_INCOMPLETE' });
  });

  it('ignores ids the provider invents', async () => {
    const registry = fakeRegistry({
      translateTexts: vi.fn(async (_providerId: string, request: ProviderTranslateRequest) => [
        ...request.items.map((item) => ({ id: item.id, text: 'Ok' })),
        { id: 'invented', text: 'Extra' }
      ])
    } as never);
    const { service } = createService({ registry });

    const result = await service.translate(translateRequest());

    expect(result.translations.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('runs polish on the translations with the target language and mode', async () => {
    const registry = fakeRegistry({
      polishTexts: vi.fn(async (_providerId: string, request: ProviderPolishRequest) =>
        request.items.map((item) => ({ id: item.id, text: `${item.text}!` }))
      )
    } as never);
    const { service } = createService({ registry });
    const progress = await captureProgress();

    const result = await service.translate(translateRequest({ polish: 'social_caption' }), progress);

    expect(registry.polishTexts).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({
        language: 'sr-Latn',
        mode: 'social_caption',
        items: [
          { id: 'a', text: 'HELLO' },
          { id: 'b', text: 'WORLD' }
        ]
      })
    );
    expect(result.translations).toEqual([
      { id: 'a', text: 'HELLO!' },
      { id: 'b', text: 'WORLD!' }
    ]);
    expect(stagesOf(progress.events)).toEqual(['translating', 'polishing']);
  });

  it('does not call polish when polish is none', async () => {
    const registry = fakeRegistry();
    const { service } = createService({ registry });

    await service.translate(translateRequest({ polish: 'none' }));

    expect(registry.polishTexts).not.toHaveBeenCalled();
  });

  it('fails polish with TRANSLATION_INCOMPLETE when ids are still missing after retry', async () => {
    const registry = fakeRegistry({
      polishTexts: vi.fn(async () => [{ id: 'a', text: 'Ok' }])
    } as never);
    const { service } = createService({ registry });

    await expect(service.translate(translateRequest({ polish: 'conservative' }))).rejects.toMatchObject({ code: 'TRANSLATION_INCOMPLETE' });
  });

  it('returns no translations and makes no provider calls for empty input', async () => {
    const registry = fakeRegistry();
    const { service } = createService({ registry });

    await expect(service.translate(translateRequest({ captions: [] }))).resolves.toEqual({ translations: [] });
    expect(registry.translateTexts).not.toHaveBeenCalled();
  });

  it('stops before the next batch when canceled', async () => {
    const controller = new AbortController();
    const registry = fakeRegistry({
      translateTexts: vi.fn(async (_providerId: string, request: ProviderTranslateRequest) => {
        controller.abort();
        return request.items.map((item) => ({ id: item.id, text: 'Ok' }));
      })
    } as never);
    const { service } = createService({ registry });

    await expect(
      service.translate(translateRequest({ captions: numbered(45) }), { signal: controller.signal })
    ).rejects.toMatchObject({ code: 'JOB_CANCELED' });
    expect(registry.translateTexts).toHaveBeenCalledTimes(1);
  });
});

function summarizeRequest(overrides: Partial<SummarizeTranscriptRequest> = {}): SummarizeTranscriptRequest {
  return {
    jobId: 'summary-1',
    providerId: 'openai',
    systemPrompt: 'Make a tweet.',
    language: 'en',
    segments: [{ startMs: 0, endMs: 1000, text: 'Hello.' }],
    ...overrides
  };
}

describe('SubtitleWorkflowService.summarize', () => {
  it('drops blank segments and sends the clip-relative transcript with the system prompt', async () => {
    const registry = fakeRegistry();
    const { service } = createService({ registry });

    await service.summarize(
      summarizeRequest({
        segments: [
          { startMs: 0, endMs: 1000, text: 'Hello.' },
          { startMs: 1000, endMs: 2000, text: '   ' },
          { startMs: 2000, endMs: 3000, text: 'World.' }
        ]
      })
    );

    expect(registry.summarizeText).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({
        systemPrompt: 'Make a tweet.',
        transcript: 'Transcript language: English\n\n[0:00] Hello.\n[0:02] World.'
      })
    );
  });

  it('passes the model and reasoning effort to the registry', async () => {
    const registry = fakeRegistry();
    const { service } = createService({ registry });

    await service.summarize(summarizeRequest({ modelId: 'gpt-4.1', reasoningEffort: 'medium' }));

    expect(registry.summarizeText).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({ modelId: 'gpt-4.1', reasoningEffort: 'medium' })
    );
  });

  it('returns the trimmed provider text', async () => {
    const registry = fakeRegistry({
      summarizeText: vi.fn(async () => '  The point.\n')
    } as never);
    const { service } = createService({ registry });

    await expect(service.summarize(summarizeRequest())).resolves.toEqual({ text: 'The point.' });
  });

  it('fails with NO_SPEECH and makes no provider call when every segment is blank', async () => {
    const events: WorkflowProgress[] = [];
    const registry = fakeRegistry();
    const { service } = createService({ registry });

    await expect(
      service.summarize(summarizeRequest({ segments: [{ startMs: 0, endMs: 1000, text: ' \n ' }] }), {
        onProgress: (event) => events.push(event)
      })
    ).rejects.toMatchObject({ code: 'NO_SPEECH' });
    expect(registry.summarizeText).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('reports the summarizing stage before calling the provider', async () => {
    const events: WorkflowProgress[] = [];
    const registry = fakeRegistry({
      summarizeText: vi.fn(async () => {
        expect(events).toEqual([{ stage: 'summarizing' }]);
        return 'Summary.';
      })
    } as never);
    const { service } = createService({ registry });

    await service.summarize(summarizeRequest(), { onProgress: (event) => events.push(event) });

    expect(stagesOf(events)).toEqual(['summarizing']);
    expect(registry.summarizeText).toHaveBeenCalledTimes(1);
  });

  it('names a rejected reasoning effort with REASONING_UNSUPPORTED and keeps the API detail', async () => {
    const detail = "OpenAI request failed (HTTP 400): Unsupported parameter: 'reasoning.effort' is not supported with this model.";
    const registry = fakeRegistry({
      summarizeText: vi.fn(async () => {
        throw new AppError('PROVIDER_REQUEST_FAILED', detail);
      })
    } as never);
    const { service } = createService({ registry });

    await expect(service.summarize(summarizeRequest({ reasoningEffort: 'low' }))).rejects.toMatchObject({
      code: 'REASONING_UNSUPPORTED',
      detail
    });
  });

  it('keeps other provider failures as they are, also without an effort', async () => {
    const registry = fakeRegistry({
      summarizeText: vi.fn(async () => {
        throw new AppError('PROVIDER_REQUEST_FAILED', 'OpenAI request failed (HTTP 400): reasoning is not available.');
      })
    } as never);
    const { service } = createService({ registry });

    await expect(service.summarize(summarizeRequest())).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
  });

  it('fails with PROVIDER_REQUEST_FAILED when the provider returns only whitespace', async () => {
    const registry = fakeRegistry({ summarizeText: vi.fn(async () => ' \n ') } as never);
    const { service } = createService({ registry });

    await expect(service.summarize(summarizeRequest())).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_FAILED' });
  });

  it('does not start when already canceled', async () => {
    const controller = new AbortController();
    controller.abort();
    const registry = fakeRegistry();
    const { service } = createService({ registry });

    await expect(service.summarize(summarizeRequest(), { signal: controller.signal })).rejects.toMatchObject({ code: 'JOB_CANCELED' });
    expect(registry.summarizeText).not.toHaveBeenCalled();
  });

  it('passes the abort signal to the provider and surfaces its cancellation', async () => {
    const controller = new AbortController();
    const registry = fakeRegistry({
      summarizeText: vi.fn(async (_providerId: string, request: ProviderSummarizeRequest) => {
        expect(request.signal).toBe(controller.signal);
        controller.abort();
        throw new AppError('JOB_CANCELED');
      })
    } as never);
    const { service } = createService({ registry });

    await expect(service.summarize(summarizeRequest(), { signal: controller.signal })).rejects.toMatchObject({ code: 'JOB_CANCELED' });
  });
});
