import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Evidence } from '../../types.ts';
import { ReaderPane } from './DeskReader.tsx';
import { EvidenceReader } from './EvidenceViewer.tsx';

afterEach(() => setLanguage('en'));

let seq = 500;
const piece = (
  kind: Evidence['kind'],
  filename: string,
  contentType: string,
  module: string | null = null,
): Evidence => ({
  id: ++seq,
  itemId: 'TAR-1',
  role: 'single',
  module,
  kind,
  filename,
  contentType,
  size: 1200,
  sha256: '',
  caption: null,
  createdAt: '2026-01-01T00:00:00Z',
  actor: { kind: 'agent', name: 'brush' },
  channel: 'cli',
});

const files = [
  piece('image', 'antes.png', 'image/png', 'eshot'),
  piece('video', 'grabacion.webm', 'video/webm', 'evideo'),
  piece('video', 'grabacion.webm', 'video/webm', 'estrip'),
];
const [shot, video, strip] = files as [Evidence, Evidence, Evidence];
const noop = () => {};

describe('EvidenceReader deciding', () => {
  it('says how many files were seen and offers Send back and Approve from inside', () => {
    const html = renderToStaticMarkup(
      <EvidenceReader
        evidence={files}
        at={0}
        onAt={noop}
        decide={{
          seen: 2,
          back: { label: 'Send back…', onClick: noop },
          approve: { label: 'Approve', onClick: noop },
        }}
      />,
    );
    expect(html).toContain('Seen 2 of 3');
    expect(html).toMatch(/>Send back…</);
    expect(html).toMatch(/>Approve</);
  });

  it('decides nothing when it is not your turn', () => {
    const html = renderToStaticMarkup(<EvidenceReader evidence={files} at={0} onAt={noop} />);
    expect(html).not.toContain('Seen');
    expect(html).not.toContain('ev-reader-decide');
  });

  it('reads in Spanish', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      <EvidenceReader
        evidence={files}
        at={0}
        onAt={noop}
        decide={{ seen: 1, approve: { label: 'Aprobar', onClick: noop } }}
      />,
    );
    expect(html).toContain('Visto 1 de 3');
  });
});

describe('ReaderPane: the desk reader', () => {
  const parts = new Map([
    ['evideo', 'Grabación'],
    ['estrip', 'Tira de fotogramas'],
  ]);
  const marks = new Map<number, 'new' | 'changed' | 'same'>([
    [shot.id, 'new'],
    [video.id, 'same'],
  ]);

  it('lists every file with its part, its mark and whether you opened it', () => {
    const html = renderToStaticMarkup(
      <ReaderPane
        evidence={files}
        at={1}
        onAt={noop}
        parts={parts}
        marks={marks}
        seen={new Set([shot.id, video.id])}
      />,
    );
    expect(html).toContain('Grabación');
    expect(html).toContain('Tira de fotogramas');
    expect(html.match(/rd-file/g)?.length).toBe(3);
    expect(html).toMatch(/aria-current="true"[^>]*>[\s\S]*?grabacion\.webm/);
    expect(html).toContain('>new<');
    expect(html).toContain('>same<');
    expect(html.match(/data-seen="true"/g)?.length).toBe(2);
    expect(html).toContain('2 of 3');
  });

  it('marks the files that hold notes, with how many (DR3-14)', () => {
    const html = renderToStaticMarkup(
      <ReaderPane
        evidence={files}
        at={0}
        onAt={noop}
        seen={new Set()}
        noted={new Map([[video.id, 2]])}
      />,
    );
    expect(html.match(/class="rd-notes"/g)?.length).toBe(1);
    expect(html).toMatch(/grabacion\.webm[\s\S]*?class="rd-notes">2 notes</);
  });

  it('names a file with no part by its kind', () => {
    const html = renderToStaticMarkup(
      <ReaderPane evidence={[strip, shot]} at={0} onAt={noop} seen={new Set()} />,
    );
    expect(html).toContain('recording');
    expect(html).toContain('image');
  });
});
