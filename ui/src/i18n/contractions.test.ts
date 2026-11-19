import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { es } from './es.ts';

// P7-R3-4: the sheet said «Le dejaste una nota a el agente». Spanish contracts «a el» to «al» and
// «de el» to «del», so no message reads «a el» or «de el», and a phrase that starts with «el» («el
// agente», said for an agent with no name yet; «el formulario») never fills a hole that follows «a» or
// «de». Where it would, the message gets its own wording for that case (notes.sentAny), as
// notes.leaveSaysAny does: no message is patched up from its pieces.

const UNCONTRACTED = /(?<!\p{L})(?:a|de) el(?!\p{L})/iu;
const AFTER_A_OR_DE = /(?<!\p{L})(?:a|de) \{(\w+)\}/giu;

const formsOf = (key: string): string[] => {
  const value = (es as Readonly<Record<string, string | Readonly<Record<string, string>>>>)[key];
  return value === undefined ? [] : typeof value === 'string' ? [value] : Object.values(value);
};

// The phrases that start with «el»: the ones that would read «a el» put after «a».
const ARTICLED = new Set(
  Object.keys(es).filter((key) => formsOf(key).some((form) => /^el(?!\p{L})/iu.test(form))),
);

// The holes a message has right after «a» or «de», in any of its forms.
const holesAfterAOrDe = (key: string): Set<string> =>
  new Set(formsOf(key).flatMap((form) => [...form.matchAll(AFTER_A_OR_DE)].map((m) => m[1] ?? '')));

const CLOSE: Readonly<Record<string, string>> = { '(': ')', '{': '}', '[': ']' };

// Where the string literal that opens at `at` ends.
function stringEnd(src: string, at: number): number {
  const quote = src[at];
  for (let i = at + 1; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === quote) return i;
  }
  return src.length;
}

// What sits inside the bracket that opens at `at`, cut at its commas outside any bracket or string.
function insideOf(src: string, at: number): string[] {
  const pieces: string[] = [];
  const open: string[] = [];
  let from = at + 1;
  for (let i = at; i < src.length; i++) {
    const c = src[i] ?? '';
    if (c === "'" || c === '"' || c === '`') i = stringEnd(src, i);
    else if (CLOSE[c]) open.push(CLOSE[c]);
    else if (c === open.at(-1)) {
      open.pop();
      if (!open.length) return [...pieces, src.slice(from, i)];
    } else if (c === ',' && open.length === 1) {
      pieces.push(src.slice(from, i));
      from = i + 1;
    }
  }
  return pieces;
}

const callOf = (keys: ReadonlySet<string>) => (text: string) =>
  [...text.matchAll(/\btx?\(\s*'([\w.]+)'/g)].some(([, key]) => keys.has(key ?? ''));

// Every t('key', { hole: … }) and tx(…) of the UI whose hole follows «a» or «de» in Spanish, and
// whether what fills it can be a phrase that starts with «el»: a t() of one, or a name the same
// file binds to an expression holding one (`const who = noteTo ?? t('notes.anyAgent')`).
function holesFilled() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
  );
  const articled = callOf(ARTICLED);
  const checked: { at: string; articled: boolean }[] = [];
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8');
    const bound = [...src.matchAll(/\b(?:const|let)\s+(\w+)\s*=([^;]*)/g)]
      .filter(([, , init]) => articled(init ?? ''))
      .map(([, name]) => name ?? '');
    const names = bound.map((name) => new RegExp(`(?<![\\w.$])${name}(?![\\w$])`));
    for (const call of src.matchAll(/\btx?\(\s*'([\w.]+)'\s*,\s*\{/g)) {
      const key = call[1] ?? '';
      const holes = holesAfterAOrDe(key);
      if (!holes.size) continue;
      for (const prop of insideOf(src, (call.index ?? 0) + call[0].length - 1)) {
        const [, name, value] = /^\s*(\w+)\s*(?::([\s\S]*))?$/.exec(prop) ?? [];
        if (!name || !holes.has(name)) continue;
        const fill = value ?? name;
        checked.push({
          at: `${file.replaceAll('\\', '/')}: ${key} {${name}}`,
          articled: articled(fill) || names.some((n) => n.test(fill)),
        });
      }
    }
  }
  return checked;
}

describe('Spanish contracts «a el» to «al» and «de el» to «del»', () => {
  it('writes no message that reads «a el» or «de el»', () => {
    const uncontracted = Object.keys(es).filter((key) =>
      formsOf(key).some((form) => UNCONTRACTED.test(form)),
    );
    expect(uncontracted).toEqual([]);
  });

  it('never fills a hole after «a» or «de» with a phrase that starts with «el»', () => {
    const checked = holesFilled();
    // It reads the calls it checks: the UI fills such holes in nearly two hundred places.
    expect(checked.length).toBeGreaterThan(100);
    expect(checked.filter((c) => c.articled).map((c) => c.at)).toEqual([]);
  });
});
