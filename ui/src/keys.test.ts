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
  it('folds and unfolds the collections sidebar with f', () => {
    expect(keyCommand(press('f'))).toBe('toggle-sidebar');
  });

  it('moves the selection with j and k', () => {
    expect(keyCommand(press('j'))).toBe('next');
    expect(keyCommand(press('k'))).toBe('previous');
  });

  it.each(['input', 'textarea', 'select', 'editable'] as const)(
    'ignores keys while typing in %s',
    (target) => {
      expect(keyCommand(press('f', { target }))).toBeUndefined();
      expect(keyCommand(press('j', { target }))).toBeUndefined();
    },
  );

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('ignores keys held with %s', (modifier) => {
    expect(keyCommand(press('f', { [modifier]: true }))).toBeUndefined();
    expect(keyCommand(press('j', { [modifier]: true }))).toBeUndefined();
  });

  it('ignores other keys, shifted letters and Escape (there is no focus mode to leave)', () => {
    expect(keyCommand(press('F'))).toBeUndefined();
    expect(keyCommand(press('x'))).toBeUndefined();
    expect(keyCommand(press('Escape'))).toBeUndefined();
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
