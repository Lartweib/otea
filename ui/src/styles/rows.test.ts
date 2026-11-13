import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Every row of a list is as tall as every other: its title line (--pt + --lh), a 3 px gap, a meta
// line of a fixed 18 px whatever it holds (a round's serif chip once made it 2.5 px taller), and
// 9 px under it. A child row and a row beside the detail set a shorter title line, so they start it
// lower and end at the same height. The lanes are measured from the rows, so they follow.
// In Tabla the cells' text sits on the title's baseline, not each on its own centre.

const read = (f: string) =>
  readFileSync(new URL(f, import.meta.url), 'utf8')
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const lanes = read('./lanes.css');
const table = read('./table.css');

// The body of the top-level rule whose whole selector is `selector`.
const rule = (css: string, selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
};
const px = (body: string, prop: string) =>
  Number(new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(body)?.[1] ?? Number.NaN);
// The padding's bottom in a `padding: top right bottom left` shorthand.
const padBottom = (body: string) => {
  const parts = /padding:\s*([^;]+);/.exec(body)?.[1]?.trim().split(/\s+/) ?? [];
  return Number.parseFloat(parts[2] ?? 'NaN');
};

describe('a list row', () => {
  const row = rule(lanes, '.row');
  const lift = rule(lanes, '.row .lift');
  const meta = rule(lanes, '.row .m');
  const title = px(row, '--pt') + px(row, '--lh');
  const height = title + px(meta, 'margin-top') + px(meta, 'line-height') + padBottom(lift);

  it('has a meta line of a fixed height, whatever it holds', () => {
    expect(px(meta, 'line-height')).toBe(18);
    // the round's serif chip keeps to the line instead of stretching it
    expect(rule(lanes, '.m .round')).toMatch(/line-height:\s*1;/);
  });

  it('is never shorter than a one-line row', () => {
    expect(height).toBe(61);
    expect(px(rule(lanes, '.row:not(.trow) .lift'), 'min-height')).toBe(height);
  });

  it('is as tall as a child row: a child starts its shorter title line lower', () => {
    const child = rule(lanes, '.row.child');
    expect(px(child, '--pt') + px(child, '--lh')).toBe(title);
  });

  it('is as tall beside the detail', () => {
    const narrow = rule(lanes, '.view.narrow .row:not(.trow)');
    expect(px(narrow, '--pt') + px(narrow, '--lh')).toBe(title);
  });
});

describe('a table row', () => {
  it('sets its cells on the title’s baseline', () => {
    expect(rule(table, '.trow .lift')).toMatch(/align-items:\s*baseline;/);
  });

  it('keeps its boxes without text centred', () => {
    expect(rule(table, '.trow .who')).toMatch(/align-self:\s*center;/);
    expect(rule(table, '.ckc')).toMatch(/align-self:\s*center;/);
  });
});
