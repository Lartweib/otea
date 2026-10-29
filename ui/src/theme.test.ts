import { describe, expect, it } from 'vitest';
import {
  nextChoice,
  parseChoice,
  readChoice,
  resolveTheme,
  THEME_KEY,
  themeLabel,
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

describe('nextChoice', () => {
  it('cycles system, light, dark and back to system', () => {
    expect(nextChoice('system')).toBe('light');
    expect(nextChoice('light')).toBe('dark');
    expect(nextChoice('dark')).toBe('system');
  });
});

describe('parseChoice', () => {
  it('accepts the three known choices', () => {
    expect(parseChoice('system')).toBe('system');
    expect(parseChoice('light')).toBe('light');
    expect(parseChoice('dark')).toBe('dark');
  });

  it('falls back to system for anything else', () => {
    expect(parseChoice(null)).toBe('system');
    expect(parseChoice('')).toBe('system');
    expect(parseChoice('sepia')).toBe('system');
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

describe('themeLabel', () => {
  it('names the current choice', () => {
    expect(themeLabel('system')).toBe('Theme: system');
    expect(themeLabel('light')).toBe('Theme: light');
    expect(themeLabel('dark')).toBe('Theme: dark');
  });
});

describe('readChoice', () => {
  it('reads a stored choice', () => {
    expect(readChoice(memory({ [THEME_KEY]: 'dark' }))).toBe('dark');
  });

  it('defaults to system when nothing or garbage is stored', () => {
    expect(readChoice(memory())).toBe('system');
    expect(readChoice(memory({ [THEME_KEY]: 'neon' }))).toBe('system');
  });

  it('defaults to system when storage is missing or throws', () => {
    expect(readChoice(undefined)).toBe('system');
    expect(readChoice(broken)).toBe('system');
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
