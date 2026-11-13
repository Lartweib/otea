import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// A view's reading column on a wide screen (Te toca's panel, a board): it keeps its width and sits
// in the middle of the main pane; beside an open item it compacts on the left of the detail again,
// carried there by the list's relayout. A board's column takes the width of the view it shows.

const read = (f: string) =>
  readFileSync(new URL(f, import.meta.url), 'utf8')
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const frame = read('./frame.css');
const toca = read('./toca.css');
const board = read('./board.css');

// The body of the rule whose whole selector is `selector`, anywhere in `css`.
const rule = (css: string, selector: string): string => {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
};
// The block of an at-rule, from its opening brace to the matching one.
const atBlock = (css: string, head: string): string => {
  const at = css.indexOf(`${head} {`);
  if (at < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', at) + 1, i);
  }
  return '';
};
const px = (body: string, prop: string) =>
  Number(new RegExp(`${prop}:\\s*(\\d+)px`).exec(body)?.[1] ?? Number.NaN);

describe('one centring for every reading column', () => {
  it('centres the panel and the board while nothing is open', () => {
    expect(rule(frame, '.view:not(.narrow) :is(.panel, .board, .sh, .se, .tri)')).toMatch(
      /margin-inline: auto;/,
    );
  });

  it('is not a second rule of the panel’s own', () => {
    expect(toca).not.toMatch(/margin-inline/);
  });
});

describe('a board on a wide screen', () => {
  const wide = atBlock(board, '@media (min-width: 1441px)');

  it('is a column only above a 1440 desktop', () => {
    expect(rule(wide, '.view:not(.narrow) .board')).toMatch(/max-width: var\(--board-w\);/);
    expect(rule(board, '.board')).not.toMatch(/max-width/);
  });

  it('reads at the list’s width in Lista: the list fills the column, so it ends where the tools end', () => {
    expect(px(rule(board, '.board[data-mode="lista"]'), '--board-w')).toBe(1120);
    expect(board).not.toMatch(/\.lista \.lanes\s*\{[^}]*max-width/);
  });

  it('widens for Pasos and more for Tabla, to a bound', () => {
    const w = (m: string) => px(rule(board, `.board[data-mode="${m}"]`), '--board-w');
    expect(w('pasos')).toBeGreaterThan(w('lista'));
    expect(w('tabla')).toBeGreaterThan(w('pasos'));
    expect(w('tabla')).toBeLessThanOrEqual(1840);
  });

  it('compacts on the left beside an open item', () => {
    expect(rule(board, '.view.narrow .board')).not.toMatch(/max-width|margin/);
    expect(wide).not.toMatch(/\.view\.narrow/);
  });

  it('draws the tools’ rule as its own piece, so it can stretch with the column', () => {
    expect(rule(board, '.tools')).not.toMatch(/border-bottom/);
    expect(rule(board, '.tools .trule')).toMatch(/background: var\(--rule\);/);
  });
});

// One page axis (sweep #12-#15): every view's column stands 40px in from the main pane, and its
// reading text (heads, section names, row titles, column heads, the way back) 72px further in, past
// the lanes' gutter. On a wide screen every view's column sits in the middle of the pane.
describe('one page axis for every view', () => {
  const lanes = read('./lanes.css');
  const table = read('./table.css');
  const pasos = read('./pasos.css');
  const triage = read('./triage.css');
  const home = read('./studio-home.css');
  const editor = read('./studio-editor.css');
  const axis = px(rule(lanes, '.lanes'), '--pl');
  // Every body of the rules whose whole selector is `selector`, joined.
  const rules = (css: string, selector: string) =>
    css
      .split(`${selector} {`)
      .slice(1)
      .map((s) => s.slice(0, s.indexOf('}')))
      .join('\n');

  it('puts the lanes’ text 72px in', () => {
    expect(axis).toBe(72);
  });

  it('heads Tabla’s groups and columns on the same axis as Lista’s', () => {
    expect(rule(table, '.tabla .lanes')).not.toMatch(/--pl/);
    expect(px(rule(table, '.thead'), 'padding-left')).toBe(axis);
  });

  it('starts Pasos’s columns on the axis, under the board’s head', () => {
    expect(rule(pasos, '.cols')).toMatch(new RegExp(`padding: 22px 0 30px ${axis}px;`));
  });

  it('starts Studio’s home and editor on the axis', () => {
    expect(rule(home, '.sh')).toMatch(new RegExp(`padding: 34px 40px 96px ${40 + axis}px;`));
    expect(rule(editor, '.se')).toMatch(new RegExp(`padding: 0 40px 110px ${40 + axis}px;`));
  });

  it('puts Triaje’s way back on the axis', () => {
    expect(rules(triage, '.tri .thd .back')).toMatch(new RegExp(`margin-left: ${axis - 9}px;`));
  });

  it('centres Studio and Triaje on a wide screen like the boards', () => {
    expect(rule(frame, '.view:not(.narrow) :is(.panel, .board, .sh, .se, .tri)')).toMatch(
      /margin-inline: auto;/,
    );
    expect(px(rule(triage, '.tri'), 'max-width')).toBeGreaterThan(0);
  });
});
