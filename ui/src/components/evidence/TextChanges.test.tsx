import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Evidence } from '../../types.ts';
import { FileView } from './FileViews.tsx';
import { ItemEvidence } from './item-evidence.ts';
import { TextChanges } from './TextChanges.tsx';
import { keepEvidenceText } from './TextViews.tsx';

const doc = (id: number): Evidence => ({
  id,
  itemId: 'POST-1',
  role: 'single',
  module: 'efiles',
  kind: 'file',
  filename: 'post.md',
  contentType: 'text/markdown',
  size: 200,
  sha256: String(id),
  caption: null,
  createdAt: `2026-01-0${id}T00:00:00Z`,
  actor: { kind: 'agent', name: 'brush' },
  channel: 'cli',
});

describe('a document against the round before', () => {
  it('offers its changes only when the round before handed a version of it', () => {
    keepEvidenceText('/api/evidence/11/file', '# Post\n\nHola.');
    expect(renderToStaticMarkup(<FileView evidence={doc(11)} />)).not.toContain('>changes<');
    const html = renderToStaticMarkup(
      <ItemEvidence.Provider value={[{ ...doc(10), createdAt: '2026-01-01T00:00:00Z' }, doc(11)]}>
        <FileView evidence={{ ...doc(11), createdAt: '2026-01-02T00:00:00Z' }} />
      </ItemEvidence.Provider>,
    );
    expect(html).toMatch(/aria-pressed="false"[^>]*>changes</);
  });

  it('marks the words removed and added, and says how much changed', () => {
    keepEvidenceText('/api/evidence/12/file', 'El gato duerme.\n\nSigue igual.');
    keepEvidenceText('/api/evidence/13/file', 'El perro duerme.\n\nSigue igual.');
    const html = renderToStaticMarkup(<TextChanges evidence={doc(13)} earlier={doc(12)} />);
    expect(html).toContain('<del>gato</del><ins>perro</ins>');
    expect(html).toContain('Against the earlier version: 20% of the words changed');
    expect(html).toMatch(/aria-pressed="true"[^>]*>words</);
  });
});
