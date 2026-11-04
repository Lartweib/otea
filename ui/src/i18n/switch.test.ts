import { afterEach, describe, expect, it, vi } from 'vitest';
import { language, setLanguage } from './i18n.ts';

// A page whose View Transitions run their update at once and report when they finished.
function page({ reduced = false, transitions = true } = {}) {
  const attributes = new Map<string, string>();
  const root = {
    lang: 'en',
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  };
  const seen: { during: Set<string>; languageInUpdate?: string } = { during: new Set() };
  const startViewTransition = vi.fn((update: () => void) => {
    seen.during = new Set(attributes.keys());
    update();
    seen.languageInUpdate = language();
    return {
      finished: Promise.resolve(),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: () => {},
    };
  });
  vi.stubGlobal('document', {
    documentElement: root,
    ...(transitions ? { startViewTransition } : {}),
  });
  vi.stubGlobal('window', {
    localStorage: { getItem: () => null, setItem: () => {} },
    matchMedia: (query: string) => ({ matches: reduced && query.includes('reduce') }),
  });
  return { root, attributes, startViewTransition, seen };
}

afterEach(() => {
  vi.unstubAllGlobals();
  setLanguage('en');
});

describe('setLanguage', () => {
  it('crossfades the page into the new language with a View Transition', async () => {
    const { root, attributes, startViewTransition, seen } = page();

    setLanguage('es');

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    // The page is in Spanish once the update ran, marked as a language switch while it fades.
    expect(seen.languageInUpdate).toBe('es');
    expect(seen.during.has('data-language-switching')).toBe(true);
    expect(root.lang).toBe('es');
    await Promise.resolve();
    await Promise.resolve();
    expect(attributes.has('data-language-switching')).toBe(false);
  });

  it('switches at once under reduced motion', () => {
    const { root, startViewTransition } = page({ reduced: true });

    setLanguage('es');

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(language()).toBe('es');
    expect(root.lang).toBe('es');
  });

  it('switches at once where the browser has no View Transitions', () => {
    page({ transitions: false });

    setLanguage('es');

    expect(language()).toBe('es');
  });

  it('does nothing on screen when the language is already the one shown', () => {
    const { startViewTransition } = page();

    setLanguage('en');

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(language()).toBe('en');
  });
});
