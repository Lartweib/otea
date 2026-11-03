import { createElement, Fragment, type ReactNode, useSyncExternalStore } from 'react';
import { en } from './en.ts';
import { es } from './es.ts';

// The interface's own words, in English and Spanish. Only the chrome: what a preset names (states,
// fields, types, descriptions) is shown as written, through presetText. The CLI and the API stay in
// English, so a server's error message is shown as it comes.

export type Language = 'en' | 'es';

export const LANGUAGES: readonly Language[] = ['en', 'es'];

// A message with one form per plural category of the language; `other` is always there. The
// number that picks the form is the `{count}` param.
export type Plural = Readonly<Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }>;

type Source = typeof en;

export type MessageKey = keyof Source;

// Every language holds every key, and a plural wherever English has one: a missing or misshaped
// Spanish message fails the typecheck.
export type Catalog = { readonly [K in MessageKey]: Source[K] extends string ? string : Plural };

const CATALOGS: Readonly<Record<Language, Catalog>> = { en, es };

// The params a message takes: the `{name}` holes of every form, and `count` for a plural.
type Holes<S> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Holes<Rest> : never;
type HolesOf<M> = M extends string ? Holes<M> : Holes<M[keyof M]> | 'count';
type Args<K extends MessageKey, V> = [HolesOf<Source[K]>] extends [never]
  ? []
  : [params: { readonly [N in HolesOf<Source[K]>]: N extends 'count' ? number : V }];

// A message without holes: the kind a table of labels holds, to say with t(key) alone.
export type PlainKey = {
  [K in MessageKey]: [HolesOf<Source[K]>] extends [never] ? K : never;
}[MessageKey];

let current: Language = 'en';
const listeners = new Set<() => void>();

export function language(): Language {
  return current;
}

function form(message: string | Plural, count: unknown): string {
  if (typeof message === 'string') return message;
  const rule = new Intl.PluralRules(current).select(typeof count === 'number' ? count : 0);
  return message[rule] ?? message.other;
}

function pieces(key: MessageKey, params: Readonly<Record<string, unknown>>): unknown[] {
  return form(CATALOGS[current][key], params.count)
    .split(/\{(\w+)\}/)
    .map((piece, index) => (index % 2 === 0 ? piece : (params[piece] ?? `{${piece}}`)));
}

// A message in the language on screen, its holes filled.
export function t<K extends MessageKey>(key: K, ...[params]: Args<K, string | number>): string {
  return pieces(key, params ?? {}).join('');
}

// A message whose holes hold elements (a <code>, a <b>), for JSX.
export function tx<K extends MessageKey>(key: K, ...[params]: Args<K, ReactNode>): ReactNode {
  // The pieces of one message never move: their place keys them.
  return pieces(key, params ?? {}).map((piece, index) =>
    createElement(Fragment, { key: index }, piece as ReactNode),
  );
}

// Words a preset wrote (a state, a field's label, a type). They are shown as written; a preset may
// one day give them in other languages (`labels: { es: ... }`), and this is where that would apply.
export function presetText(text: string, labels?: Readonly<Partial<Record<Language, string>>>) {
  return labels?.[current] ?? text;
}

// Several values as one phrase: `a, b and c` in the language on screen.
export function listOf(values: readonly string[]): string {
  return new Intl.ListFormat(current, { type: 'conjunction' }).format(values);
}

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

// The language to start in: one asked for in the address (`?lang=es`), then the one chosen before,
// then the first the browser prefers that Otea speaks (any es-* is es), then English.
export function chooseLanguage({
  asked,
  stored,
  preferred,
}: {
  asked?: string | null | undefined;
  stored?: string | null | undefined;
  preferred?: readonly string[] | undefined;
}): Language {
  if (isLanguage(asked)) return asked;
  if (isLanguage(stored)) return stored;
  const spoken = (preferred ?? []).map((tag) => tag.split('-')[0]?.toLowerCase()).find(isLanguage);
  return spoken ?? 'en';
}

export const LANGUAGE_KEY = 'otea.language';

// Reading window.localStorage itself can throw when site data is blocked.
function readStored(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
}

function store(next: Language): void {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, next);
  } catch {
    // The language still applies to this tab; it just will not be remembered.
  }
}

function apply(next: Language): void {
  current = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const listener of listeners) listener();
}

// Switches the interface's language and remembers it in this browser.
export function setLanguage(next: Language): void {
  store(next);
  apply(next);
}

// What Preferences offers: a language of its own, or auto, which follows the browser.
export type LanguageChoice = Language | 'auto';

// The choice this browser made: the language it remembers, auto when it remembers none.
export function languageChoice(): LanguageChoice {
  const stored = readStored();
  return isLanguage(stored) ? stored : 'auto';
}

// Applies a choice from Preferences. Auto forgets the remembered language and follows the browser.
export function chooseLanguageSetting(choice: LanguageChoice): void {
  if (choice !== 'auto') {
    setLanguage(choice);
    return;
  }
  try {
    window.localStorage.removeItem(LANGUAGE_KEY);
  } catch {
    // Nothing was remembered, or nothing can be: the browser's language applies either way.
  }
  apply(chooseLanguage({ preferred: navigator.languages }));
}

// The language auto would pick in this browser.
export function browserLanguage(): Language {
  return chooseLanguage({ preferred: typeof navigator === 'undefined' ? [] : navigator.languages });
}

// Once, before the first render: `?lang=` is read and remembered, so the address can drop it.
export function startLanguage(): void {
  const asked = new URLSearchParams(window.location.search).get('lang');
  if (isLanguage(asked)) store(asked);
  apply(chooseLanguage({ asked, stored: readStored(), preferred: navigator.languages }));
}

// The language on screen; a component that reads it renders again when it changes.
export function useLanguage(): Language {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    language,
    language,
  );
}
