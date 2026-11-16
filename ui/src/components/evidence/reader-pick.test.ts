import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { pickAnchor, pickOf, pickWords } from './reader-pick.ts';

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
