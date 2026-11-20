// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import '../../test-dom.tsx';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Evidence } from '../../types.ts';
import { ImageGallery } from './ImageViews.tsx';
import { ItemReview } from './item-evidence.ts';

// The desk gallery only named the round of each picture (#481): comparing two rounds' pictures took
// the phone. It compares the picture shown with its version in the round before, paired by name as
// the phone pairs them (#472), in the compare the desk already has.

const picture = (id: number, filename: string): Evidence => ({
  id,
  itemId: 'PIE-1',
  role: 'single',
  module: 'eshots',
  kind: 'image',
  filename,
  contentType: 'image/png',
  size: 1,
  sha256: '',
  caption: null,
  createdAt: `2026-01-0${id}T00:00:00Z`,
  actor: { kind: 'agent', name: 'pix' },
  channel: 'cli',
});

const cover1 = picture(1, 'portada.png');
const logo1 = picture(2, 'logo.png');
const cover2 = picture(3, 'portada-r2.png');
const logo2 = picture(4, 'logo.png');
const roundOf = new Map([
  [1, 1],
  [2, 1],
  [3, 2],
  [4, 2],
]);

let root: ReturnType<typeof createRoot> | undefined;
const host = () => document.body.querySelector('div') as HTMLElement;

function draw(evidence: Evidence[], rounds: ReadonlyMap<number, number>) {
  const into = document.createElement('div');
  document.body.append(into);
  root = createRoot(into);
  act(() =>
    root?.render(
      <ItemReview.Provider value={{ roundOf: rounds }}>
        <ImageGallery evidence={evidence} label="Imágenes" />
      </ItemReview.Provider>,
    ),
  );
  return into;
}

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll('button')].find(
    (b) => b.textContent?.includes(text) || b.getAttribute('aria-label')?.includes(text),
  );

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  setLanguage('en');
});

describe('the desk gallery across rounds', () => {
  it('compares the picture shown with its namesake in the round before, and goes back', () => {
    setLanguage('es');
    const el = draw([cover1, logo1, cover2, logo2], roundOf);

    // It opens on the newest, logo.png of round 2: its pair is logo.png of round 1.
    const compare = button(el, 'Comparar con la ronda 1');
    expect(compare).toBeDefined();
    act(() => compare?.click());

    const tags = [...el.querySelectorAll('.ev-compare .ev-tag')].map((t) => t.textContent);
    expect(tags).toEqual(['ronda 1', 'ronda 2']);
    const alts = [...el.querySelectorAll('.ev-compare img')].map((i) => i.getAttribute('alt'));
    expect(alts.join(' ')).toContain('logo.png');
    expect(el.querySelector('.ev-thumbs')).toBeNull();

    act(() => button(el, 'Volver a la galería')?.click());
    expect(el.querySelector('.ev-compare')).toBeNull();
    expect(el.querySelector('.ev-thumbs')).not.toBeNull();
    expect(host()).toBe(el);
  });

  it('pairs by name, never by place', () => {
    setLanguage('es');
    const el = draw([cover1, logo1, cover2, logo2], roundOf);
    act(() => button(el, 'portada-r2.png')?.click());
    act(() => button(el, 'Comparar con la ronda 1')?.click());

    const srcs = [...el.querySelectorAll('.ev-compare img')].map((i) => i.getAttribute('alt'));
    expect(srcs.some((alt) => alt?.includes('portada.png'))).toBe(true);
    expect(srcs.some((alt) => alt?.includes('portada-r2.png'))).toBe(true);
  });

  it('offers no compare in the first round, or off a review', () => {
    setLanguage('es');
    const el = draw([cover1, logo1, cover2, logo2], roundOf);
    act(() => button(el, 'portada.png')?.click());
    expect(button(el, 'Comparar con la ronda')).toBeUndefined();
    act(() => root?.unmount());

    const off = draw([cover1, cover2], new Map());
    expect(button(off, 'Comparar con la ronda')).toBeUndefined();
  });
});
