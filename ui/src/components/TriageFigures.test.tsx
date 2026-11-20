import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import type { Evidence } from '../types.ts';
import { Figures } from './Triage.tsx';

afterEach(() => setLanguage('en'));

const image = (id: number, role: Evidence['role'], module: string | null): Evidence => ({
  id,
  itemId: 'PIE-3',
  role,
  module,
  kind: 'image',
  filename: `${id}.png`,
  contentType: 'image/png',
  size: 40,
  sha256: '',
  caption: null,
  createdAt: '2026-01-01T00:00:00Z',
  actor: { kind: 'agent', name: 'quill' },
  channel: 'cli',
});

// P5-R3-10: the phone's Triaje named a blind A/B card's pictures «ANTES» and «DESPUÉS», and offered
// no pick; the item page names them A and B, with «Me quedo con A/B».
describe('the pictures a Triage card shows', () => {
  const pair = [image(1, 'before', 'ab'), image(2, 'after', 'ab')];
  const note = { onSend: async () => true, left: [], pending: () => true };

  it('names a blind compare A and B, with «Me quedo con A/B» while you review', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(<Figures shown={pair} blind={new Set(['ab'])} note={note} />);
    expect(html).toContain('<b class="fk">A</b>');
    expect(html).toContain('<b class="fk">B</b>');
    expect(html).not.toMatch(/antes|después/);
    expect(html).toContain('Me quedo con A');
    expect(html).toContain('Me quedo con B');
  });

  it('names a plain compare before and after, with no pick', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(<Figures shown={pair} blind={new Set()} note={note} />);
    expect(html).toContain('<b class="fk">antes</b>');
    expect(html).not.toContain('Me quedo con');
  });
});
