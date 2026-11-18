import { describe, expect, it } from 'vitest';
import { readerStep } from './arrows.ts';

describe('← and → in the reader (P5-9)', () => {
  const button = { tagName: 'BUTTON', role: null };
  it('step to the file before or after, never past the ends', () => {
    expect(readerStep('ArrowRight', button, 0, 3)).toBe(1);
    expect(readerStep('ArrowLeft', button, 2, 3)).toBe(1);
    expect(readerStep('ArrowLeft', button, 0, 3)).toBeNull();
    expect(readerStep('ArrowRight', button, 2, 3)).toBeNull();
    expect(readerStep('Enter', button, 0, 3)).toBeNull();
  });

  it('leave the keys to a text box and a slider', () => {
    expect(readerStep('ArrowRight', { tagName: 'TEXTAREA' }, 0, 3)).toBeNull();
    expect(readerStep('ArrowRight', { tagName: 'INPUT' }, 0, 3)).toBeNull();
    expect(readerStep('ArrowRight', { tagName: 'DIV', role: 'slider' }, 0, 3)).toBeNull();
    expect(readerStep('ArrowRight', { tagName: 'DIV', editable: true }, 0, 3)).toBeNull();
  });
});
