import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import type { Evidence } from '../types.ts';
import { EvidenceList } from './EvidenceList.tsx';

afterEach(() => setLanguage('en'));

let seq = 0;
const piece = (kind: Evidence['kind'], filename: string, contentType: string): Evidence => ({
  id: ++seq,
  itemId: 'TAR-1',
  role: 'single',
  module: null,
  kind,
  filename,
  contentType,
  size: 900,
  sha256: '',
  caption: null,
  createdAt: '2026-01-01T00:00:00Z',
  actor: { kind: 'agent', name: 'brush' },
  channel: 'cli',
});

describe('EvidenceList', () => {
  it('reads every loose file in its viewer for a signed-in browser', () => {
    const html = renderToStaticMarkup(
      <EvidenceList
        evidence={[piece('audio', 'nota.m4a', 'audio/mp4'), piece('video', 'v.mp4', 'video/mp4')]}
        canWrite
      />,
    );
    expect(html).toContain('<audio');
    expect(html).toContain('<video');
  });

  it('names the kind in the reader’s language, never the raw word', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      <EvidenceList evidence={[piece('audio', 'nota.m4a', 'audio/mp4')]} canWrite={false} />,
    );
    expect(html).toContain('nota de voz');
    expect(html).not.toMatch(/>audio</);
  });
});
