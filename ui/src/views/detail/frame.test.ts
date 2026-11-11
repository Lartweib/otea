import { describe, expect, it } from 'vitest';
import {
  dividerBounds,
  dividerKey,
  intakeTarget,
  moreOf,
  penPath,
  shortTitle,
  toastOf,
} from './frame.ts';

describe('the divider (mock:3220-3255)', () => {
  it('keeps the list between 340 and the room less the divider and 440 for the sheet', () => {
    expect(dividerBounds(1440 - 260)).toEqual([340, 731]);
    expect(dividerBounds(600)).toEqual([340, 340]);
  });

  it('steps 16 with the arrows, 64 with shift, to the ends with Home and End, home with Enter', () => {
    const b: [number, number] = [340, 731];
    expect(dividerKey('ArrowLeft', false, 520, b)).toEqual({ w: 504 });
    expect(dividerKey('ArrowRight', true, 520, b)).toEqual({ w: 584 });
    expect(dividerKey('ArrowLeft', true, 360, b)).toEqual({ w: 340 });
    expect(dividerKey('Home', false, 520, b)).toEqual({ w: 340 });
    expect(dividerKey('End', false, 520, b)).toEqual({ w: 731 });
    expect(dividerKey('Enter', false, 520, b)).toBe('home');
    expect(dividerKey('a', false, 520, b)).toBeNull();
  });
});

describe('the pen (mock:2845-2863)', () => {
  it('runs from the row across the divider, turns down with a 9 px radius into the headline', () => {
    const p = penPath({ x0: 500, y0: 300.5, xs: 547.5, xe: 561, y1: 120.5 });
    expect(p.d).toBe('M500 300.5H538.5Q547.5 300.5 547.5 291.5V129.5Q547.5 120.5 556.5 120.5H561');
    expect(p.len).toBe(61 + 180);
  });

  it('bends with an S when the row and the headline are almost level', () => {
    expect(penPath({ x0: 500, y0: 120.5, xs: 547.5, xe: 561, y1: 130.5 }).d).toBe(
      'M500 120.5H527.5C547.5 120.5 547.5 130.5 567.5 130.5H561',
    );
  });
});

describe('the details', () => {
  it('shows five, then says how many more', () => {
    expect(moreOf(9)).toBe(4);
    expect(moreOf(5)).toBe(0);
  });
});

describe('the toast after a move, and its Undo', () => {
  it('names the move and where the item goes', () => {
    expect(toastOf('approve', 'Los lobos no cruzan', 'fixed')).toBe(
      'You approved “Los lobos no cruzan”. On to fixed.',
    );
    expect(toastOf('sendback', 'X', 'fixing')).toBe(
      'You sent “X” back to fixing, with your notes.',
    );
    expect(toastOf('discard', 'X', 'rejected')).toBe('You discarded “X”: rejected.');
  });

  it('cuts a long title', () => {
    expect(shortTitle('a'.repeat(60))).toBe(`${'a'.repeat(44)}…`);
  });
});

describe('the sheet after Crear (mock:3990)', () => {
  it('shows the form until the created item is the one the place asks for, so the sheet swaps', () => {
    expect(intakeTarget(true, null, null)).toBe('intake');
    expect(intakeTarget(false, null, 'ERR-9')).toBe('intake');
    expect(intakeTarget(false, 'ERR-1', 'ERR-9')).toBe('intake');
    expect(intakeTarget(false, 'ERR-9', 'ERR-9')).toBe('ERR-9');
  });

  it('follows the place otherwise', () => {
    expect(intakeTarget(false, 'ERR-1', null)).toBe('ERR-1');
    expect(intakeTarget(false, null, null)).toBeNull();
  });
});
