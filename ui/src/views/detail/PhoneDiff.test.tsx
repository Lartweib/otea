import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { keepEvidenceText } from '../../components/evidence/TextViews.tsx';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Evidence } from '../../types.ts';
import { diffSummary, PhoneDiffFiles } from './PhoneDiff.tsx';

afterEach(() => setLanguage('en'));

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' keep',
  '-old',
  '+new',
  '+more',
  'diff --git a/README.md b/README.md',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1 +1 @@',
  '-x',
  '+y',
  '',
].join('\n');

const diff: Evidence = {
  id: 901,
  itemId: 'TAR-1',
  role: 'single',
  module: 'ediff',
  kind: 'diff',
  filename: 'cambios.diff',
  contentType: 'text/x-diff',
  size: 200,
  sha256: '',
  caption: null,
  createdAt: '2026-01-01T00:00:00Z',
  actor: { kind: 'agent', name: 'brush' },
  channel: 'cli',
};

describe('a diff on the phone review (P7-8)', () => {
  it('says the files it changed and how much', () => {
    expect(diffSummary(DIFF)).toEqual({
      files: [
        { path: 'src/a.ts', additions: 2, deletions: 1 },
        { path: 'README.md', additions: 1, deletions: 1 },
      ],
      additions: 3,
      deletions: 2,
    });
  });

  it('lists them under the diff, in Spanish too', () => {
    keepEvidenceText(`/api/evidence/${diff.id}/file`, DIFF);
    setLanguage('es');
    const html = renderToStaticMarkup(<PhoneDiffFiles evidence={diff} onOpen={() => {}} />);
    expect(html).toContain('2 archivos cambiados');
    expect(html).toContain('src/a.ts');
    expect(html).toContain('+3');
  });
});
