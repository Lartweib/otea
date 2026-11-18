import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Evidence } from '../../types.ts';
import { EvidenceReader, EvidenceViewer, viewOf } from './EvidenceViewer.tsx';
import { keepEvidenceText } from './TextViews.tsx';

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
  size: 1200,
  sha256: '',
  caption: null,
  createdAt: '2026-01-01T00:00:00Z',
  actor: { kind: 'agent', name: 'brush' },
  channel: 'cli',
});

describe('viewOf', () => {
  it('reads each kind with its own viewer, never as a raw link', () => {
    expect(viewOf(piece('image', 'a.png', 'image/png'))).toBe('image');
    expect(viewOf(piece('image', 'a.gif', 'image/gif'))).toBe('gif');
    expect(viewOf(piece('video', 'a.mp4', 'video/mp4'))).toBe('video');
    expect(viewOf(piece('audio', 'a.m4a', 'audio/mp4'))).toBe('audio');
    expect(viewOf(piece('diff', 'a.diff', 'text/x-diff'))).toBe('diff');
    expect(viewOf(piece('log', 'a.log', 'text/plain'))).toBe('log');
    expect(viewOf(piece('diagram', 'a.mmd', 'text/plain'))).toBe('diagram');
    expect(viewOf(piece('file', 'a.md', 'text/markdown'))).toBe('file');
  });
});

describe('EvidenceViewer', () => {
  it('plays a voice note in a player', () => {
    const html = renderToStaticMarkup(
      <EvidenceViewer evidence={piece('audio', 'nota.m4a', 'audio/mp4')} />,
    );
    expect(html).toContain('<audio');
    expect(html).toContain('controls');
    expect(html).not.toMatch(/>audio</);
  });

  it('lets a GIF be paused', () => {
    const html = renderToStaticMarkup(
      <EvidenceViewer evidence={piece('image', 'flujo.gif', 'image/gif')} />,
    );
    expect(html).toContain('ev-gif');
    expect(html).toMatch(/aria-pressed="false"[^>]*>[^<]*pause/);
  });
});

describe('EvidenceReader', () => {
  const files = [
    piece('image', 'antes.png', 'image/png'),
    piece('diff', 'cambios.diff', 'text/x-diff'),
    piece('audio', 'nota.m4a', 'audio/mp4'),
  ];

  it('says where you are among the files and steps to the others', () => {
    const html = renderToStaticMarkup(<EvidenceReader evidence={files} at={1} onAt={() => {}} />);
    expect(html).toContain('2 of 3');
    expect(html).toContain('cambios.diff');
    expect(html).toMatch(/aria-label="Previous file"/);
    expect(html).toMatch(/aria-label="Next file"/);
  });

  it('cannot step past the first or the last file', () => {
    const first = renderToStaticMarkup(<EvidenceReader evidence={files} at={0} onAt={() => {}} />);
    expect(first).toMatch(
      /disabled=""[^>]*aria-label="Previous file"|aria-label="Previous file"[^>]*disabled=""/,
    );
    const last = renderToStaticMarkup(<EvidenceReader evidence={files} at={2} onAt={() => {}} />);
    expect(last).toMatch(
      /disabled=""[^>]*aria-label="Next file"|aria-label="Next file"[^>]*disabled=""/,
    );
  });

  it('reads in Spanish', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(<EvidenceReader evidence={files} at={0} onAt={() => {}} />);
    expect(html).toContain('1 de 3');
  });

  it('carries a note begun elsewhere into its own, and on the phone says to tap', () => {
    const note = { onSend: async () => true };
    const phone = renderToStaticMarkup(
      <EvidenceReader evidence={files} at={1} onAt={() => {}} phone note={note} draft="Mirá" />,
    );
    expect(phone).toMatch(/<textarea[^>]*>Mirá<\/textarea>/);
    expect(phone).toContain('Tap a line');
    const desk = renderToStaticMarkup(
      <EvidenceReader evidence={files} at={1} onAt={() => {}} note={note} />,
    );
    expect(desk).toContain('Click a line');
    expect(desk).toMatch(/<textarea[^>]*><\/textarea>/);
  });

  it('says a test report is commented whole, not by a line it does not draw (UI2-9)', () => {
    const note = { onSend: async () => true };
    const report = piece('file', 'pruebas.xml', 'application/xml');
    keepEvidenceText(
      `/api/evidence/${report.id}/file`,
      '<testsuites><testsuite name="s"><testcase classname="s" name="ok"/></testsuite></testsuites>',
    );
    const plain = piece('file', 'config.xml', 'application/xml');
    keepEvidenceText(`/api/evidence/${plain.id}/file`, '<config><a>1</a></config>');
    const html = (shown: Evidence) =>
      renderToStaticMarkup(
        <EvidenceReader evidence={[shown]} at={0} onAt={() => {}} note={note} />,
      );
    expect(html(report)).toContain('This kind of file takes a note as a whole');
    expect(html(plain)).toContain('Click a line');
  });

  it('keeps the line a note begun was on, after the reader closed and opened again (DR3-16)', () => {
    const note = { onSend: async () => true };
    const diff = files[1] as Evidence;
    const html = renderToStaticMarkup(
      <EvidenceReader
        evidence={files}
        at={1}
        onAt={() => {}}
        phone
        note={note}
        draft="Esto no"
        draftPick={{ id: diff.id, pick: { line: 3 } }}
      />,
    );
    expect(html).toContain('Note on line 3');
    // On another file it is a note on that file as a whole.
    const other = renderToStaticMarkup(
      <EvidenceReader
        evidence={files}
        at={2}
        onAt={() => {}}
        phone
        note={note}
        draftPick={{ id: diff.id, pick: { line: 3 } }}
      />,
    );
    expect(other).toContain('Note on the whole file');
  });

  it('shows the notes left on the file, where they are, and lets the open review change them (P5-3)', () => {
    const image = files[0] as Evidence;
    const left = (note: number, text: string, extra: object = {}) => ({
      note,
      text,
      at: '2026-01-01T00:00:00Z',
      by: 'you',
      step: 's',
      stepName: 'Crear',
      round: 1,
      delivered: { done: 0, of: 0 },
      anchor: { evidence: image.id, filename: image.filename, ...extra },
    });
    const note = {
      onSend: async () => true,
      left: [
        left(1, 'La hoja', { x: 10, y: 20, w: 30, h: 15 }),
        left(2, 'El punto', { x: 50, y: 50 }),
        { ...left(3, 'En otro archivo'), anchor: { evidence: 999, filename: 'otro.png' } },
      ],
      pending: (n: { note: number }) => n.note === 1,
      onEdit: async () => true,
      onWithdraw: async () => true,
    };
    const html = renderToStaticMarkup(
      <EvidenceReader evidence={files} at={0} onAt={() => {}} note={note} />,
    );
    expect(html).toContain('Your notes on this file');
    expect(html).toContain('La hoja');
    expect(html).toContain('El punto');
    expect(html).not.toContain('En otro archivo');
    expect(html).toContain('a zone of the image');
    // Only the comment of the open review can be changed or taken back.
    expect(html.match(/>Edit</g)?.length).toBe(1);
    expect(html.match(/>Remove</g)?.length).toBe(1);
  });

  it('on the phone stacks the note above the moves in one foot, never one over the other (DR2-10)', () => {
    const note = { onSend: async () => true };
    const decide = { seen: 1, approve: { label: 'Approve', onClick: () => {} } };
    const phone = renderToStaticMarkup(
      <EvidenceReader evidence={files} at={1} onAt={() => {}} phone note={note} decide={decide} />,
    );
    const foot = phone.slice(phone.indexOf('class="ev-reader-foot"'));
    expect(phone).toContain('class="ev-reader-foot"');
    expect(foot.indexOf('ev-reader-note')).toBeGreaterThan(0);
    expect(foot.indexOf('ev-reader-decide')).toBeGreaterThan(foot.indexOf('ev-reader-note'));
    const desk = renderToStaticMarkup(
      <EvidenceReader evidence={files} at={1} onAt={() => {}} note={note} decide={decide} />,
    );
    expect(desk).not.toContain('ev-reader-foot');
  });
});

