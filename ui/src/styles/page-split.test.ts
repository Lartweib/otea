import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// A page beside a sheet (the agent's, opened on Configuración): when the page cannot keep its
// readable width, the sheet lies over it and the page stays whole; and Configuración reflows by its
// own width, not the window's, so no column ever stacks its words one letter per line.

const read = (f: string) =>
  readFileSync(new URL(f, import.meta.url), 'utf8')
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const frame = read('./frame.css');
const sheet = read('./sheet.css');
const projects = read('./projects.css');

const rule = (css: string, selector: string): string => {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
};
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

describe('a sheet over a page', () => {
  it('keeps the page at the whole width while the sheet lies over it', () => {
    expect(rule(frame, '.main[data-overlay] > .view.narrow')).toMatch(/width: 100%;/);
  });

  it('sets the overlaid sheet apart from the page under it, without a divider to drag', () => {
    expect(rule(sheet, '.main[data-overlay] > .sheet')).toMatch(/box-shadow:/);
    expect(rule(sheet, '.main[data-overlay] > .divider')).toMatch(/display: none;/);
  });
});

describe('Configuración reflows by its own width', () => {
  it('is a container its sections and the repos table measure', () => {
    expect(rule(projects, '.pj-settings')).toMatch(/container: pj \/ inline-size;/);
    expect(rule(projects, '.pj-sec-body')).toMatch(/container: pjsec \/ inline-size;/);
  });

  it('puts a section’s label above its body when the page is narrow', () => {
    const narrow = atBlock(projects, '@container pj (max-width: 760px)');
    expect(rule(narrow, '.pj-sec')).toMatch(/grid-template-columns: minmax\(0, 1fr\);/);
  });

  it('lays a repo out on two lines when its section is narrow, never letter by letter', () => {
    const narrow = atBlock(projects, '@container pjsec (max-width: 620px)');
    expect(rule(narrow, '.pj-repos')).toMatch(
      /grid-template-columns: minmax\(0, 1fr\) max-content;/,
    );
    expect(rule(narrow, '.pj-repo > .pj-repo-wide')).toMatch(/grid-column: 1 \/ -1;/);
  });

  it('never breaks a word inside a repos cell', () => {
    expect(rule(projects, '.pj-repo > *')).not.toMatch(/overflow-wrap: anywhere/);
  });
});
