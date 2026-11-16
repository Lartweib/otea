import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { pickAnchor, pickableOn, pickOf, pickOfAnchor, pickWords, spotOf } from './reader-pick.ts';

afterEach(() => setLanguage('en'));

describe('pickOf: what a click in the reader picked', () => {
  it('reads a numbered log line', () => {
    expect(
      pickOf({ line: { number: '12', numbers: ['12'], text: 'ERROR boom', sign: '' } }),
    ).toEqual({ line: 12, quote: 'ERROR boom' });
  });

  it('reads a diff line by its new number, else its old one, without the sign', () => {
    expect(
      pickOf({ line: { numbers: ['4', '5'], text: '+const port = 3000;', sign: '+' } }),
    ).toEqual({ line: 5, quote: 'const port = 3000;' });
    expect(pickOf({ line: { numbers: ['7', ''], text: '-old', sign: '-' } })).toEqual({
      line: 7,
      quote: 'old',
    });
  });

  it('keeps the quote alone when the line has no number, and drops an empty line', () => {
    expect(pickOf({ line: { numbers: [], text: 'plain', sign: '' } })).toEqual({ quote: 'plain' });
    expect(pickOf({ line: { numbers: ['3'], text: '   ', sign: '' } })).toEqual({ line: 3 });
  });

  it('reads a diagram node by its label', () => {
    expect(pickOf({ node: '  Scan QR ' })).toEqual({ node: 'Scan QR' });
    expect(pickOf({})).toBeNull();
  });
});

describe('pickWords and pickAnchor', () => {
  it('says what the note will be on', () => {
    expect(pickWords(null)).toBe('the whole file');
    expect(pickWords({ line: 12, quote: 'x' })).toBe('line 12');
    expect(pickWords({ quote: 'x' })).toBe('the line picked');
    expect(pickWords({ node: 'Scan QR' })).toBe('node “Scan QR”');
    setLanguage('es');
    expect(pickWords({ line: 3 })).toBe('línea 3');
  });

  it('turns a pick into the note anchor of a file', () => {
    expect(pickAnchor(7, { line: 2, quote: 'a' })).toEqual({ evidence: 7, line: 2, quote: 'a' });
    expect(pickAnchor(7, null)).toEqual({ evidence: 7 });
  });
});

describe('pickableOn: what a note can be on inside a file', () => {
  const e = (kind: string, filename: string, contentType = 'application/octet-stream') =>
    ({ kind, filename, contentType }) as Parameters<typeof pickableOn>[0];

  it('a line of a diff, a log or a text file', () => {
    expect(pickableOn(e('diff', 'cambios.diff'))).toBe('line');
    expect(pickableOn(e('log', 'ejecucion.log'))).toBe('line');
    expect(pickableOn(e('file', 'main.ts', 'text/plain'))).toBe('line');
  });

  it('a node of a diagram', () => {
    expect(pickableOn(e('diagram', 'flujo.mmd'))).toBe('node');
  });

  it('a spot of an image', () => {
    expect(pickableOn(e('image', 'a.png', 'image/png'))).toBe('spot');
  });

  it('nothing inside a recording or a document read whole', () => {
    expect(pickableOn(e('video', 'v.webm', 'video/webm'))).toBeNull();
    expect(pickableOn(e('file', 'informe.md', 'text/markdown'))).toBeNull();
    expect(pickableOn(e('file', 'datos.csv', 'text/csv'))).toBeNull();
    expect(pickableOn(e('file', 'proyecto.bin'))).toBeNull();
  });
});

describe('spotOf', () => {
  const box = { left: 100, top: 50, width: 400, height: 200 };

  it('reads a press as a point, in percent of the image from its top left', () => {
    expect(spotOf(box, { x: 236.9, y: 173.6 }, { x: 237, y: 174 }, true)).toEqual({
      x: 34.2,
      y: 61.8,
    });
  });

  it('reads a drag as a zone where zones are allowed, and as a point where they are not', () => {
    expect(spotOf(box, { x: 300, y: 150 }, { x: 180, y: 110 }, true)).toEqual({
      x: 20,
      y: 30,
      w: 30,
      h: 20,
    });
    expect(spotOf(box, { x: 300, y: 150 }, { x: 180, y: 110 }, false)).toEqual({ x: 50, y: 50 });
  });

  it('keeps a zone inside the image and refuses a press outside it', () => {
    expect(spotOf(box, { x: 450, y: 200 }, { x: 900, y: 900 }, true)).toEqual({
      x: 87.5,
      y: 75,
      w: 12.5,
      h: 25,
    });
    expect(spotOf(box, { x: 10, y: 10 }, { x: 10, y: 10 }, true)).toBeNull();
  });

  it('names a point or a zone in a few words, and opens the reader on it', () => {
    expect(pickWords({ x: 3, y: 4 })).toBe('a point of the image');
    expect(pickWords({ x: 3, y: 4, w: 5, h: 6 })).toBe('a zone of the image');
    expect(pickOfAnchor({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
    expect(pickOfAnchor({})).toBeNull();
  });
});
