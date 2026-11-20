// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import '../../test-dom.tsx';
import type { Evidence } from '../../types.ts';
import type { ItemNote } from '../../views/detail/notes.ts';
import { EvidenceReader, type ReaderNote } from './EvidenceViewer.tsx';

// P5-R3-15: the reader's picture shrank 28% when the first note was saved (249×444 → 179×320 css
// px): the list of the notes left on it took its height from the view the picture fits in, and the
// next click target moved. The picture keeps the height it opened with; the view scrolls instead.

const shot: Evidence = {
  id: 7,
  itemId: 'PIE-1',
  role: 'single',
  module: 'eshots',
  kind: 'image',
  filename: 'hoja.png',
  contentType: 'image/png',
  size: 40,
  sha256: '',
  caption: null,
  createdAt: '2026-01-01T00:00:00Z',
  actor: { kind: 'agent', name: 'quill' },
  channel: 'cli',
};

const left: ItemNote = {
  note: 1,
  text: 'Más verde.',
  at: '2026-01-01T00:05:00Z',
  by: 'fede',
  step: 'screate',
  stepName: 'Crear',
  round: 1,
  delivered: { done: 1, of: 1 },
  anchor: { evidence: 7, filename: 'hoja.png' },
};

// The view's height as the browser lays it out: what the window leaves it, less the notes list.
let viewHeight = 0;
const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get(this: HTMLElement) {
    return this.classList.contains('ev-reader-view') ? viewHeight : 0;
  },
});
afterEach(() => {
  if (real) Object.defineProperty(HTMLElement.prototype, 'clientHeight', real);
});

describe('the reader’s picture as notes are left on it', () => {
  it('keeps the height it opened with, and takes a new one only when the window is resized', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const draw = (notes: ItemNote[]) => {
      const note: ReaderNote = { onSend: async () => true, left: notes, pending: () => true };
      act(() =>
        root.render(<EvidenceReader evidence={[shot]} at={0} onAt={() => {}} note={note} />),
      );
    };
    const fitHeight = () =>
      host.querySelector<HTMLElement>('.ev-reader-view')?.style.getPropertyValue('--fit-h');

    viewHeight = 500;
    draw([]);
    expect(fitHeight()).toBe('500px');

    // The first note's list takes 124 px from the view: the picture keeps its height.
    viewHeight = 376;
    draw([left]);
    expect(host.querySelector('.ev-reader-left')).not.toBeNull();
    expect(fitHeight()).toBe('500px');

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(fitHeight()).toBe('376px');
    act(() => root.unmount());
    host.remove();
  });
});
