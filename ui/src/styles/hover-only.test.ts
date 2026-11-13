import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { hoverOnly } from './hover-only.ts';

const run = (css: string) => postcss([hoverOnly()]).process(css, { from: undefined }).css;
const flat = (css: string) => css.replace(/\s+/g, ' ').trim();

describe('hoverOnly: a hover style only where a pointer can hover', () => {
  it('puts a hover rule under (hover: hover), where it stood', () => {
    expect(flat(run('.a { color: red } .row:hover .band { opacity: 1 } .b { color: blue }'))).toBe(
      '.a { color: red } @media (hover: hover) { .row:hover .band { opacity: 1 } } .b { color: blue }',
    );
  });

  it('splits a list: the other selectors keep the rule, the hover ones follow it', () => {
    expect(flat(run('.nrow:hover .plus, .nrow:focus-within .plus { opacity: 1 }'))).toBe(
      '.nrow:focus-within .plus { opacity: 1 } @media (hover: hover) { .nrow:hover .plus { opacity: 1 } }',
    );
  });

  it('nests inside the media or container query it already sits in', () => {
    expect(flat(run('@media (max-width: 720px) { .x:hover { color: red } }'))).toBe(
      '@media (max-width: 720px) { @media (hover: hover) { .x:hover { color: red } } }',
    );
  });

  it('leaves a rule already under a hover query alone', () => {
    const css = '@media (hover: hover) { .x:hover { color: red } }';
    expect(run(css)).toBe(css);
    const none = '@media (hover: none) { .x { opacity: 1 } }';
    expect(run(none)).toBe(none);
  });

  it('leaves rules without :hover alone', () => {
    const css = '.x:focus-visible { outline: 0 } .hover { color: red }';
    expect(run(css)).toBe(css);
  });
});
