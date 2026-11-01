export type ThemeChoice = 'system' | 'light' | 'dark';

export type Theme = 'light' | 'dark';

export type ThemeStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const THEME_KEY = 'otea.theme';

const ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export function nextChoice(choice: ThemeChoice): ThemeChoice {
  return ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length] ?? 'system';
}

export function parseChoice(raw: string | null): ThemeChoice {
  return ORDER.find((choice) => choice === raw) ?? 'system';
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  if (choice === 'system') return prefersDark ? 'dark' : 'light';
  return choice;
}

// System to light on a light system changes the choice but nothing on screen.
export function shownChanges(from: ThemeChoice, to: ThemeChoice, prefersDark: boolean): boolean {
  return resolveTheme(from, prefersDark) !== resolveTheme(to, prefersDark);
}

export function themeLabel(choice: ThemeChoice): string {
  return `Theme: ${choice}`;
}

// Storage can be missing or throw (private windows, blocked site data): the theme then just follows the system.
export function readChoice(storage: ThemeStorage | undefined): ThemeChoice {
  try {
    return parseChoice(storage?.getItem(THEME_KEY) ?? null);
  } catch {
    return 'system';
  }
}

export function writeChoice(storage: ThemeStorage | undefined, choice: ThemeChoice): void {
  try {
    storage?.setItem(THEME_KEY, choice);
  } catch {
    // The choice still applies to this tab; it just will not be remembered.
  }
}
