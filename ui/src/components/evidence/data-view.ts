import { language } from '../../i18n/i18n.ts';

// Data files read as data: a CSV or TSV as rows of cells, sorted on request.

// Rows of a delimited file (RFC 4180): a quoted cell may hold the delimiter, line breaks and a
// doubled quote; CRLF and LF both end a row; a trailing line break adds no empty row.
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let at = 0;
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  while (at < text.length) {
    const ch = text[at] ?? '';
    if (quoted) {
      if (ch === '"' && text[at + 1] === '"') {
        cell += '"';
        at += 2;
        continue;
      }
      if (ch === '"') quoted = false;
      else cell += ch;
      at += 1;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) endCell();
    else if (ch === '\r' && text[at + 1] === '\n') {
      endRow();
      at += 1;
    } else if (ch === '\n') endRow();
    else cell += ch;
    at += 1;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

const collators = new Map<string, Intl.Collator>();

function collatorOf(lang: string): Intl.Collator {
  let made = collators.get(lang);
  if (!made) {
    made = new Intl.Collator(lang, { numeric: true, sensitivity: 'base' });
    collators.set(lang, made);
  }
  return made;
}

// Numbers by their value, words in the alphabet of the page's language (Spanish puts ñ after n); an
// empty cell after everything.
export function compareCells(a: string, b: string): number {
  if (a === '' || b === '') return a === b ? 0 : a === '' ? 1 : -1;
  const x = Number(a);
  const y = Number(b);
  if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  return collatorOf(language()).compare(a, b);
}
