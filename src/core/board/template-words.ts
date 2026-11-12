// The two languages a template speaks, and the helpers its data is written with.

export type Lang = 'en' | 'es';

export const LANGS: readonly Lang[] = ['en', 'es'];

export type Words = Readonly<Record<Lang, string>>;

export const w = (en: string, es: string): Words => ({ en, es });

export const EMPTY = w('', '');

export const TITLE_NAME: Words = w('Title', 'Título');
