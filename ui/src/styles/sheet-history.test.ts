import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Historial: the time column is as wide as the widest time in the list ("hoy 23:30",
// "yesterday 23:30", "12 nov 23:30"), shared by every line, so a time never touches its text and
// the texts stay aligned.

const css = readFileSync(new URL('./sheet.css', import.meta.url), 'utf8').replace(/\r/g, '');

const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
};

describe('Historial time column', () => {
  it('is one grid for the whole list, sized by its widest time', () => {
    expect(rule('.tl')).toMatch(/display: grid;/);
    expect(rule('.tl')).toMatch(
      /grid-template-columns: 22px minmax\(64px, max-content\) minmax\(0, 1fr\);/,
    );
  });

  it('is shared by every line', () => {
    expect(rule('.tl li')).toMatch(/grid-column: 1 \/ -1;/);
    expect(rule('.tl li')).toMatch(/grid-template-columns: subgrid;/);
  });

  it('keeps a gap between the time and its text', () => {
    expect(rule('.tl li .tm')).toMatch(/padding-right: 12px;/);
    expect(rule('.tl li .tm')).toMatch(/white-space: nowrap;/);
  });
});
