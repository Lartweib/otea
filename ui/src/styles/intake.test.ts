import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The new item's evidence drop says what to do and, under it, its limits. In a narrow sheet the
// words wrap; a fixed height then left the limits hanging below the dashed box, glued to it.

const read = (file: string) =>
  readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const css = `${read('./detail.css')}\n${read('./intake.css')}`;

// The bodies of every rule whose selector list is exactly `selector`.
const bodies = (selector: string): string[] =>
  [...css.matchAll(/\n([^{}\n@][^{}]*)\{([^}]*)\}/g)]
    .filter(([, sel]) => (sel ?? '').trim() === selector)
    .map(([, , body]) => body ?? '');

describe('the evidence drop of a new item', () => {
  it('grows with its words: no fixed height, slim or not', () => {
    for (const selector of ['.intake-drop', '.intake-drop[data-slim]']) {
      expect(bodies(selector).length).toBeGreaterThan(0);
      for (const body of bodies(selector)) expect(body).not.toMatch(/(^|[;\s])height:/);
    }
  });

  it('keeps the limits inside the box, on their own line under the words', () => {
    expect(bodies('.intake-drop').join('')).toMatch(/display:\s*grid/);
    const limits = bodies('.intake-limits').join('');
    expect(limits).toMatch(/grid-column:\s*2/);
    expect(limits).not.toMatch(/margin-left:\s*auto/);
  });
});
