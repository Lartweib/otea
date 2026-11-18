import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Matrix beside an open item (IDEA3-3, UI2-12, IDEA2-6): at 1440 px with the panel open its
// chips' titles shrank to nothing and its columns were cut, because the side column stayed beside
// the grid (a viewport query) and each chip put its title, «estim.» and id on one line. Now the
// Matrix measures itself: narrow, the side column goes under the grid. A chip gives its title a
// line of its own, over its id, and a title breaks between words.

const read = (f: string) =>
  readFileSync(new URL(f, import.meta.url), 'utf8')
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const css = read('./matrix.css');

const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
};

describe('the Matrix beside an open item', () => {
  it('measures itself, not the window, to put its side column under the grid', () => {
    expect(rule('.matriz')).toMatch(/container:\s*matriz\s*\/\s*inline-size;/);
    expect(css).toMatch(/@container matriz \(max-width: \d+px\) \{\s*\.mx-body \{/);
    expect(css).not.toMatch(/@media \(max-width: 1100px\)/);
  });

  it('gives a chip’s title a line of its own, over its id', () => {
    expect(rule('.mx-chip')).toMatch(/flex-direction:\s*column;/);
    expect(rule('.mx-meta')).toMatch(/display:\s*flex;/);
  });

  it('breaks a title between words, never in the middle of one that fits', () => {
    const title = rule('.mx-t');
    expect(title).not.toMatch(/overflow-wrap:\s*anywhere/);
    expect(title).toMatch(/overflow-wrap:\s*break-word;/);
  });
});
