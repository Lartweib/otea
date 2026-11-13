import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dismissHint, hintDismissed, isStandalone, platformOf } from './home-screen.ts';

const media = (standalone: boolean) => (query: string) => ({
  matches: standalone && query === '(display-mode: standalone)',
});

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

describe('home screen', () => {
  it('knows it was opened from the home screen', () => {
    expect(isStandalone(media(true), {})).toBe(true);
    expect(isStandalone(media(false), { standalone: true })).toBe(true);
    expect(isStandalone(media(false), {})).toBe(false);
  });

  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', 5, 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5, 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0, 'other'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile Safari/537.36', 5, 'android'],
  ])('tells the platform of %s', (userAgent, touch, platform) => {
    expect(platformOf(userAgent, touch)).toBe(platform);
  });

  it('remembers a dismissed hint, and copes without storage', () => {
    const store = memory();

    expect(hintDismissed(store)).toBe(false);
    dismissHint(store);
    expect(hintDismissed(store)).toBe(true);
    expect(hintDismissed(undefined)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => dismissHint(broken)).not.toThrow();
    expect(hintDismissed(broken)).toBe(false);
  });
});

describe('the page a phone adds to its home screen', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = JSON.parse(
    readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
  );

  it('links the manifest and the iOS home-screen tags', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Otea" />');
    expect(html).toMatch(/name="theme-color" media="\(prefers-color-scheme: dark\)"/);
  });

  it('opens standalone at the root, with icons for every launcher', () => {
    expect(manifest).toMatchObject({
      name: 'Otea',
      short_name: 'Otea',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
    const icons = manifest.icons as { src: string; sizes: string; purpose: string }[];
    expect(icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
    for (const { src } of icons) {
      const png = readFileSync(new URL(`../public${src}`, import.meta.url));
      expect(png.subarray(1, 4).toString()).toBe('PNG');
    }
  });

  // The status bar and the splash take the page's ground, light and dark, from the tokens.
  it('takes its theme colours from the ground token', () => {
    const tokens = readFileSync(new URL('./styles/tokens.css', import.meta.url), 'utf8');
    const grounds = [...tokens.matchAll(/--ground: oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g)].map(
      ([, l, c, h]) => hexOfOklch(Number(l), Number(c), Number(h)),
    );
    const [light, dark] = grounds;

    expect(manifest.theme_color).toBe(light);
    expect(manifest.background_color).toBe(light);
    expect(html).toContain(
      `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${light}" />`,
    );
    expect(html).toContain(
      `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${dark}" />`,
    );
  });
});

// OKLCH to sRGB hex (Björn Ottosson's matrices), to read a token as a manifest colour.
function hexOfOklch(l: number, c: number, h: number): string {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ];
  const channel = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${linear.map(channel).join('')}`;
}
