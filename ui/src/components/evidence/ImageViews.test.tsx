import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Evidence } from '../../types.ts';
import { ImageCompare, ImageGallery } from './ImageViews.tsx';

const image = (id: number): Evidence => ({
  id,
  itemId: 'CRI-1',
  role: 'single',
  module: 'eart',
  kind: 'image',
  filename: `ronda-${id}.png`,
  contentType: 'image/png',
  size: 1,
  sha256: '',
  caption: null,
  createdAt: `2026-01-0${id}T00:00:00Z`,
  actor: { kind: 'agent', name: 'brush' },
  channel: 'cli',
});

// The blind slider was «Divisor entre antes y después» to a screen reader (P5-R2-3).
describe('ImageCompare, blind', () => {
  it('names its divider between A and B, never before and after', () => {
    setLanguage('es');
    const a = { ...image(1), role: 'before' as const };
    const b = { ...image(2), role: 'after' as const };
    const html = renderToStaticMarkup(<ImageCompare evidence={[a, b]} blind />);
    expect(html).toContain('aria-label="Divisor entre A y B"');
    expect(html).not.toMatch(/antes|después/);
    setLanguage('en');
  });
});

describe('ImageGallery', () => {
  it('opens on the newest file, the latest round’s, and keeps the oldest first in the strip', () => {
    const html = renderToStaticMarkup(
      <ImageGallery evidence={[image(1), image(2), image(3)]} label="Arte" />,
    );
    expect(html).toContain('3 / 3');
    expect(html).toMatch(/class="ev-img ev-set"[^>]*alt="ronda-3.png"/);
    expect(html.indexOf('ronda-1.png')).toBeLessThan(html.indexOf('ronda-2.png'));
    expect(html).toMatch(/aria-current="true" aria-label="[^"]*ronda-3.png"/);
  });
});
