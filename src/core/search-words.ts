// How Otea searches what people wrote (topics, items' threads): by whole words, folding accents
// and plurals, so a search finds a text holding any of its words, the one holding the most first.

// Text as a search compares it: lower case, without accents (migración finds migracion).
const folded = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Words a search skips, Spanish and English: too common to tell one text from another.
const COMMON_WORDS = new Set(
  (
    'a al como con de del el en es esa ese eso esta este esto la las lo los mas no o para pero ' +
    'por que se si sin sobre su sus un una uno unos unas y ' +
    'an and are as at be by for how in is it of on or that the this to what with'
  ).split(' '),
);

// The words of a text as a search compares them: folded, split on anything not a letter or digit.
const wordsOf = (text: string) =>
  folded(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');

// A searched word and its singular, when it reads as a plural: envíos, envio; cases, case;
// paginaciones, paginacion. Short words stay as they are (mes, gas).
function formsOf(word: string): string[] {
  const forms = [word];
  if (word.length > 3 && word.endsWith('s')) forms.push(word.slice(0, -1));
  if (word.length > 4 && word.endsWith('es')) forms.push(word.slice(0, -2));
  return forms;
}

// The words searched, each with its forms: none for a blank search.
export type Searched = readonly (readonly string[])[];

// The words searched, without the common ones, unless they are all common.
export function searchWords(search: string): Searched {
  const words = [...new Set(wordsOf(search))];
  const telling = words.filter((word) => !COMMON_WORDS.has(word));
  return (telling.length > 0 ? telling : words).map(formsOf);
}

// How many of the words searched a text holds. A word matches a whole word of the text, or the
// start of one when it has four letters or more (moto finds motos, pagin paginación).
export function wordsHeld(text: string, searched: Searched): number {
  const words = [...new Set(wordsOf(text))];
  const holds = (form: string) =>
    words.includes(form) || (form.length >= 4 && words.some((word) => word.startsWith(form)));
  return searched.filter((forms) => forms.some(holds)).length;
}
