import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Studio, Personalizar vista and the module catalog wear the Editorial language (SPEC §10.6): the
// new tokens only, the three families by token, and no helper of today's type scale.

const STYLES = ['studio.css', 'studio-preview.css', 'customize.css', 'customize-panels.css'];
const css = (name: string) =>
  readFileSync(new URL(`../styles/${name}`, import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

const sources = (dir: string): string[] =>
  readdirSync(new URL(`../${dir}/`, import.meta.url))
    .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
    .map((name) => `${dir}/${name}`);
const OWNED = [...sources('studio'), ...sources('customize'), 'components/ModuleCatalog.tsx'];
const code = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const LEGACY_TOKENS =
  /var\(--(bg|sf|mut|line|chip|off|pat|font-human|font-machine|m-fast|m-base|m-slow|m-ease|travel|e-move|r-s|r-m|r-l|row-h|tray[\w-]*|agent-\d)\)/g;
const LEGACY_CLASSES =
  /(?<![\w-])(t-display|t-h|t-body|t-ui|t-small|t-id|t-cap|t-label|raised|mono|action-error|pane-message)(?![\w-])/;

describe('the restyled stylesheets', () => {
  for (const name of STYLES) {
    it(`${name} uses only the Editorial tokens`, () => {
      expect(css(name).match(LEGACY_TOKENS) ?? []).toEqual([]);
    });

    it(`${name} names its families by token`, () => {
      const families = [...css(name).matchAll(/font(?:-family)?\s*:[^;]*;/g)].map(([rule]) => rule);
      const named = families.filter((rule) =>
        /['"]|\b(Georgia|Arial|serif|monospace)\b/.test(rule),
      );
      expect(named).toEqual([]);
    });
  }
});

describe('the restyled components', () => {
  for (const path of OWNED) {
    it(`${path} uses no helper of today's type scale`, () => {
      const classes = [...code(path).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
        ([, plain, template]) => plain ?? template ?? '',
      );
      expect(classes.filter((value) => LEGACY_CLASSES.test(value))).toEqual([]);
    });

    it(`${path} draws nodes with the lanes' glyphs`, () => {
      const text = code(path);
      expect(text).not.toMatch(/node-kind\.ts'/);
      expect(text).not.toMatch(/<Node(Mark)?\s/);
    });
  }
});
