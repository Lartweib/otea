import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// A board's name heads the editor on one line: a long one gets smaller to fit its width instead of
// being cut mid-letter inside its field.

const css = readFileSync(new URL('./studio-editor.css', import.meta.url), 'utf8')
  .replace(/\r/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
};

describe("the board's name in the editor", () => {
  it('sizes its line as a container', () => {
    expect(rule('.se-nameline')).toMatch(/container-type: inline-size;/);
  });

  it('shrinks with its length to fit the line', () => {
    expect(rule('input.se-bigname')).toMatch(/font-size: min\(50px, [^;]*100cqi[^;]*var\(--n/);
  });
});
