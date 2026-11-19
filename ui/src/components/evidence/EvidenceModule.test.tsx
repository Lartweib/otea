import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Evidence, LayoutEntry } from '../../types.ts';
import { attachHint, NotableDiff } from './EvidenceModule.tsx';
import { ItemReview } from './item-evidence.ts';

afterEach(() => setLanguage('en'));

// An empty blind A and B said agents attach «uno de antes y otro de después» (P5-R2-3).
describe('what an empty evidence module asks the agent for', () => {
  const compare = { id: 'ab', module: 'images', variant: 'compare' } as LayoutEntry;

  it('asks a blind compare for A and B, never before and after', () => {
    setLanguage('es');
    const said = attachHint({ ...compare, blind: true } as LayoutEntry);
    expect(said).toContain('A y B');
    expect(said).not.toMatch(/antes|después/);
    setLanguage('en');
    expect(attachHint({ ...compare, blind: true } as LayoutEntry)).not.toMatch(/before|after/);
  });

  it('asks a plain compare for before and after', () => {
    setLanguage('es');
    expect(attachHint(compare)).toContain('uno de antes y otro de después');
  });
});

// P3C-R3-7: only the reader took a note on a line; the diff on the item's page did not. While the
// person reviews, a line of it takes one the same way: a click opens the reader there, picked.
describe('the diff on the item page while it is reviewed', () => {
  const diff: Evidence = {
    id: 7,
    itemId: 'CAM-1',
    role: 'single',
    module: null,
    kind: 'diff',
    filename: 'cambio.diff',
    contentType: 'text/x-diff',
    size: 40,
    sha256: '',
    caption: null,
    createdAt: '2026-01-01T00:00:00Z',
    actor: { kind: 'agent', name: 'quill' },
    channel: 'cli',
  };
  const note = { onSend: async () => true };

  it('lets a line take a note, saying so, only while a note can be left', () => {
    setLanguage('es');
    const noting = renderToStaticMarkup(
      <ItemReview.Provider value={{ note }}>
        <NotableDiff evidence={diff} />
      </ItemReview.Provider>,
    );
    expect(noting).toContain('class="ev-notable"');
    expect(noting).toContain('data-picking="true"');
    expect(noting).toContain('title="Haz clic en una línea para dejarle una nota en el lector."');
    expect(renderToStaticMarkup(<NotableDiff evidence={diff} />)).not.toContain('ev-notable');
  });
});
