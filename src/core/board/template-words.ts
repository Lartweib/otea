// The two languages a template speaks, and the helpers its data is written with.

export type Lang = 'en' | 'es';

export const LANGS: readonly Lang[] = ['en', 'es'];

export type Words = Readonly<Record<Lang, string>>;

export const w = (en: string, es: string): Words => ({ en, es });

export const EMPTY = w('', '');

export const TITLE_NAME: Words = w('Title', 'Título');

// A level's values as a board in each language says them (Severidad: media), keyed as stored.
export const LEVEL_SAID: Readonly<Record<Lang, Readonly<Record<string, string>>>> = {
  en: { low: 'low', medium: 'medium', high: 'high', critical: 'critical' },
  es: { low: 'baja', medium: 'media', high: 'alta', critical: 'crítica' },
};

// An effort as the Matrix weighs it: a size, in order, never a level («crítica» reads as a
// priority). Its options and their keys, for a choice part.
export const EFFORT_SIZES = {
  options: [
    w('Small', 'Pequeño'),
    w('Medium', 'Mediano'),
    w('Large', 'Grande'),
    w('Huge', 'Enorme'),
  ],
  optionKeys: ['s', 'm', 'l', 'xl'],
} as const;

// A yes-or-no field's values, as the board says them.
export const YES_NO_SAID: Readonly<Record<Lang, string>> = { en: 'yes or no', es: 'sí or no' };
