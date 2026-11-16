import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// On a wide detail the details sit in a rail, label beside value: a long label (a field called
// "Pasos para reproducirlo") wraps inside its column instead of running under the value.

const css = readFileSync(new URL('./sheet.css', import.meta.url), 'utf8').replace(/\r/g, '');
const block = (head: string): string => {
  const at = css.indexOf(`${head} {`);
  if (at < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(at, i);
  }
  return '';
};
const rule = (scope: string, selector: string): string => {
  const at = scope.indexOf(`${selector} {`);
  const open = scope.indexOf('{', at);
  return at < 0 ? '' : scope.slice(open + 1, scope.indexOf('}', open));
};

describe('a detail label in the wide rail', () => {
  it('wraps inside its column', () => {
    const dt = rule(block('@container detail (min-width: 1240px)'), '.dlist dt');
    expect(dt).toMatch(/white-space: normal;/);
    expect(dt).toMatch(/overflow-wrap: anywhere;/);
  });
});

describe('a detail label in the grid', () => {
  it('wraps rather than running into the next cell', () => {
    const dt = rule(css, '\n.dlist dt');
    expect(dt).not.toMatch(/white-space: nowrap;/);
    expect(dt).toMatch(/overflow-wrap: anywhere;/);
  });
});
