import type { Stats } from 'node:fs';
import { access, link, lstat, mkdtemp, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { AppError } from '../../shared/errors';
import { clamp } from '../../shared/subtitle-geometry';
import type { JobStage, ProjectExportRequest, ProjectExportResult, ExportedFileKind } from '../../shared/types/jobs';
import type { TrimRange } from '../../shared/types/project';
import { FfmpegService } from '../ffmpeg';
import { buildAssDocument } from './ass';
import { type CaptionTextField, type ExportCaption, captionCuesFor, hasText, toExportCaptions } from './captions';
import { buildCopyFilename, sanitizeFilePart } from './filenames';
import { escapeFilterValue, formatSeconds, throwIfCanceled } from './ffmpeg-args';
import { type PreviewFrameContext, type PreviewFrameRequest, type PreviewFrameResult, renderPreviewFrame } from './preview-frame';
import { buildSrtFromCaptions } from './srt';
import { validateSubtitleTiming } from './timing';
import { type ProbeFn, type VideoSize, defaultProbe, probeVideoSize } from './video-size';

export type ProjectExportProgress = {
  stage: JobStage;
  /** 0..1 when known. */
  progress?: number;
};

export type ProjectExportContext = {
  signal?: AbortSignal;
  onProgress?: (event: ProjectExportProgress) => void;
};

/** File system calls that publish outputs. Tests inject failures here. */
export type ExportFileOps = {
  rename: (from: string, to: string) => Promise<void>;
  link: (existingPath: string, newPath: string) => Promise<void>;
};

export type ProjectExportServiceOptions = {
  /** Defaults to the system `ffmpeg`. */
  ffmpeg?: Pick<FfmpegService, 'run'>;
  /** Defaults to ffprobe through MediaService. Used for the source's display size. */
  probe?: ProbeFn;
  /** Directory with the bundled Noto Sans fonts, passed to libass as fontsdir. */
  fontsDir: string;
  /** Test seam for the publication calls. Defaults to `fs/promises`. */
  fileOps?: Partial<ExportFileOps>;
};

type PlannedOutput = {
  kind: ExportedFileKind;
  path: string;
};

type ChosenOutputs = {
  outputs: PlannedOutput[];
  /** 0 means the planned names; otherwise the ' (n)' copy number used for every file of the bundle. */
  copyIndex: number;
};

/** Set when a failed publication could not be undone; the staging folder then keeps the only copies. */
type StagingSession = { keepStaging: boolean };

/** A rename that was performed, so it can be reversed. */
type Move = { from: string; to: string };

/** A file published with link (or rename, when hard links are unavailable). */
type Published = { destination: string; stagedPath: string; mode: 'link' | 'rename' };

/** Name prefix of the private staging folder created inside the output folder. */
const STAGING_PREFIX = '.tajtlisha-export-';

/** Errors meaning the file system cannot hard-link; the publication then falls back to rename. */
const LINK_UNSUPPORTED = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS']);

/** Exports to the same folder run one at a time in this process, so their file names cannot race. */
const folderQueues = new Map<string, Promise<void>>();

/**
 * Renders the trimmed MP4 (burned-in ASS) and the SRT files for one project.
 * Everything is rendered into a private staging folder inside the output
 * folder, then published. A failed or canceled export leaves no partial
 * outputs behind and never touches files it did not create.
 */
export class ProjectExportService {
  private readonly ffmpeg: Pick<FfmpegService, 'run'>;
  private readonly probe: ProbeFn;
  private readonly fontsDir: string;
  private readonly fileOps: ExportFileOps;

  constructor(options: ProjectExportServiceOptions) {
    this.ffmpeg = options.ffmpeg ?? new FfmpegService();
    this.probe = options.probe ?? defaultProbe();
    this.fontsDir = options.fontsDir;
    this.fileOps = { rename, link, ...options.fileOps };
  }

  /** Paused-frame preview with the same ASS path and size source as the export. */
  renderPreviewFrame(request: PreviewFrameRequest, context: PreviewFrameContext = {}): Promise<PreviewFrameResult> {
    return renderPreviewFrame(request, context, { ffmpeg: this.ffmpeg, probe: this.probe, fontsDir: this.fontsDir });
  }

  async exportProject(request: ProjectExportRequest, context: ProjectExportContext = {}): Promise<ProjectExportResult> {
    const { signal, onProgress } = context;
    const folder = resolve(request.outputFolder);

    return withFolderLock(await canonicalPath(folder), async () => {
      const captions = await validateRequest(request);
      const planned = planOutputPaths(request, folder);
      await assertNoPlannedCollisions(planned);
      await assertSafeDestinations(request.inputPath, folder, planned);
      const chosen = await chooseOutputs(planned, request.overwritePolicy);
      if (chosen.copyIndex > 0) {
        await assertSafeDestinations(request.inputPath, folder, chosen.outputs);
      }
      throwIfCanceled(signal);

      // mkdtemp creates a new folder that no other process can know about, and it sits on the output file system so renames are atomic.
      const staging = await mkdtemp(join(folder, STAGING_PREFIX));
      const session: StagingSession = { keepStaging: false };
      try {
        const stagedPaths = chosen.outputs.map((output, index) => join(staging, `${index}${extname(output.path)}`));

        const videoIndex = chosen.outputs.findIndex((output) => output.kind === 'video');
        if (videoIndex >= 0) {
          await this.renderVideo({ request, captions, outputPath: stagedPaths[videoIndex], signal, onProgress });
        }

        const srtIndexes = chosen.outputs.flatMap((output, index) => (output.kind === 'video' ? [] : [index]));
        if (srtIndexes.length > 0) {
          onProgress?.({ stage: 'writing_srt' });
        }
        for (const index of srtIndexes) {
          throwIfCanceled(signal);
          const field: CaptionTextField = chosen.outputs[index].kind === 'original_srt' ? 'original' : 'translation';
          // 'wx' only creates the file: the staged path is new, so nothing existing is ever written through.
          await writeFile(stagedPaths[index], buildSrtFromCaptions(captions, field), { encoding: 'utf8', flag: 'wx' });
        }

        throwIfCanceled(signal);
        let published = chosen.outputs;
        if (request.overwritePolicy === 'overwrite') {
          await publishReplacing({ outputs: chosen.outputs, stagedPaths, staging, ops: this.fileOps, session });
        } else {
          published = await publishWithoutClobber({
            planned,
            chosen,
            stagedPaths,
            staging,
            policy: request.overwritePolicy,
            ops: this.fileOps,
            session
          });
        }

        return { files: published.map((output) => ({ kind: output.kind, path: output.path })) };
      } finally {
        if (!session.keepStaging) {
          await rm(staging, { recursive: true, force: true });
        }
      }
    });
  }

  private async renderVideo(input: {
    request: ProjectExportRequest;
    captions: ExportCaption[];
    outputPath: string;
    signal?: AbortSignal;
    onProgress?: ProjectExportContext['onProgress'];
  }): Promise<void> {
    const { request, captions, outputPath, signal, onProgress } = input;
    const durationMs = request.trim.endMs - request.trim.startMs;
    const field: CaptionTextField = request.outputs.video === 'translation' ? 'translation' : 'original';
    // The request's size is ignored: layout must match the file that is actually rendered.
    const size = await probeVideoSize(this.probe, request.inputPath);

    const assDir = await mkdtemp(join(tmpdir(), 'tajtlisha-ass-'));
    try {
      const assPath = join(assDir, 'subtitles.ass');
      const assDocument = buildAssDocument({
        captions: captionCuesFor(captions, field),
        style: request.style,
        videoWidth: size.width,
        videoHeight: size.height,
        watermark: request.watermark ? { settings: request.watermark, endMs: durationMs } : undefined
      });
      await writeFile(assPath, assDocument, 'utf8');

      onProgress?.({ stage: 'rendering_video', progress: 0 });
      await this.ffmpeg.run(
        buildVideoArgs({
          inputPath: request.inputPath,
          outputPath,
          assPath,
          fontsDir: this.fontsDir,
          size,
          startMs: request.trim.startMs,
          durationMs
        }),
        {
          signal,
          onProgress: (outTimeMs) => onProgress?.({ stage: 'rendering_video', progress: clamp(outTimeMs / durationMs, 0, 1) })
        }
      );
      throwIfCanceled(signal);
    } finally {
      await rm(assDir, { recursive: true, force: true });
    }
  }
}

/**
 * Runs every check that must pass before a single byte is written, and returns
 * the captions on the exported timeline.
 */
async function validateRequest(request: ProjectExportRequest): Promise<ExportCaption[]> {
  const { outputs, trim } = request;
  if (!outputs.originalSrt && !outputs.translationSrt && outputs.video === 'none') {
    throw new AppError('NOTHING_TO_EXPORT');
  }

  assertValidTrim(trim);

  const { baseName } = request;
  if (baseName.trim().length === 0 || /[/\\]/.test(baseName) || baseName === '.' || baseName === '..') {
    throw new AppError('OUTPUT_FOLDER_INVALID', 'Export file name is empty or contains a path separator.');
  }

  await assertDirectory(request.outputFolder);
  await assertSourceExists(request.inputPath);

  const captions = toExportCaptions(request.captions, trim);
  const issues = validateSubtitleTiming(captions);
  if (issues.length > 0) {
    throw new AppError('INVALID_TIMING', issues.map((issue) => `${issue.cueId} (${issue.code})`).join(', '));
  }

  if (outputs.translationSrt || outputs.video === 'translation') {
    const incomplete = captions.filter((caption) => hasText(caption.original) && !hasText(caption.translation)).length;
    if (incomplete > 0) {
      throw new AppError('TRANSLATION_INCOMPLETE', `${incomplete} caption(s) have no translation yet.`);
    }
  }

  return captions;
}

function assertValidTrim(trim: TrimRange): void {
  const valid = Number.isFinite(trim.startMs) && Number.isFinite(trim.endMs) && trim.startMs >= 0 && trim.endMs > trim.startMs;
  if (!valid) {
    throw new AppError('INVALID_TRIM', `Trim range ${trim.startMs}..${trim.endMs} ms is not valid.`);
  }
}

async function assertDirectory(folder: string): Promise<void> {
  let folderStat: Awaited<ReturnType<typeof stat>>;
  try {
    folderStat = await stat(folder);
  } catch {
    throw new AppError('OUTPUT_FOLDER_INVALID', 'Output folder does not exist.');
  }

  if (!folderStat.isDirectory()) {
    throw new AppError('OUTPUT_FOLDER_INVALID', 'Output folder is not a directory.');
  }
}

async function assertSourceExists(inputPath: string): Promise<void> {
  try {
    await access(inputPath);
  } catch {
    throw new AppError('SOURCE_MISSING', inputPath);
  }
}

function planOutputPaths(request: ProjectExportRequest, folder: string): PlannedOutput[] {
  const { baseName, outputs } = request;
  const planned: PlannedOutput[] = [];

  if (outputs.originalSrt) {
    planned.push({ kind: 'original_srt', path: join(folder, `${baseName}.${languageTag(request.sourceLanguage)}.srt`) });
  }
  if (outputs.translationSrt) {
    planned.push({ kind: 'translation_srt', path: join(folder, `${baseName}.${languageTag(request.targetLanguage)}.srt`) });
  }
  if (outputs.video !== 'none') {
    planned.push({ kind: 'video', path: join(folder, `${baseName}.subtitled.mp4`) });
  }

  return planned;
}

function languageTag(language: string): string {
  return sanitizeFilePart(language) || 'und';
}

/** Source and target languages can be equal, which would give two SRTs the same name. */
async function assertNoPlannedCollisions(planned: PlannedOutput[]): Promise<void> {
  const seen = new Set<string>();
  for (const output of planned) {
    const key = output.path.toLowerCase();
    if (seen.has(key)) {
      throw new AppError('OUTPUT_FOLDER_INVALID', `Two exported files would have the same name: ${basename(output.path)}.`);
    }
    seen.add(key);
  }
}

/**
 * Every destination must be absent or a regular file, and must not resolve to
 * the source video (symlinks included). Runs before anything is rendered.
 */
async function assertSafeDestinations(inputPath: string, folder: string, outputs: PlannedOutput[]): Promise<void> {
  const source = await canonicalPath(inputPath);
  if ((await canonicalPath(folder)) === source) {
    throw new AppError('OUTPUT_IS_SOURCE', folder);
  }
  for (const output of outputs) {
    if ((await canonicalPath(output.path)) === source) {
      throw new AppError('OUTPUT_IS_SOURCE', output.path);
    }
  }
  for (const output of outputs) {
    const current = await lstatOrNull(output.path);
    if (current && !current.isFile()) {
      throw new AppError('OUTPUT_FOLDER_INVALID', output.path);
    }
  }
}

async function chooseOutputs(planned: PlannedOutput[], policy: ProjectExportRequest['overwritePolicy']): Promise<ChosenOutputs> {
  const existing = await existingPaths(planned);
  if (existing.length === 0 || policy === 'overwrite') {
    return { outputs: planned, copyIndex: 0 };
  }

  if (policy === 'ask') {
    throw new AppError('OUTPUT_EXISTS', existing.join('\n'));
  }

  return firstFreeCopyBundle(planned, 1);
}

/** One copy number for the whole bundle, so the SRTs and the MP4 stay paired. */
async function firstFreeCopyBundle(planned: PlannedOutput[], fromCopy: number): Promise<ChosenOutputs> {
  for (let copyIndex = fromCopy; ; copyIndex += 1) {
    const outputs = planned.map((output) => ({ kind: output.kind, path: buildCopyFilename(output.path, copyIndex) }));
    if ((await existingPaths(outputs)).length === 0) {
      return { outputs, copyIndex };
    }
  }
}

/**
 * 'overwrite': each existing destination is first moved into staging as a
 * backup, then the staged files are renamed into place. Any failure moves
 * everything back, so the previous outputs survive.
 */
async function publishReplacing(input: {
  outputs: PlannedOutput[];
  stagedPaths: string[];
  staging: string;
  ops: ExportFileOps;
  session: StagingSession;
}): Promise<void> {
  const { outputs, stagedPaths, staging, ops, session } = input;
  const moves: Move[] = [];

  try {
    for (const [index, output] of outputs.entries()) {
      const current = await lstatOrNull(output.path);
      if (!current) {
        continue;
      }
      if (!current.isFile()) {
        throw new AppError('OUTPUT_FOLDER_INVALID', output.path);
      }
      const backupPath = join(staging, `backup-${index}${extname(output.path)}`);
      await ops.rename(output.path, backupPath);
      moves.push({ from: output.path, to: backupPath });
    }

    for (const [index, output] of outputs.entries()) {
      await ops.rename(stagedPaths[index], output.path);
      moves.push({ from: stagedPaths[index], to: output.path });
    }
  } catch (error) {
    assertUndone(await undoMoves(moves, ops), staging, session);
    throw error;
  }
}

/**
 * 'ask' and 'create_copy': files are hard-linked into place, which fails
 * instead of replacing an existing file. Staged files stay in staging until
 * the whole bundle is in place.
 */
async function publishWithoutClobber(input: {
  planned: PlannedOutput[];
  chosen: ChosenOutputs;
  stagedPaths: string[];
  staging: string;
  policy: 'ask' | 'create_copy';
  ops: ExportFileOps;
  session: StagingSession;
}): Promise<PlannedOutput[]> {
  const { planned, stagedPaths, staging, policy, ops, session } = input;
  let { outputs, copyIndex } = input.chosen;

  for (;;) {
    const published: Published[] = [];
    let conflict: string | undefined;

    try {
      for (const [index, output] of outputs.entries()) {
        const mode = await publishNew(stagedPaths[index], output.path, ops);
        if (mode === 'exists') {
          conflict = output.path;
          break;
        }
        published.push({ destination: output.path, stagedPath: stagedPaths[index], mode });
      }
    } catch (error) {
      assertUndone(await undoPublished(published, ops), staging, session);
      throw error;
    }

    if (conflict === undefined) {
      return outputs;
    }

    assertUndone(await undoPublished(published, ops), staging, session);
    if (policy === 'ask') {
      throw new AppError('OUTPUT_EXISTS', conflict);
    }

    // Something appeared since planning: move the whole bundle to the next free copy number.
    ({ outputs, copyIndex } = await firstFreeCopyBundle(planned, copyIndex + 1));
  }
}

/** Links the staged file to the destination, or renames it when hard links are not supported. */
async function publishNew(stagedPath: string, destination: string, ops: ExportFileOps): Promise<'link' | 'rename' | 'exists'> {
  try {
    await ops.link(stagedPath, destination);
    return 'link';
  } catch (error) {
    const code = errorCode(error);
    if (code === 'EEXIST') {
      return 'exists';
    }
    if (!LINK_UNSUPPORTED.has(code)) {
      throw error;
    }
  }

  // Fallback: check, then rename. Another program can create the file between the two calls.
  if (await lstatOrNull(destination)) {
    return 'exists';
  }
  await ops.rename(stagedPath, destination);
  return 'rename';
}

async function undoPublished(published: Published[], ops: ExportFileOps): Promise<string[]> {
  const unrestored: string[] = [];
  for (const output of [...published].reverse()) {
    try {
      if (output.mode === 'link') {
        await unlink(output.destination);
      } else {
        await ops.rename(output.destination, output.stagedPath);
      }
    } catch {
      unrestored.push(output.destination);
    }
  }
  return unrestored;
}

/** Reverses performed renames in reverse order. Returns the paths that could not be put back. */
async function undoMoves(moves: Move[], ops: ExportFileOps): Promise<string[]> {
  const unrestored: string[] = [];
  for (const move of [...moves].reverse()) {
    try {
      await ops.rename(move.to, move.from);
    } catch {
      unrestored.push(move.to);
    }
  }
  return unrestored;
}

/** Throws when a rollback was incomplete. The staging folder is then kept, since it holds the only copies. */
function assertUndone(unrestored: string[], staging: string, session: StagingSession): void {
  if (unrestored.length === 0) {
    return;
  }
  session.keepStaging = true;
  throw new AppError('UNKNOWN', `Export failed and could not undo every change: ${unrestored.join(', ')}. Files are kept in ${staging}.`);
}

function buildVideoArgs(input: {
  inputPath: string;
  outputPath: string;
  assPath: string;
  fontsDir: string;
  size: VideoSize;
  startMs: number;
  durationMs: number;
}): string[] {
  // Anamorphic sources are scaled to square pixels first: the subtitles were laid out for that size.
  const filter = [
    `scale=${input.size.width}:${input.size.height}`,
    'setsar=1',
    `ass=filename=${escapeFilterValue(input.assPath)}:fontsdir=${escapeFilterValue(input.fontsDir)}`
  ].join(',');

  return [
    '-y',
    '-ss',
    formatSeconds(input.startMs),
    '-i',
    input.inputPath,
    '-t',
    formatSeconds(input.durationMs),
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    filter,
    // Keep variable frame timing; never force a constant -r, which would drift the captions.
    '-fps_mode:v',
    'passthrough',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    // The staged file is named by index, so the muxer has to be named explicitly.
    '-f',
    'mp4',
    input.outputPath
  ];
}

/** Runs `task` after every earlier export to the same folder in this process has finished. */
async function withFolderLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = folderQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveCurrent) => {
    release = resolveCurrent;
  });
  const tail = previous.then(() => current);
  folderQueues.set(key, tail);

  await previous;
  try {
    return await task();
  } finally {
    release();
    if (folderQueues.get(key) === tail) {
      folderQueues.delete(key);
    }
  }
}

async function existingPaths(outputs: PlannedOutput[]): Promise<string[]> {
  const found: string[] = [];
  for (const output of outputs) {
    if (await lstatOrNull(output.path)) {
      found.push(output.path);
    }
  }
  return found;
}

/** lstat, so a dangling symlink counts as present. */
async function lstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

/** Resolves symlinks for existing files, and for missing files via their folder. */
async function canonicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch {
    try {
      return join(await realpath(dirname(absolute)), basename(absolute));
    } catch {
      return absolute;
    }
  }
}
