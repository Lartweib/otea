import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Evidence } from '../../types.ts';
import { DiagramView } from './DiagramView.tsx';

const diagram = (id: number, filename: string): Evidence => ({
  id,
  itemId: 'IDE-1',
  role: 'single',
  module: 'ediag',
  kind: 'file',
  filename,
  contentType: 'text/plain',
  size: 1,
  sha256: '',
  caption: null,
  createdAt: `2026-01-0${id}T00:00:00Z`,
  actor: { kind: 'agent', name: 'brush' },
  channel: 'cli',
});

const modules = (html: string) => html.match(/class="dg-module"/g)?.length ?? 0;

describe('DiagramView', () => {
  it('draws each file on its own, and only the same file attached again is a version', () => {
    const html = renderToStaticMarkup(
      <DiagramView
        evidence={[
          diagram(1, 'contexto.mmd'),
          diagram(2, 'flujo.mmd'),
          diagram(3, 'contexto.mmd'),
          diagram(4, 'datos.mmd'),
        ]}
      />,
    );
    expect(modules(html)).toBe(3);
    expect(html.indexOf('contexto.mmd')).toBeLessThan(html.indexOf('flujo.mmd'));
    expect(html.indexOf('flujo.mmd')).toBeLessThan(html.indexOf('datos.mmd'));
    // contexto.mmd has two versions; the other files have one, so no version picker.
    expect(html.match(/class="dg-switch dg-versions"/g)?.length).toBe(1);
  });

  it('offers to enlarge every diagram', () => {
    const html = renderToStaticMarkup(<DiagramView evidence={[diagram(1, 'flujo.mmd')]} />);
    expect(html).toMatch(/class="dg-seg dg-enlarge"[^>]*>Enlarge</);
  });
});