describe('a diff', () => {
  const diff = piece('diff', 'cambios.diff', 'text/x-diff');
  keepEvidenceText(
    `/api/evidence/${diff.id}/file`,
    'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n',
  );

  it('offers to wrap its long lines on the desk', () => {
    const html = renderToStaticMarkup(<EvidenceViewer evidence={diff} />);
    expect(html).toMatch(/aria-pressed="false"[^>]*>wrap</);
    expect(html).not.toContain('data-wrap="true"');
  });

  it('is always wrapped on the phone, with no toggle', () => {
    const html = renderToStaticMarkup(<EvidenceViewer evidence={diff} phone />);
    expect(html).toContain('data-wrap="true"');
    expect(html).not.toMatch(/>wrap</);
  });
});

describe('a diff side by side', () => {
  const diff = piece('diff', 'lado.diff', 'text/x-diff');
  keepEvidenceText(
    `/api/evidence/${diff.id}/file`,
    'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,2 @@\n keep\n-old\n+new\n',
  );

  it('offers unified and side by side on the desk, unified first', () => {
    const html = renderToStaticMarkup(<EvidenceViewer evidence={diff} />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>unified</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>side by side</);
  });

  it('draws the old and the new file in two columns when asked', () => {
    const html = renderToStaticMarkup(<EvidenceViewer evidence={diff} split />);
    expect(html).toContain('ev-split');
    expect(html).toMatch(/data-side="old"[\s\S]*old[\s\S]*data-side="new"[\s\S]*new/);
  });

  it('keeps the phone unified, with no choice', () => {
    const html = renderToStaticMarkup(<EvidenceViewer evidence={diff} phone />);
    expect(html).not.toContain('side by side');
    expect(html).not.toContain('ev-split');
  });
});

describe('a log', () => {
  const log = piece('log', 'pruebas.log', 'text/plain');
  keepEvidenceText(
    `/api/evidence/${log.id}/file`,
    'RUN v5\n ✓ adds\nFAIL src/tip.test.ts\nError: expected 2\ndone\n',
  );

  it('can be searched and says how many lines report a failure', () => {
    const html = renderToStaticMarkup(<EvidenceViewer evidence={log} />);
    expect(html).toMatch(/<input[^>]*type="search"[^>]*aria-label="Search the log"/);
    expect(html).toMatch(/>next error · 2</);
  });

  it('marks the lines that report a failure', () => {
    const html = renderToStaticMarkup(<EvidenceViewer evidence={log} />);
    expect(html.match(/data-error="true"/g)?.length).toBe(2);
  });

  it('offers no jump when nothing failed', () => {
    const clean = piece('log', 'ok.log', 'text/plain');
    keepEvidenceText(`/api/evidence/${clean.id}/file`, 'all good\n');
    const html = renderToStaticMarkup(<EvidenceViewer evidence={clean} />);
    expect(html).not.toContain('next error');
  });
});
