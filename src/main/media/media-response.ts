import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

export type ByteRange = { start: number; end: number };

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska'
};

/**
 * Parses a single HTTP byte range against a file size. Returns null when the
 * header is missing or not a single byte range (the whole file is served then),
 * and 'unsatisfiable' when the range lies outside the file.
 */
export function parseByteRange(header: string | null, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, startText, endText] = match;
  if (startText === '' && endText === '') return null;

  if (startText === '') {
    // Suffix range: the last N bytes.
    const length = Number(endText);
    if (length === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(startText);
  const end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);
  if (start >= size || end < start) return 'unsatisfiable';
  return { start, end };
}

/**
 * Serves a local media file with byte-range support. Chromium only lets a
 * video seek when the source answers range requests with 206 responses.
 */
export async function createMediaResponse(filePath: string, rangeHeader: string | null): Promise<Response> {
  let size: number;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new Response('Media not found.', { status: 404 });
    size = info.size;
  } catch {
    return new Response('Media not found.', { status: 404 });
  }

  const headers = new Headers({
    'accept-ranges': 'bytes',
    'content-type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'video/mp4'
  });

  const range = parseByteRange(rangeHeader, size);
  if (range === 'unsatisfiable') {
    headers.set('content-range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }

  if (range === null) {
    headers.set('content-length', String(size));
    return new Response(size === 0 ? null : toBody(filePath), { status: 200, headers });
  }

  headers.set('content-length', String(range.end - range.start + 1));
  headers.set('content-range', `bytes ${range.start}-${range.end}/${size}`);
  return new Response(toBody(filePath, range), { status: 206, headers });
}

function toBody(filePath: string, range?: ByteRange): ReadableStream<Uint8Array> {
  const stream = createReadStream(filePath, range ? { start: range.start, end: range.end } : undefined);
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}
