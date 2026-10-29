import { readChoice, type ThemeChoice, type ThemeStorage, writeChoice } from './theme.ts';

// Reading window.localStorage itself can throw when site data is blocked.
function browserStorage(): ThemeStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// System is the default: no attribute, the stylesheet follows prefers-color-scheme.
export function applyChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function loadChoice(): ThemeChoice {
  return readChoice(browserStorage());
}

export function saveChoice(choice: ThemeChoice): void {
  writeChoice(browserStorage(), choice);
  applyChoice(choice);
}
