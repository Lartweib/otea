import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// A row's node sits at --pt + --lh / 2 (lanes.css `.row .nd`, dom.ts nodeOff). Beside the detail
// the list's rows set a shorter line; a table row keeps its own 40 px line, or every node in Tabla
// sits 9.5 px above its row's centre while an item is open.

const lanes = readFileSync(new URL('./lanes.css', import.meta.url), 'utf8')
  .replace(/\r/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const table = readFileSync(new URL('./table.css', import.meta.url), 'utf8')
  .replace(/\r/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// Every top-level rule whose selector list sets the custom property `prop`.
const setting = (css: string, prop: string): string[] =>
  [...css.matchAll(/\n([^{}\n][^{}]*)\{([^}]*)\}/g)]
    .filter(([, , body]) => new RegExp(`(^|[;\\s])${prop}:`).test(body ?? ''))
    .map(([, sel]) => (sel ?? '').trim());

describe('the line a row hangs its node on, beside the detail', () => {
  it('a table row keeps its 40 px line', () => {
    expect(setting(table, '--lh')).toContain('.trow');
  });

  it('the narrow list shortens only list rows, never a table row', () => {
    const narrow = setting(lanes, '--lh').filter((s) => s.startsWith('.view.narrow'));
    expect(narrow.length).toBeGreaterThan(0);
    for (const s of narrow) {
      // a selector that lands on the row itself must leave .trow out
      const last = s.split(/\s+/).at(-1) ?? '';
      if (last.startsWith('.row')) expect(last).toMatch(/:not\(\.trow\)/);
    }
  });
});
