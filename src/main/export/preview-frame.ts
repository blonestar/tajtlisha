import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError } from '../../shared/errors';
import type { SubtitleStyle } from '../../shared/types/style';
import type { WatermarkSettings } from '../../shared/types/watermark';
import { FfmpegService } from '../ffmpeg/ffmpeg-service';
import { buildAssDocument } from './ass';
import { escapeFilterValue, formatSeconds, throwIfCanceled } from './ffmpeg-args';
import { type ProbeFn, defaultProbe, probeVideoSize } from './video-size';

/** Preview frames are downscaled to this height; the export keeps the full size. */
export const PREVIEW_MAX_HEIGHT = 720;

/** The single preview frame is output time 0, so the caption only has to cover it. */
const PREVIEW_CAPTION_MS = 1000;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type PreviewFrameRequest = {
  inputPath: string;
  /** Position in the source video. */
  atMs: number;
  /**
   * Part of the IPC contract, but not used: the frame is laid out with the probed
   * size, the same as the export, so the two cannot disagree.
   */
  videoWidth: number;
  videoHeight: number;
  text: string;
  style: SubtitleStyle;
  /** Word lit in the frame when word highlight is on. -1 or missing means none; see activeWordIndex(). */
  activeWordIndex?: number;
  /** Logo in the frame. Missing or enabled: false = no logo. */
  watermark?: WatermarkSettings;
};

export type PreviewFrameContext = {
  signal?: AbortSignal;
};

export type PreviewFrameDeps = {
  /** Directory with the bundled Noto Sans fonts, passed to libass as fontsdir. */
  fontsDir: string;
  ffmpeg?: Pick<FfmpegService, 'run'>;
  probe?: ProbeFn;
};

export type PreviewFrameResult = {
  dataUrl: string;
};

/**
 * Renders one paused frame with the same ASS path the export uses, so the
 * preview matches the exported video pixel for pixel (apart from the downscale).
 */
export async function renderPreviewFrame(
  request: PreviewFrameRequest,
  context: PreviewFrameContext,
  deps: PreviewFrameDeps
): Promise<PreviewFrameResult> {
  const { signal } = context;
  validatePreviewRequest(request);
  await assertSourceExists(request.inputPath);
  throwIfCanceled(signal);

  const ffmpeg = deps.ffmpeg ?? new FfmpegService();
  const size = await probeVideoSize(deps.probe ?? defaultProbe(), request.inputPath);

  const tempDir = await mkdtemp(join(tmpdir(), 'tajtlisha-preview-'));
  try {
    const assPath = join(tempDir, 'preview.ass');
    const pngPath = join(tempDir, 'frame.png');
    await writeFile(
      assPath,
      buildAssDocument({
        captions: [{ startMs: 0, endMs: PREVIEW_CAPTION_MS, text: request.text, activeWordIndex: request.activeWordIndex }],
        style: request.style,
        videoWidth: size.width,
        videoHeight: size.height,
        watermark: request.watermark ? { settings: request.watermark, endMs: PREVIEW_CAPTION_MS } : undefined
      }),
      'utf8'
    );

    await ffmpeg.run(
      buildPreviewArgs({
        inputPath: request.inputPath,
        atMs: request.atMs,
        width: size.width,
        height: size.height,
        assPath,
        fontsDir: deps.fontsDir,
        outputPath: pngPath
      }),
      { signal }
    );
    throwIfCanceled(signal);

    const png = await readFile(pngPath);
    if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new AppError('FFMPEG_FAILED', 'ffmpeg did not write a PNG preview frame.');
    }

    return { dataUrl: `data:image/png;base64,${png.toString('base64')}` };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/** Input seeking (before -i) keeps the frame accurate; the caption covers output time 0. */
export function buildPreviewArgs(input: {
  inputPath: string;
  atMs: number;
  width: number;
  height: number;
  assPath: string;
  fontsDir: string;
  outputPath: string;
}): string[] {
  // The comma inside min() is escaped so the filtergraph does not split the chain there.
  const filter = [
    `scale=${input.width}:${input.height}`,
    'setsar=1',
    `ass=filename=${escapeFilterValue(input.assPath)}:fontsdir=${escapeFilterValue(input.fontsDir)}`,
    `scale=-2:min(${PREVIEW_MAX_HEIGHT}\\,ih)`
  ].join(',');

  return [
    '-y',
    '-ss',
    formatSeconds(input.atMs),
    '-i',
    input.inputPath,
    '-map',
    '0:v:0',
    '-frames:v',
    '1',
    '-vf',
    filter,
    input.outputPath
  ];
}

function validatePreviewRequest(request: PreviewFrameRequest): void {
  if (!request.inputPath) {
    throw new AppError('SOURCE_MISSING', 'No input path was given.');
  }
  if (!Number.isFinite(request.atMs) || request.atMs < 0) {
    throw new AppError('INVALID_TRIM', `Preview position ${request.atMs} ms is not valid.`);
  }
}

async function assertSourceExists(inputPath: string): Promise<void> {
  try {
    await access(inputPath);
  } catch {
    throw new AppError('SOURCE_MISSING', inputPath);
  }
}
