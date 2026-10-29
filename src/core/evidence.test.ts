import { describe, expect, it } from 'vitest';
import { evidenceTypeOf } from './evidence.ts';

describe('evidenceTypeOf', () => {
  it.each([
    ['repro.gif', 'image', 'image/gif'],
    ['before.png', 'image', 'image/png'],
    ['after.JPG', 'image', 'image/jpeg'],
    ['photo.jpeg', 'image', 'image/jpeg'],
    ['shot.webp', 'image', 'image/webp'],
    ['clip.mp4', 'video', 'video/mp4'],
    ['clip.webm', 'video', 'video/webm'],
    ['clip.mov', 'video', 'video/quicktime'],
    ['fix.diff', 'diff', 'text/x-diff'],
    ['fix.patch', 'diff', 'text/x-diff'],
    ['test.log', 'log', 'text/plain'],
    ['output.txt', 'log', 'text/plain'],
  ])('detects %s as %s (%s)', (filename, kind, contentType) => {
    expect(evidenceTypeOf(filename)).toEqual({ kind, contentType });
  });

  it('keeps svg out of the image kind: it can carry scripts', () => {
    expect(evidenceTypeOf('icon.svg')).toEqual({ kind: 'file', contentType: 'image/svg+xml' });
  });

  it.each(['report.html', 'data.json', 'archive.zip', 'README', 'notes.'])(
    'stores %s as an opaque file',
    (filename) => {
      expect(evidenceTypeOf(filename)).toEqual({
        kind: 'file',
        contentType: 'application/octet-stream',
      });
    },
  );
});
