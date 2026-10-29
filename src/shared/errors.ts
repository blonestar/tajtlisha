/**
 * Errors crossing IPC lose their class; only `message` survives. Main-process
 * code throws `AppError`, whose message is '[CODE] human readable detail'.
 * The renderer maps CODE to a translated message via `parseAppErrorMessage`.
 */
export const APP_ERROR_CODES = [
  'JOB_CANCELED',
  'FFMPEG_MISSING',
  'FFMPEG_FAILED',
  'INVALID_TRIM',
  'INVALID_TIMING',
  'NO_AUDIO',
  'NO_SPEECH',
  'PROVIDER_NOT_CONNECTED',
  'PROVIDER_UNSUPPORTED',
  /** The connector is turned off in Settings > Connectors. */
  'PROVIDER_DISABLED',
  'PROVIDER_REQUEST_FAILED',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_RATE_LIMITED',
  'AUDIO_TOO_LARGE',
  'TRANSLATION_INCOMPLETE',
  /** The chosen model rejected the summary thinking (reasoning) effort. */
  'REASONING_UNSUPPORTED',
  'OUTPUT_EXISTS',
  'OUTPUT_IS_SOURCE',
  'OUTPUT_FOLDER_INVALID',
  'EXPORT_CANCELED',
  'NOTHING_TO_EXPORT',
  'SOURCE_MISSING',
  'UNKNOWN'
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly detail?: string;

  constructor(code: AppErrorCode, detail?: string) {
    super(detail ? `[${code}] ${detail}` : `[${code}]`);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
  }
}

export function isAppErrorCode(value: string): value is AppErrorCode {
  return (APP_ERROR_CODES as readonly string[]).includes(value);
}

/** Extracts '[CODE] detail' even when Electron prefixes "Error invoking remote method '...': Error: ". */
export function parseAppErrorMessage(message: string): { code: AppErrorCode; detail?: string } {
  const match = /\[([A-Z_]+)\]\s*(.*)$/s.exec(message);
  if (match && isAppErrorCode(match[1])) {
    const detail = match[2]?.trim();
    return { code: match[1], detail: detail ? detail : undefined };
  }
  return { code: 'UNKNOWN', detail: message || undefined };
}
