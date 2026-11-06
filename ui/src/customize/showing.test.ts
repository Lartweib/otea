import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { optionsOf, pick, rowsOf, wordOf } from './showing.ts';

afterEach(() => setLanguage('en'));

const real = [
  { id: 'BUGS-1', title: 'Crash on level two' },
  { id: 'BUGS-2', title: 'Typo in the menu' },
];
const examples = [{ id: 'BUGS-1', title: 'Wall-slide jump drops the buffered input' }];

describe('what the canvas can show', () => {
  it('lists the board real items first, then the examples, even when an id repeats', () => {
    const options = optionsOf(real, examples);
    expect(options.map(({ key, kind }) => [key, kind])).toEqual([
      ['BUGS-1', 'real'],
      ['BUGS-2', 'real'],
      ['example:BUGS-1', 'example'],
    ]);
  });

  it('names a real item by its id and an example as an example', () => {
    const [first, , example] = optionsOf(real, examples);
    expect(first && wordOf(first)).toBe('BUGS-1');
    expect(example && wordOf(example)).toBe('Example: Wall-slide jump drops the buffered input');
    setLanguage('es');
    expect(example && wordOf(example)).toBe('Ejemplo: Wall-slide jump drops the buffered input');
  });

  it('starts on the item it was opened from', () => {
    expect(pick(optionsOf(real, examples), 'BUGS-2')?.key).toBe('BUGS-2');
  });

  it('starts on an example when it was opened from a template, with no item', () => {
    expect(pick(optionsOf(real, examples), undefined)?.key).toBe('example:BUGS-1');
  });

  it('falls back to an example when the item is gone, and to a real item when there is none', () => {
    expect(pick(optionsOf(real, examples), 'BUGS-9')?.key).toBe('example:BUGS-1');
    expect(pick(optionsOf(real, []), undefined)?.key).toBe('BUGS-1');
    expect(pick(optionsOf([], []), 'BUGS-1')).toBeUndefined();
  });

  it('puts the chosen real item first in the list rows and keeps the list short', () => {
    const many = Array.from({ length: 12 }, (_, at) => ({ id: `B-${at}`, title: `t${at}` }));
    const rows = rowsOf(many, 'B-7');
    expect(rows).toHaveLength(8);
    expect(rows[0]?.id).toBe('B-7');
    expect(rowsOf(many, undefined).map(({ id }) => id)).toEqual(
      many.slice(0, 8).map(({ id }) => id),
    );
  });
});
