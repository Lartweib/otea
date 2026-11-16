import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// A round's note stays inside its card: a long link or word breaks where it must (anywhere, so it
// never widens the card's grid), and a code block scrolls inside the card.

const css = readFileSync(new URL('./board-item.css', import.meta.url), 'utf8').replace(/\r/g, '');
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  const open = css.indexOf('{', at);
  return at < 0 ? '' : css.slice(open + 1, css.indexOf('}', open));
};

describe("a round card's note", () => {
  it('breaks a long word or link anywhere', () => {
    expect(rule('.bi-rounds p,\n.bi-rounds .rn')).toMatch(/overflow-wrap: anywhere;/);
    expect(rule('.bi-rounds .rn .md')).toMatch(/overflow-wrap: anywhere;/);
  });

  it('scrolls a code block inside the card', () => {
    const pre = rule('.bi-rounds .rn pre');
    expect(pre).toMatch(/max-width: 100%;/);
    expect(pre).toMatch(/overflow-x: auto;/);
  });
});
