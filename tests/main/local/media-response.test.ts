/* @vitest-environment node */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createMediaResponse, parseByteRange } from '../../../src/main/media/media-response';

describe('parseByteRange', () => {
  it('parses closed, open-ended and suffix ranges', () => {
    expect(parseByteRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
    expect(parseByteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('serves the whole file for a missing, malformed or multi-range header', () => {
    expect(parseByteRange(null, 1000)).toBeNull();
    expect(parseByteRange('items=0-1', 1000)).toBeNull();
    expect(parseByteRange('bytes=-', 1000)).toBeNull();
    expect(parseByteRange('bytes=0-1,5-9', 1000)).toBeNull();
  });

  it('reports ranges outside the file as unsatisfiable', () => {
    expect(parseByteRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=50-10', 1000)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=-0', 1000)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=0-', 0)).toBe('unsatisfiable');
  });
});

describe('createMediaResponse', () => {
  const folder = mkdtempSync(join(tmpdir(), 'tajtlisha-media-response-'));
  const filePath = join(folder, 'clip.mp4');
  const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
  writeFileSync(filePath, bytes);

  afterAll(() => rmSync(folder, { force: true, recursive: true }));

  it('answers a range request with 206 and only the requested bytes', async () => {
    const response = await createMediaResponse(filePath, 'bytes=10-19');

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 10-19/256');
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(Array.from(bytes.slice(10, 20)));
  });

  it('serves the whole file with 200 and advertises range support', async () => {
    const response = await createMediaResponse(filePath, null);

    expect(response.status).toBe(200);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-length')).toBe('256');
    expect((await response.arrayBuffer()).byteLength).toBe(256);
  });

  it('answers 416 for a range past the end and 404 for a missing file', async () => {
    const outside = await createMediaResponse(filePath, 'bytes=300-');
    expect(outside.status).toBe(416);
    expect(outside.headers.get('content-range')).toBe('bytes */256');

    const missing = await createMediaResponse(join(folder, 'nope.mp4'), null);
    expect(missing.status).toBe(404);
  });
});
