import { describe, expect, it } from 'vitest';
import {
  parseChoice,
  readChoice,
  resolveTheme,
  shownChanges,
  switchMotion,
  THEME_KEY,
  writeChoice,
} from './theme.ts';

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
};

const broken = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('parseChoice', () => {
  // It accepts the three known choices and falls back to system for anything else.
  it.each([
    ['system', 'system'],
    ['light', 'light'],
    ['dark', 'dark'],
    [null, 'system'],
    ['', 'system'],
    ['sepia', 'system'],
  ])('reads %j as %s', (raw, choice) => {
    expect(parseChoice(raw)).toBe(choice);
  });
});

describe('resolveTheme', () => {
  it('follows the system preference when the choice is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('ignores the system preference for an explicit choice', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('readChoice', () => {
  // It reads a stored choice, and defaults to system when nothing or garbage is stored, or when
  // storage is missing or throws.
  it.each([
    ['a stored choice', memory({ [THEME_KEY]: 'dark' }), 'dark'],
    ['nothing stored', memory(), 'system'],
    ['garbage stored', memory({ [THEME_KEY]: 'neon' }), 'system'],
    ['no storage', undefined, 'system'],
    ['storage that throws', broken, 'system'],
  ])('reads %s as %s', (_, storage, choice) => {
    expect(readChoice(storage)).toBe(choice);
  });
});

describe('writeChoice', () => {
  it('stores the choice', () => {
    const storage = memory();
    writeChoice(storage, 'light');
    expect(storage.data[THEME_KEY]).toBe('light');
  });

  it('does not throw when storage is missing or throws', () => {
    expect(() => writeChoice(undefined, 'dark')).not.toThrow();
    expect(() => writeChoice(broken, 'dark')).not.toThrow();
  });
});

describe('shownChanges', () => {
  it('is true when the theme on screen changes', () => {
    expect(shownChanges('light', 'dark', false)).toBe(true);
    expect(shownChanges('system', 'light', true)).toBe(true);
    expect(shownChanges('dark', 'system', false)).toBe(true);
  });

  it('is false when the choice changes but the screen does not', () => {
    expect(shownChanges('system', 'light', false)).toBe(false);
    expect(shownChanges('dark', 'system', true)).toBe(false);
    expect(shownChanges('light', 'light', true)).toBe(false);
  });
});

describe('switchMotion', () => {
  const env = { prefersDark: false, reduced: false, transitions: true, mask: true };

  it('grows the new theme as a circle with a feathered edge when the theme on screen changes', () => {
    expect(switchMotion('light', 'dark', env)).toBe('mask');
  });

  it('grows a hard-edged circle where a mask cannot feather it', () => {
    expect(switchMotion('light', 'dark', { ...env, mask: false })).toBe('clip');
  });

  it('crossfades the colours without View Transitions', () => {
    expect(switchMotion('light', 'dark', { ...env, transitions: false })).toBe('fade');
  });

  it('swaps at once under reduced motion, or when the screen does not change', () => {
    expect(switchMotion('light', 'dark', { ...env, reduced: true })).toBe('instant');
    expect(switchMotion('system', 'light', env)).toBe('instant');
  });
});
