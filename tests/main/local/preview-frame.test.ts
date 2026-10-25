/* @vitest-environment node */
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FfmpegRunOptions } from '../../../src/main/ffmpeg/ffmpeg-service';
import { FfmpegService } from '../../../src/main/ffmpeg';
import { PREVIEW_MAX_HEIGHT, ProjectExportService, renderPreviewFrame } from '../../../src/main/export';
import { AppError } from '../../../src/shared/errors';
import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';
import type { MediaProbeRequest, MediaProbeResult } from '../../../src/shared/types/media';

const ffmpegAvailable = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const fontsDir = fileURLToPath(new URL('../../../resources/fonts', import.meta.url));

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The fake ffmpeg never reads the source, but the source must exist for the preview's own check. */
let fakeSourceDir = '';
let fakeSource = '';
beforeAll(async () => {
  fakeSourceDir = await mkdtemp(join(tmpdir(), 'tajtlisha-preview-fake-'));
  fakeSource = join(fakeSourceDir, 'source.mp4');
  await writeFile(fakeSource, 'not really a video');
  return async () => rm(fakeSourceDir, { recursive: true, force: true });
});

/** Width and height from the IHDR chunk that always follows the PNG signature. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function fakeProbe(size: { width: number; height: number }) {
  const calls: MediaProbeRequest[] = [];
  const probe = async (input: MediaProbeRequest): Promise<MediaProbeResult> => {
    calls.push(input);
    return { inputPath: input.inputPath, hasVideo: true, hasAudio: false, ...size };
  };
  return { probe, calls };
}

/** Fake ffmpeg that writes a 1x1 PNG header to the output path and records the args. */
function fakeFfmpeg(write: (outputPath: string) => Promise<void> = writePng) {
  const calls: Array<{ args: string[]; options: FfmpegRunOptions; assDocument: string }> = [];
  const service = {
    run: async (args: string[], options: FfmpegRunOptions = {}) => {
      const filter = args[args.indexOf('-vf') + 1] ?? '';
      const assPath = /ass=filename=(.+?):fontsdir=/.exec(filter.replace(/\\\\\\(.)/g, '$1'))?.[1] ?? '';
      const assDocument = await readFile(assPath, 'utf8');
      calls.push({ args, options, assDocument });
      await write(args[args.length - 1]);
      return { stdout: '', stderr: '' };
    }
  };
  return { service, calls };
}

async function writePng(outputPath: string): Promise<void> {
  await writeFile(outputPath, Buffer.concat([PNG_HEADER, Buffer.alloc(16)]));
}

