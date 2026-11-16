import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Evidence } from '../../types.ts';
import { EvidenceViewer } from './EvidenceViewer.tsx';
import { FileView } from './FileViews.tsx';
import { ItemEvidence } from './item-evidence.ts';
import { keepEvidenceText } from './TextViews.tsx';

const piece = (id: number, over: Partial<Evidence>): Evidence => ({
  id,
  itemId: 'ENC-1',
  role: 'single',
  module: 'etests',
  kind: 'log',
  filename: 'junit.xml',
  contentType: 'application/xml',
  size: 400,
  sha256: String(id),
  caption: null,
  createdAt: `2026-01-0${id}T00:00:00Z`,
  actor: { kind: 'agent', name: 'brush' },
  channel: 'cli',
  ...over,
});

const junit = (cases: string) =>
  `<testsuites><testsuite name="src/tip.test.ts">${cases}</testsuite></testsuites>`;

describe('a test report', () => {
  it('reads as its totals and failures, failures open, the passing folded', () => {
    keepEvidenceText(
      '/api/evidence/1/file',
      junit(
        '<testcase name="rounds up"/><testcase name="splits"><failure message="expected 3 to be 4"/></testcase>',
      ),
    );
    const html = renderToStaticMarkup(<EvidenceViewer evidence={piece(1, {})} />);
    expect(html).toContain('Test results');
    expect(html).toContain('1 passed · 1 failed');
    expect(html).toMatch(/<details class="ev-test" data-status="failed" open="">/);
    expect(html).toContain('expected 3 to be 4');
    expect(html).toContain('Show the 1 that passed or were skipped');
    expect(html).not.toContain('class="ev-log"');
  });

  it('says what changed against the same report handed in the round before', () => {
    keepEvidenceText(
      '/api/evidence/2/file',
      junit(
        '<testcase name="rounds up"/><testcase name="splits"><failure message="x"/></testcase>',
      ),
    );
    keepEvidenceText(
      '/api/evidence/3/file',
      junit(
        '<testcase name="rounds up"><failure message="off by one"/></testcase><testcase name="splits"/>',
      ),
    );
    const before = piece(2, {});
    const now = piece(3, {});
    const html = renderToStaticMarkup(
      <ItemEvidence.Provider value={[before, now]}>
        <EvidenceViewer evidence={now} />
      </ItemEvidence.Provider>,
    );
    expect(html).toContain('Against the previous round:');
    expect(html).toContain('1 new failure · 1 fixed');
    expect(html).toContain('data-new="true"');
    expect(html).toContain('Fixed since the previous round');
  });

  it('reads a vitest JSON report in a files part, and any other JSON as data', () => {
    keepEvidenceText(
      '/api/evidence/4/file',
      JSON.stringify({
        testResults: [{ name: 'a.test.ts', assertionResults: [{ title: 'ok', status: 'passed' }] }],
      }),
    );
    keepEvidenceText('/api/evidence/5/file', '{"name":"otea"}');
    const report = renderToStaticMarkup(
      <FileView evidence={piece(4, { kind: 'file', filename: 'results.json' })} />,
    );
    expect(report).toContain('Every test passed.');
    const data = renderToStaticMarkup(
      <FileView evidence={piece(5, { kind: 'file', filename: 'package.json' })} />,
    );
    expect(data).toContain('ev-json');
    expect(data).not.toContain('Test results');
  });

  it('leaves a plain log a log', () => {
    keepEvidenceText('/api/evidence/6/file', 'PASS src/tip.test.ts\nDone in 2s');
    const html = renderToStaticMarkup(
      <EvidenceViewer evidence={piece(6, { filename: 'out.log' })} />,
    );
    expect(html).toContain('class="ev-log"');
    expect(html).not.toContain('Test results');
  });
});
