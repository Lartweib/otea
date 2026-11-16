import { describe, expect, it } from 'vitest';
import { diffText } from './text-diff.ts';

const words = (n: number, word = 'palabra') => Array.from({ length: n }, () => word).join(' ');

describe('diffText', () => {
  it('marks the words that changed inside a paragraph, keeping the rest as it was', () => {
    const diff = diffText('El gato duerme.\n\nSigue igual.', 'El perro duerme.\n\nSigue igual.');
    expect(diff.mode).toBe('words');
    const [first, second] = diff.blocks;
    expect(first?.kind).toBe('changed');
    expect(first?.kind === 'changed' && first.words).toEqual([
      { op: 'same', text: 'El ' },
      { op: 'del', text: 'gato' },
      { op: 'ins', text: 'perro' },
      { op: 'same', text: ' duerme.' },
    ]);
    expect(second).toEqual({ kind: 'same', text: 'Sigue igual.' });
  });

  it('reads paragraphs that came or went whole', () => {
    const diff = diffText('Uno.\n\nDos.', 'Uno.\n\nTres nuevo.\n\nDos.');
    expect(diff.blocks.map((b) => b.kind)).toEqual(['same', 'added', 'same']);
  });

  it('turns to paragraphs once more than a third of the text changed', () => {
    const before = [words(30, 'viejo'), words(30, 'igual'), words(30, 'viejo')].join('\n\n');
    const after = [words(30, 'nuevo'), words(30, 'igual'), words(30, 'nuevo')].join('\n\n');
    const diff = diffText(before, after);
    expect(diff.changedShare).toBeGreaterThan(1 / 3);
    expect(diff.mode).toBe('paragraphs');
    // Words stay one toggle away.
    expect(diffText(before, after, 'words').mode).toBe('words');
  });

  it('stays on words while a third or less changed', () => {
    const before = [words(30, 'viejo'), words(60, 'igual')].join('\n\n');
    const after = [`${words(29, 'viejo')} nuevo`, words(60, 'igual')].join('\n\n');
    const diff = diffText(before, after);
    expect(diff.changedShare).toBeLessThan(1 / 3);
    expect(diff.mode).toBe('words');
  });

  it('finds nothing changed in the same text', () => {
    const diff = diffText('Hola.\n\nChau.', 'Hola.\n\nChau.');
    expect(diff.changedShare).toBe(0);
    expect(diff.blocks.every((b) => b.kind === 'same')).toBe(true);
  });
});