describe('preview frame with a fake ffmpeg', () => {
  it('renders one frame through the export ASS path and returns it as a PNG data URL', async () => {
    const probe = fakeProbe({ width: 720, height: 1280 });
    const { service, calls } = fakeFfmpeg();

    const result = await renderPreviewFrame(
      { inputPath: fakeSource, atMs: 7500, videoWidth: 360, videoHeight: 640, text: 'Prvi red\nDrugi red', style: DEFAULT_SUBTITLE_STYLE },
      {},
      { ffmpeg: service, probe: probe.probe, fontsDir: '/fonts' }
    );

    expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(Buffer.from(result.dataUrl.split(',')[1], 'base64').subarray(0, 8).equals(PNG_HEADER)).toBe(true);

    const args = calls[0].args;
    expect(args.slice(0, 6)).toEqual(['-y', '-ss', '7.500', '-i', fakeSource, '-map']);
    expect(args).toEqual(expect.arrayContaining(['-frames:v', '1']));
    // The comma inside min() is escaped for the filtergraph (backslash-comma).
    expect(args[args.indexOf('-vf') + 1]).toMatch(new RegExp(`^scale=720:1280,setsar=1,ass=filename=.+:fontsdir=/fonts,scale=-2:min\\(${PREVIEW_MAX_HEIGHT}\\\\,ih\\)$`));
    expect(args[args.length - 1]).toMatch(/frame\.png$/);

    // The caption covers output time 0, and the layout uses the probed size, not the request's 360x640.
    expect(calls[0].assDocument).toContain('PlayResX: 720');
    expect(calls[0].assDocument).toContain('PlayResY: 1280');
    expect(calls[0].assDocument).toContain('Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Prvi red\\NDrugi red');
    expect(probe.calls).toEqual([{ inputPath: fakeSource }]);
  });

  it('passes the active word to the single caption when word highlight is on', async () => {
    const probe = fakeProbe({ width: 720, height: 1280 });
    const { service, calls } = fakeFfmpeg();
    const style = { ...DEFAULT_SUBTITLE_STYLE, wordHighlight: 'word' as const };

    await renderPreviewFrame(
      { inputPath: fakeSource, atMs: 0, videoWidth: 720, videoHeight: 1280, text: 'Prvi drugi', style, activeWordIndex: 1 },
      {},
      { ffmpeg: service, probe: probe.probe, fontsDir: '/fonts' }
    );

    // The colour override is the default highlight colour #ffd400 in BBGGRR order.
    expect(calls[0].assDocument).toContain('Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Prvi {\\c&H00D4FF&}drugi{\\r}');
  });

  it('removes its temp folder, including the ASS file, after rendering', async () => {
    const { service, calls } = fakeFfmpeg();
    await renderPreviewFrame(
      { inputPath: fakeSource, atMs: 0, videoWidth: 720, videoHeight: 1280, text: 'Hi', style: DEFAULT_SUBTITLE_STYLE },
      {},
      { ffmpeg: service, probe: fakeProbe({ width: 720, height: 1280 }).probe, fontsDir: '/fonts' }
    );

    const assPath = /ass=filename=(.+?):fontsdir=/.exec(calls[0].args[calls[0].args.indexOf('-vf') + 1].replace(/\\\\\\(.)/g, '$1'))?.[1];
    expect(assPath).toBeDefined();
    await expect(readFile(assPath as string, 'utf8')).rejects.toThrow();
  });

  it('forwards the abort signal to ffmpeg and stops before the probe when already aborted', async () => {
    const controller = new AbortController();
    const probe = fakeProbe({ width: 720, height: 1280 });
    const { service, calls } = fakeFfmpeg();
    controller.abort();

    await expect(
      renderPreviewFrame(
        { inputPath: fakeSource, atMs: 0, videoWidth: 720, videoHeight: 1280, text: 'Hi', style: DEFAULT_SUBTITLE_STYLE },
        { signal: controller.signal },
        { ffmpeg: service, probe: probe.probe, fontsDir: '/fonts' }
      )
    ).rejects.toMatchObject({ code: 'JOB_CANCELED' });
    expect(calls).toHaveLength(0);
    expect(probe.calls).toHaveLength(0);
  });

  it('rejects an ffmpeg run that did not write a PNG', async () => {
    const { service } = fakeFfmpeg(async (outputPath) => writeFile(outputPath, 'not a png'));

    await expect(
      renderPreviewFrame(
        { inputPath: fakeSource, atMs: 0, videoWidth: 720, videoHeight: 1280, text: 'Hi', style: DEFAULT_SUBTITLE_STYLE },
        {},
        { ffmpeg: service, probe: fakeProbe({ width: 720, height: 1280 }).probe, fontsDir: '/fonts' }
      )
    ).rejects.toMatchObject({ code: 'FFMPEG_FAILED' });
  });

  it('rejects a missing source and a negative position before running ffmpeg', async () => {
    const { service, calls } = fakeFfmpeg();
    const deps = { ffmpeg: service, probe: fakeProbe({ width: 720, height: 1280 }).probe, fontsDir: '/fonts' };
    const base = { inputPath: fakeSource, atMs: 0, videoWidth: 720, videoHeight: 1280, text: 'Hi', style: DEFAULT_SUBTITLE_STYLE };

    const missing = await renderPreviewFrame({ ...base, inputPath: join(tmpdir(), 'tajtlisha-no-such-preview.mp4') }, {}, deps).catch(
      (error: unknown) => error
    );
    expect(missing).toBeInstanceOf(AppError);
    expect((missing as AppError).code).toBe('SOURCE_MISSING');

    await expect(renderPreviewFrame({ ...base, atMs: -1 }, {}, { ...deps, probe: fakeProbe({ width: 1, height: 1 }).probe })).rejects.toMatchObject({
      code: 'INVALID_TRIM'
    });
    expect(calls).toHaveLength(0);
  });

  it('is exposed on ProjectExportService with the same probe and fonts', async () => {
    const probe = fakeProbe({ width: 720, height: 1280 });
    const { service, calls } = fakeFfmpeg();
    const exporter = new ProjectExportService({ ffmpeg: service, probe: probe.probe, fontsDir: '/fonts' });

    const folder = await mkdtemp(join(tmpdir(), 'tajtlisha-preview-service-'));
    const inputPath = join(folder, 'source.mp4');
    await writeFile(inputPath, 'not really a video');
    try {
      await exporter.renderPreviewFrame({ inputPath, atMs: 1000, videoWidth: 1, videoHeight: 1, text: 'Hi', style: DEFAULT_SUBTITLE_STYLE });
      expect(calls[0].args).toContain(inputPath);
      expect(calls[0].args[calls[0].args.indexOf('-vf') + 1]).toContain(':fontsdir=/fonts,');
      expect(probe.calls).toEqual([{ inputPath }]);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!ffmpegAvailable)('preview frame with real ffmpeg', () => {
  it('writes a valid PNG scaled to 720 px high, with the probed size behind it', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'tajtlisha-preview-ffmpeg-'));
    const inputPath = join(folder, 'input clip.mp4');

    try {
      generateTestClip(inputPath);

      const result = await renderPreviewFrame(
        { inputPath, atMs: 1500, videoWidth: 1, videoHeight: 1, text: 'Hello there\nsecond line', style: DEFAULT_SUBTITLE_STYLE },
        {},
        { ffmpeg: new FfmpegService(), fontsDir }
      );

      expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
      const bytes = Buffer.from(result.dataUrl.slice('data:image/png;base64,'.length), 'base64');
      expect(bytes.subarray(0, 8).equals(PNG_HEADER)).toBe(true);
      // 720x1280 source: height capped at 720. scale=-2 keeps the 9:16 ratio and rounds the width to even (405.0 -> 406).
      expect(pngSize(bytes)).toEqual({ width: 406, height: 720 });

      expect((await readdir(folder)).filter((name) => name.includes('tajtlisha-preview'))).toEqual([]);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }, 120_000);
});

function generateTestClip(outputPath: string): void {
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=720x1280:rate=25:duration=3',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      outputPath
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`Could not generate the test clip: ${result.stderr}`);
  }
}
