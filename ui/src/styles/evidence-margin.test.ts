import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The evidence margin is 96px wide. Its buttons (Read one by one, Attach) wrap inside it: on one
// line, the English Read one by one ran into the diff tools beside it at 1440.

const css = readFileSync(new URL('./sheet.css', import.meta.url), 'utf8').replace(/\r/g, '');
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  const open = css.indexOf('{', at);
  return at < 0 ? '' : css.slice(open + 1, css.indexOf('}', open));
};

describe('a button in the evidence margin', () => {
  it('wraps inside the margin, lined up with its label', () => {
    const body = rule('.sheet section.evidence > .margin-label .btn');
    expect(body).toMatch(/max-width: 100%;/);
    expect(body).toMatch(/white-space: normal;/);
    expect(body).toMatch(/height: auto;/);
    expect(body).toMatch(/padding: 6px 0;/);
  });
});
