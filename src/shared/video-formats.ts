/**
 * Video containers the app opens. Chromium may or may not decode some of them;
 * files it cannot play go through the preview proxy.
 */
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'mkv', 'webm'] as const;

/** The same formats as shown to the user. Shown as-is: they are file extensions, not translatable text. */
export const SUPPORTED_FORMATS = 'MP4, M4V, MOV, MKV, WebM';

/** True when the file name ends with a supported video extension (case-insensitive). */
export function isSupportedVideoPath(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return false;
  const extension = path.slice(dot + 1).toLowerCase();
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extension);
}
