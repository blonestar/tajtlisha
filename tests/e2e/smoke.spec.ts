import { test, expect, _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { join } from 'node:path';

type RendererGlobal = typeof globalThis & {
  tajtlisha: {
    project: {
      selectVideo(): Promise<{ inputPath: string; width: number; height: number } | null>;
      createPreviewProxy(input: { jobId: string; inputPath: string }): Promise<{ fileUrl: string }>;
    };
  };
};

// The app starts in the system language, so the names are matched in all three UI languages.
const SETTINGS_NAME = /^(Settings|Podešavanja|Подешавања)$/;
const OPEN_VIDEO_NAME = /^(Open video|Otvori video|Отвори видео)$/;

test('launches Tajtlisha, shows the empty state and opens Settings as an overlay', async () => {
  const mainEntry = resolve(process.cwd(), 'out/main/index.js');
  test.skip(!existsSync(mainEntry), 'Run pnpm build before pnpm test:e2e.');

  const userDataDir = mkdtempSync(join(tmpdir(), 'tajtlisha-e2e-profile-'));
  const app = await electron.launch({ args: [mainEntry], env: { ...process.env, TAJTLISHA_USER_DATA_DIR: userDataDir } });
  try {
    const window = await app.firstWindow();
    await expect
      .poll(() =>
        window.evaluate(
          () => typeof (globalThis as { tajtlisha?: { project?: { selectVideo?: unknown } } }).tajtlisha?.project?.selectVideo
        )
      )
      .toBe('function');
    expect(
      await window.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    ).toContain('tajtlisha-media:');

    const emptyCard = window.locator('.empty-card');
    await expect(emptyCard.getByRole('button', { name: OPEN_VIDEO_NAME })).toBeVisible();

    // force: skip the animation-frame stability check, which never completes while the
    // session is locked (the compositor stops drawing the window).
    await window.getByRole('button', { name: SETTINGS_NAME }).click({ force: true });
    const settings = window.getByRole('dialog');
    await expect(settings).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
    await expect(emptyCard).toBeVisible();
  } finally {
    await app.close();
    rmSync(userDataDir, { force: true, recursive: true });
  }
});

test('plays an ffmpeg preview proxy through the local media protocol', async () => {
  const mainEntry = resolve(process.cwd(), 'out/main/index.js');
  test.skip(!existsSync(mainEntry), 'Run pnpm build before pnpm test:e2e.');

  const tempFolder = mkdtempSync(join(tmpdir(), 'tajtlisha-e2e-media-'));
  const inputPath = join(tempFolder, 'source.mp4');
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=24',
    '-t',
    '0.5',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    inputPath
  ]);

  const userDataDir = mkdtempSync(join(tmpdir(), 'tajtlisha-e2e-profile-'));
  const app = await electron.launch({ args: [mainEntry], env: { ...process.env, TAJTLISHA_USER_DATA_DIR: userDataDir } });
  try {
    const page = await app.firstWindow();
    // Main only processes videos opened through the app, so open it through the
    // real selectVideo handler with the native file dialog stubbed.
    await app.evaluate(({ dialog }, sourcePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [sourcePath] });
    }, inputPath);
    const source = await page.evaluate(() => (globalThis as RendererGlobal).tajtlisha.project.selectVideo());
    expect(source?.inputPath).toBe(inputPath);
    expect(source?.width).toBe(320);
    expect(source?.height).toBe(180);

    const preview = await page.evaluate(
      (sourcePath) =>
        (globalThis as RendererGlobal).tajtlisha.project.createPreviewProxy({
          jobId: crypto.randomUUID(),
          inputPath: sourcePath
        }),
      inputPath
    );
    const playback = await page.evaluate(
      (fileUrl) =>
        new Promise<{ code?: number; duration?: number; status: 'error' | 'loadedmetadata' | 'timeout' }>((resolvePlayback) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.onloadedmetadata = () => resolvePlayback({ status: 'loadedmetadata', duration: video.duration });
          video.onerror = () => resolvePlayback({ status: 'error', code: video.error?.code });
          video.src = fileUrl;
          document.body.append(video);
          globalThis.setTimeout(() => resolvePlayback({ status: 'timeout' }), 10000);
        }),
      preview.fileUrl
    );

    expect(playback.status).toBe('loadedmetadata');
    expect(playback.duration).toBeGreaterThan(0);
  } finally {
    await app.close();
    rmSync(tempFolder, { force: true, recursive: true });
    rmSync(userDataDir, { force: true, recursive: true });
  }
});

test('seeks an opened video and toggles playback with a click on the frame', async () => {
  const mainEntry = resolve(process.cwd(), 'out/main/index.js');
  test.skip(!existsSync(mainEntry), 'Run pnpm build before pnpm test:e2e.');

  const tempFolder = mkdtempSync(join(tmpdir(), 'tajtlisha-e2e-seek-'));
  const inputPath = join(tempFolder, 'clip.mp4');
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x568:rate=30',
    '-t',
    '10',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    inputPath
  ]);

  const userDataDir = mkdtempSync(join(tmpdir(), 'tajtlisha-e2e-profile-'));
  const app = await electron.launch({ args: [mainEntry], env: { ...process.env, TAJTLISHA_USER_DATA_DIR: userDataDir } });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }, sourcePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [sourcePath] });
    }, inputPath);
    await page.locator('.empty-card').getByRole('button', { name: OPEN_VIDEO_NAME }).click({ force: true });

    const video = page.locator('video');
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 20000 }).toBeGreaterThan(0);

    // The media protocol must answer range requests, or Chromium cannot seek.
    const seek = await video.evaluate(async (element: HTMLVideoElement) => {
      const seekableEnd = element.seekable.length > 0 ? element.seekable.end(0) : 0;
      element.currentTime = 6;
      await new Promise((done) => {
        element.addEventListener('seeked', done, { once: true });
        globalThis.setTimeout(done, 5000);
      });
      return { seekableEnd, currentTime: element.currentTime };
    });
    expect(seek.seekableEnd).toBeGreaterThan(9);
    expect(seek.currentTime).toBeCloseTo(6, 1);

    await video.click({ force: true });
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
    await video.click({ force: true });
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  } finally {
    await app.close();
    rmSync(tempFolder, { force: true, recursive: true });
    rmSync(userDataDir, { force: true, recursive: true });
  }
});
