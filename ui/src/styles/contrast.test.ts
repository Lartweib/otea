import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Contrast is held at the token level (WCAG 2.2): the muted ink reads at 4.5:1 or more on every
// surface it sits on, light and dark; a half of the pair editor that is not in focus is dimmed no
// further than keeps its clickable labels at 3:1; a disabled primary button stops looking primary.

const read = (file: string) =>
  readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r/g, '');
const tokens = read('./tokens.css');
const pair = read('./studio-pair.css');
const kit = read('../kit/kit.css');

// The declarations of one block of tokens.css, by the text that opens it.
const block = (opener: string): Record<string, string> => {
  const at = tokens.indexOf(opener);
  if (at < 0) throw new Error(`no block ${opener}`);
  const open = tokens.indexOf('{', at + opener.length - 1);
  const body = tokens.slice(open + 1, tokens.indexOf('}', open));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g))
    out[m[1] as string] = (m[2] as string).trim();
  return out;
};
const light = block('\n:root {');
const darkMedia = block(':root:not([data-theme="light"]) {');
const darkForced = block(':root[data-theme="dark"] {');
const dark = { ...light, ...darkForced };

type Rgba = [number, number, number, number];

// oklch(L C h [/ a]) to sRGB 0-255, clipped, with its alpha.
const parse = (value: string): Rgba => {
  const m = value.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/);
  if (!m) throw new Error(`not an oklch colour: ${value}`);
  const [L, C, h] = [Number(m[1]), Number(m[2]), (Number(m[3]) * Math.PI) / 180];
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  const gamma = (x: number) => {
    const v = Math.min(1, Math.max(0, x));
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  };
  return [
    gamma(linear[0] as number),
    gamma(linear[1] as number),
    gamma(linear[2] as number),
    m[4] ? Number(m[4]) : 1,
  ];
};
const over = (top: Rgba, under: Rgba): Rgba => [
  top[0] * top[3] + under[0] * (1 - top[3]),
  top[1] * top[3] + under[1] * (1 - top[3]),
  top[2] * top[3] + under[2] * (1 - top[3]),
  1,
];
const fade = (c: Rgba, k: number): Rgba => [c[0], c[1], c[2], c[3] * k];
const luminance = (c: Rgba) => {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (fg: Rgba, bg: Rgba) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

// Every surface muted text sits on: the page, the sheet, a well, hover and selection, and the
// you-wash of a current round card (bi-rounds .rd.on) laid on each of them.
const surfaces = (t: Record<string, string>): Record<string, Rgba> => {
  const base: Record<string, Rgba> = {};
  for (const name of ['ground', 'sheet', 'well', 'hov', 'sel'])
    base[name] = parse(t[`--${name}`] as string);
  const wash = parse(t['--you-wash'] as string);
  const out = { ...base };
  for (const [name, bg] of Object.entries(base)) out[`you-wash on ${name}`] = over(wash, bg);
  return out;
};

describe('the dark tokens', () => {
  it('are the same under the system preference and under data-theme', () => {
    expect(darkMedia).toEqual(darkForced);
  });
});

describe.each([
  ['light', light],
  ['dark', dark],
])('muted text in %s', (_theme, t) => {
  const ink3 = parse(t['--ink-3'] as string);
  it.each(Object.entries(surfaces(t)))('reads at 4.5:1 or more on %s', (_name, bg) => {
    expect(ratio(over(ink3, bg), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('stays a step quieter than the secondary ink', () => {
    const ground = parse(t['--ground'] as string);
    expect(ratio(parse(t['--ink-2'] as string), ground)).toBeGreaterThan(ratio(ink3, ground) * 1.2);
  });
});

describe('the half of the pair editor not in focus', () => {
  const dim = Number(light['--dim']);

  it('is dimmed by the --dim token, never by its own number', () => {
    expect(dim).toBeGreaterThan(0);
    expect(dim).toBeLessThan(1);
    for (const selector of [
      '.se-dkp:not(.on)',
      '.se-rblock:not(.on) .se-rroute',
      '.se-vsec:not(.on) > :not(.se-vbh)',
    ]) {
      const at = pair.indexOf(`\n${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      const body = pair.slice(pair.indexOf('{', at) + 1, pair.indexOf('}', at));
      expect(body, selector).toMatch(/opacity: var\(--dim\);/);
    }
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ])('keeps its muted and accent labels at 3:1 or more in %s', (_theme, t) => {
    for (const name of ['ground', 'sheet']) {
      const bg = parse(t[`--${name}`] as string);
      for (const ink of ['--ink-3', '--you-ink']) {
        expect(
          ratio(over(fade(parse(t[ink] as string), dim), bg), bg),
          `${ink} on ${name}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('a disabled primary button', () => {
  const at = kit.indexOf('\n.btn.primary:disabled {');
  const body = kit.slice(kit.indexOf('{', at) + 1, kit.indexOf('}', at));

  it('is not a faded primary: it leaves the accent fill and keeps its words readable', () => {
    expect(at).toBeGreaterThan(-1);
    expect(body).not.toMatch(/opacity/);
    expect(body).toMatch(/background: var\(--well\);/);
    expect(body).toMatch(/color: var\(--ink-3\);/);
  });

  it('does not darken on hover', () => {
    expect(kit).toMatch(/\n\.btn\.primary:hover:not\(:disabled\) \{/);
    expect(kit).not.toMatch(/\n\.btn\.primary:hover \{/);
  });
});
