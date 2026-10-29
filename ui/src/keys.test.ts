import { describe, expect, it } from 'vitest';
import { type KeyPress, keyCommand, stepSelection } from './keys.ts';

const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  target: 'body',
  ...extra,
});

describe('keyCommand', () => {
  it('toggles focus with f, in and out', () => {
    expect(keyCommand(press('f'), { focus: false })).toBe('toggle-focus');
    expect(keyCommand(press('f'), { focus: true })).toBe('toggle-focus');
  });

  it('leaves focus with Escape, and ignores Escape outside focus', () => {
    expect(keyCommand(press('Escape'), { focus: true })).toBe('leave-focus');
    expect(keyCommand(press('Escape'), { focus: false })).toBeUndefined();
  });

  it('moves the selection with j and k', () => {
    expect(keyCommand(press('j'), { focus: false })).toBe('next');
    expect(keyCommand(press('k'), { focus: true })).toBe('previous');
  });

  it.each(['input', 'textarea', 'select', 'editable'] as const)(
    'ignores keys while typing in %s',
    (target) => {
      expect(keyCommand(press('f', { target }), { focus: false })).toBeUndefined();
      expect(keyCommand(press('Escape', { target }), { focus: true })).toBeUndefined();
      expect(keyCommand(press('j', { target }), { focus: false })).toBeUndefined();
    },
  );

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('ignores keys held with %s', (modifier) => {
    expect(keyCommand(press('f', { [modifier]: true }), { focus: false })).toBeUndefined();
    expect(keyCommand(press('j', { [modifier]: true }), { focus: false })).toBeUndefined();
  });

  it('ignores other keys and shifted letters', () => {
    expect(keyCommand(press('F'), { focus: false })).toBeUndefined();
    expect(keyCommand(press('x'), { focus: false })).toBeUndefined();
  });
});

describe('stepSelection', () => {
  const order = ['A-1', 'A-2', 'A-3'];

  it('moves to the next and the previous item', () => {
    expect(stepSelection(order, 'A-2', 1)).toBe('A-3');
    expect(stepSelection(order, 'A-2', -1)).toBe('A-1');
  });

  it('stops at both ends instead of wrapping', () => {
    expect(stepSelection(order, 'A-3', 1)).toBe('A-3');
    expect(stepSelection(order, 'A-1', -1)).toBe('A-1');
  });

  it('starts at the first item when nothing (or an item not in the list) is selected', () => {
    expect(stepSelection(order, undefined, 1)).toBe('A-1');
    expect(stepSelection(order, undefined, -1)).toBe('A-1');
    expect(stepSelection(order, 'B-9', 1)).toBe('A-1');
  });

  it('has nothing to select in an empty list', () => {
    expect(stepSelection([], 'A-1', 1)).toBeUndefined();
  });
});
