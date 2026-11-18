import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import {
  pickAnchor,
  pickableOn,
  pickHint,
  pickOf,
  pickOfAnchor,
  pickWords,
  revealUpright,
  spotOf,
} from './reader-pick.ts';

afterEach(() => setLanguage('en'));

const e = (kind: string, filename: string, contentType = 'application/octet-stream') =>
  ({ kind, filename, contentType }) as Parameters<typeof pickableOn>[0];

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

  it('says a phrase of a document and a zone of a PDF page (P5-6)', () => {
    expect(pickWords({ quote: 'Never stretch the logo.', phrase: true })).toBe(
      'the phrase “Never stretch the logo.”',
    );
    expect(pickWords({ quote: 'x'.repeat(80), phrase: true })).toBe(
      `the phrase “${'x'.repeat(47)}…”`,
    );
    expect(pickWords({ page: 2, x: 1, y: 2, w: 3, h: 4 })).toBe('a zone of page 2');
    expect(pickWords({ page: 1, x: 1, y: 2 })).toBe('a point of page 1');
    setLanguage('es');
    expect(pickWords({ page: 2, x: 1, y: 2, w: 3, h: 4 })).toBe('una zona de la página 2');
  });

  it('keeps the page of a PDF note when it opens the reader there', () => {
    expect(pickOfAnchor({ page: 2, x: 1, y: 2 })).toEqual({ page: 2, x: 1, y: 2 });
  });

  it('turns a pick into the note anchor of a file', () => {
    expect(pickAnchor(7, { line: 2, quote: 'a' })).toEqual({ evidence: 7, line: 2, quote: 'a' });
    expect(pickAnchor(7, null)).toEqual({ evidence: 7 });
  });
});

describe('pickableOn: what a note can be on inside a file', () => {
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

  it('a phrase of a Markdown document, and a spot of a PDF page (P5-6)', () => {
    expect(pickableOn(e('file', 'informe.md', 'text/markdown'))).toBe('phrase');
    expect(pickableOn(e('file', 'manual.pdf', 'application/pdf'))).toBe('spot');
  });

  it('nothing inside a recording or a document read whole', () => {
    expect(pickableOn(e('video', 'v.webm', 'video/webm'))).toBeNull();
    expect(pickableOn(e('file', 'datos.csv', 'text/csv'))).toBeNull();
    expect(pickableOn(e('file', 'proyecto.bin'))).toBeNull();
  });
});

describe('pickHint: what the note box says a click does on the file shown', () => {
  it('names only what the file takes: a line, a node, a point, or the whole file', () => {
    setLanguage('es');
    expect(pickHint(e('log', 'a.log'), false)).toBe('Haz clic en una línea para anclar la nota.');
    expect(pickHint(e('diagram', 'flujo.mmd'), true)).toBe(
      'Toca un nodo del diagrama para anclar la nota.',
    );
    expect(pickHint(e('image', 'a.png', 'image/png'), true)).toBe(
      'Toca la imagen para marcar un punto.',
    );
    expect(pickHint(e('file', 'guia.md', 'text/markdown'), true)).toBe(
      'Toca un párrafo para anclar la nota.',
    );
    expect(pickHint(e('file', 'datos.bin'), true)).toBe(
      'Este tipo de archivo se comenta entero, sin marcar una parte.',
    );
    setLanguage('en');
    expect(pickHint(e('file', 'guia.md', 'text/markdown'), false)).toBe(
      'Click a paragraph, or select a phrase, to anchor the note.',
    );
    expect(pickHint(e('file', 'informe.pdf', 'application/pdf'), false)).toBe(
      'Click a page to mark a point, or drag over it to mark a zone.',
    );
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

describe('revealUpright', () => {
  it('scrolls the picked line into view up or down, never sideways', () => {
    const well = { scrollLeft: 0, parentElement: null };
    const row = { scrollLeft: 0, parentElement: well };
    const line = {
      parentElement: row,
      scrollIntoView: () => {
        well.scrollLeft = 47;
        row.scrollLeft = 3;
      },
    };
    revealUpright(line as unknown as HTMLElement);
    expect([well.scrollLeft, row.scrollLeft]).toEqual([0, 0]);
  });
});
