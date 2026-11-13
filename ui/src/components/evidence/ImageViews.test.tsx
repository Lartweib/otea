import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Evidence } from '../../types.ts';
import { ImageGallery } from './ImageViews.tsx';

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
