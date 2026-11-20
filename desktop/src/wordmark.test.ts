import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INSTALLING_GROUND, installingPage } from './installing-page.ts';
import { BRAND_O, wordmark } from './wordmark.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// The o's shapes, as attribute lists, whether written in JSX or in SVG.
function shapes(source: string): string[] {
  return [
    ...source.matchAll(
      /<(circle|path)\s+className="(brand-[a-z]+)"([^>]*)\/>|<(circle|path) class="(brand-[a-z]+)"([^>]*)\/>/g,
    ),
  ].map((m) => {
    const kind = m[1] ?? m[4];
    const name = m[2] ?? m[5];
    const attrs = (m[3] ?? m[6] ?? '')
      .replace(/strokeWidth=/g, 'stroke-width=')
      .replace(/\s+/g, ' ')
      .trim();
    return `${kind}.${name} ${attrs}`;
  });
}

describe('the wordmark', () => {
  it("is the header's o, shape for shape", () => {
    const header = shapes(read('../../ui/src/shell/Topbar.tsx'));
    expect(header).toHaveLength(3);
    expect(shapes(BRAND_O)).toEqual(header);
  });

  it('reads otea, lowercase, and turns its dot only while working', () => {
    expect(wordmark()).toContain('aria-label="otea"');
    expect(wordmark()).toMatch(/<\/svg>tea<\/span>$/);
    expect(wordmark()).not.toContain('working');
    expect(wordmark(true)).toContain('class="brand working"');
  });
});

describe('the window shown while the installer works', () => {
  const page = installingPage({ lang: 'es', font: 'data:font/woff2;base64,AAAA' });

  it('wears the wordmark, says what is happening, and loads no file', () => {
    expect(page).toContain(wordmark(true));
    expect(page).toContain('Otea todavía se está instalando');
    expect(page).toContain('<html lang="es">');
    expect(page).not.toMatch(/(src|href)="(?!data:)/);
    expect(page).toContain("src: url('data:font/woff2;base64,AAAA')");
  });

  it("takes the app's tokens, light and dark, not the system's face", () => {
    expect(page).toContain('@media (prefers-color-scheme: dark)');
    expect(page).toContain('background-color: var(--ground)');
    expect(page).not.toContain('system-ui');
    expect(INSTALLING_GROUND.light).toBe('#f7f8fc');
  });
});
