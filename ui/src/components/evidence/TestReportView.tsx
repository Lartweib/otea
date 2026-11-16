import { type ReactNode, useState } from 'react';
import {
  compareReports,
  parseTestReport,
  type ReportChange,
  type TestCase,
  type TestReport,
} from '../../../../src/core/test-report.ts';
import { t } from '../../i18n/i18n.ts';
import { Button } from '../../kit/index.ts';
import type { Evidence } from '../../types.ts';
import { FileMeta } from './FileMeta.tsx';
import { useEarlier } from './item-evidence.ts';
import { LogView, TextState, useEvidenceText } from './TextViews.tsx';

const keyOf = (c: TestCase) => `${c.file}\u0000${c.name}`;

// The totals in one line: what passed, what failed, what was skipped.
export function reportTotals(report: TestReport): string {
  const { passed, failed, skipped } = report.totals;
  return [
    t('evidence.tests.passed', { count: passed }),
    failed ? t('evidence.tests.failed', { count: failed }) : '',
    skipped ? t('evidence.tests.skipped', { count: skipped }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// How this run stands against the one before, in one line.
export function changeWords(change: ReportChange): string {
  const parts = [
    change.newlyFailing.length
      ? t('evidence.tests.newlyFailing', { count: change.newlyFailing.length })
      : '',
    change.stillFailing.length
      ? t('evidence.tests.stillFailing', { count: change.stillFailing.length })
      : '',
    change.fixed.length ? t('evidence.tests.fixed', { count: change.fixed.length }) : '',
    change.added.length ? t('evidence.tests.added', { count: change.added.length }) : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : t('evidence.tests.nothingChanged');
}

function Report({
  report,
  change,
  evidence,
}: {
  report: TestReport;
  change: ReportChange | null;
  evidence: Evidence;
}) {
  const failing = report.cases.filter((c) => c.status === 'failed');
  const fresh = new Set(change?.newlyFailing.map(keyOf));
  // New failures first: they are what this round broke.
  const ordered = change
    ? [
        ...failing.filter((c) => fresh.has(keyOf(c))),
        ...failing.filter((c) => !fresh.has(keyOf(c))),
      ]
    : failing;
  const rest = report.cases.filter((c) => c.status !== 'failed');
  return (
    <div className="ev-tests">
      <p className="ev-tests-sum" data-failed={failing.length ? 'true' : undefined}>
        {reportTotals(report)}
      </p>
      {change ? (
        <p className="ev-tests-change t-small">
          <b>{t('evidence.tests.against')}</b> {changeWords(change)}
        </p>
      ) : null}
      {ordered.length ? (
        <section className="ev-tests-group" aria-label={t('evidence.tests.failures')}>
          <h4 className="t-cap">{t('evidence.tests.failures')}</h4>
          {ordered.map((c) => (
            <details key={keyOf(c)} className="ev-test" data-status="failed" open>
              <summary>
                {change ? (
                  <span className="ev-test-tag" data-new={fresh.has(keyOf(c)) ? 'true' : undefined}>
                    {fresh.has(keyOf(c)) ? t('evidence.tests.new') : t('evidence.tests.still')}
                  </span>
                ) : null}
                <span className="ev-test-name">{c.name}</span>
                {c.file ? <span className="ev-test-file t-small">{c.file}</span> : null}
              </summary>
              {c.message ? <pre className="ev-test-msg">{c.message}</pre> : null}
            </details>
          ))}
        </section>
      ) : (
        <p className="ev-tests-ok">{t('evidence.tests.allPass')}</p>
      )}
      {change?.fixed.length ? (
        <section className="ev-tests-group" aria-label={t('evidence.tests.fixedList')}>
          <h4 className="t-cap">{t('evidence.tests.fixedList')}</h4>
          <ul className="ev-tests-list">
            {change.fixed.map((c) => (
              <li key={keyOf(c)} data-status="passed">
                {c.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {rest.length ? (
        <details className="ev-tests-rest">
          <summary>{t('evidence.tests.showPassing', { count: rest.length })}</summary>
          <ul className="ev-tests-list">
            {rest.map((c) => (
              <li key={keyOf(c)} data-status={c.status}>
                {c.name}
                {c.file ? <span className="t-small"> · {c.file}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <FileMeta evidence={evidence} />
    </div>
  );
}

// The run before, once its text is in: the same report compared case by case.
function AgainstEarlier({
  report,
  earlier,
  evidence,
}: {
  report: TestReport;
  earlier: Evidence;
  evidence: Evidence;
}) {
  const state = useEvidenceText(earlier);
  const before = state.status === 'ready' ? parseTestReport(state.text) : null;
  return (
    <Report
      report={report}
      change={before ? compareReports(before, report) : null}
      evidence={evidence}
    />
  );
}

function TestReportView({ evidence, report }: { evidence: Evidence; report: TestReport }) {
  const [source, setSource] = useState(false);
  const earlier = useEarlier(evidence);
  return (
    <div className="ev-data">
      <div className="ev-tools">
        <span className="t-cap">{t('evidence.tests.label')}</span>
        <Button size="sm" aria-pressed={source} onClick={() => setSource(!source)}>
          {t('evidence.source')}
        </Button>
      </div>
      {source ? (
        <LogView evidence={evidence} />
      ) : earlier ? (
        <AgainstEarlier report={report} earlier={earlier} evidence={evidence} />
      ) : (
        <Report report={report} change={null} evidence={evidence} />
      )}
    </div>
  );
}

// A test run's report (JUnit XML, or the JSON vitest and jest write) reads as its results; any other
// file reads as `fallback` would.
export function ReportOr({ evidence, children }: { evidence: Evidence; children: ReactNode }) {
  const state = useEvidenceText(evidence);
  if (state.status !== 'ready') return <TextState state={state} evidence={evidence} />;
  const report = parseTestReport(state.text);
  return report ? <TestReportView evidence={evidence} report={report} /> : children;
}

// Whether a file could hold a report worth reading for one: XML or JSON, or any log.
export function mayBeReport(
  evidence: Pick<Evidence, 'kind' | 'filename' | 'contentType'>,
): boolean {
  if (evidence.kind === 'log') return true;
  return /\.(xml|json)$/i.test(evidence.filename) || /[/+](xml|json)$/.test(evidence.contentType);
}
