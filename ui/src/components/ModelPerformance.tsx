import { useCallback, useState } from 'react';
import type {
  Numbers,
  PerformanceRow,
  PerformanceView,
} from '../../../src/core/board/performance.ts';
import { fetchPerformance } from '../api.ts';
import { useApp } from '../app/context.tsx';
import { useRemote } from '../hooks.ts';
import { t, tx } from '../i18n/i18n.ts';
import { Chevron } from '../kit/Marks.tsx';
import { Seg } from '../kit/Seg.tsx';
import {
  labelOf,
  MIN_HANDOFFS,
  percentText,
  rateOf,
  readingOf,
  roundsText,
  spanText,
} from '../performance.ts';

// Rendimiento (desktop only): how each model performs, per model family and effort, from the
// profile on each handoff. One plain reading on top when the data is enough, then a table with a
// row per family · effort (its exact models and its board steps folded under it) and a thin meter
// for how many of its handoffs come back. The numbers are the server's (/api/performance).

const PERIODS = ['7d', '30d', 'all'] as const;
type Period = (typeof PERIODS)[number];

// A thin meter: how many handoffs came back, on a track of the same hue; a row with too few
// handoffs to say much draws it faded. Its figure sits beside it; the tooltip says it in words.
function BackMeter({ numbers }: { numbers: Numbers }) {
  if (numbers.handoffs === 0) return <span className="perf-none">–</span>;
  const tip = t('perf.tip.back', { back: numbers.sentBack, handoffs: numbers.handoffs });
  return (
    <span
      className="perf-back"
      data-few={numbers.handoffs < MIN_HANDOFFS || undefined}
      data-tip={tip}
      title={tip}
    >
      <span className="perf-meter" aria-hidden="true">
        <i style={{ width: `${rateOf(numbers) * 100}%` }} />
      </span>
      <span className="perf-fig">{percentText(numbers)}</span>
    </span>
  );
}

function Figures({ numbers }: { numbers: Numbers }) {
  return (
    <>
      <td className="num">{numbers.handoffs}</td>
      <td className="perf-back-cell">
        <BackMeter numbers={numbers} />
      </td>
      <td className="num">{roundsText(numbers)}</td>
      <td className="num">{numbers.itemsFinished}</td>
      <td className="num">{numbers.discards}</td>
      <td className="num">{spanText(numbers.medianClaimToHandoffMs)}</td>
    </>
  );
}

function Row({ row, oneBoard }: { row: PerformanceRow; oneBoard: boolean }) {
  const [open, setOpen] = useState(false);
  const label = labelOf(row);
  return (
    <tbody className={open ? 'perf-group open' : 'perf-group'}>
      <tr className="perf-row">
        <th scope="row">
          <button
            type="button"
            className="perf-open"
            aria-expanded={open}
            aria-label={t(open ? 'perf.less' : 'perf.more', { model: label })}
            onClick={() => setOpen((o) => !o)}
          >
            <Chevron up={open} />
            <span className="perf-name">{label}</span>
          </button>
        </th>
        <Figures numbers={row} />
      </tr>
      {open ? (
        <>
          <tr className="perf-sub-head">
            <td colSpan={7}>{t('perf.models')}</td>
          </tr>
          {row.models.map((model) => (
            <tr key={model.model} className="perf-sub">
              <th scope="row">
                <span className="perf-model">{model.model}</span>
              </th>
              <Figures numbers={model} />
            </tr>
          ))}
          <tr className="perf-sub-head">
            <td colSpan={7}>{t('perf.steps')}</td>
          </tr>
          {row.steps.map((step) => (
            <tr key={`${step.board}\u0000${step.step}`} className="perf-sub">
              <th scope="row">
                {oneBoard ? null : <span className="perf-board">{step.board} › </span>}
                {step.stepName}
              </th>
              <Figures numbers={step} />
            </tr>
          ))}
        </>
      ) : null}
    </tbody>
  );
}

const COLUMNS = [
  ['perf.col.handoffs', undefined],
  ['perf.col.back', undefined],
  ['perf.col.rounds', 'perf.tip.rounds'],
  ['perf.col.done', 'perf.tip.done'],
  ['perf.col.discards', 'perf.tip.discards'],
  ['perf.col.time', 'perf.tip.time'],
] as const;

function Table({ view, oneBoard }: { view: PerformanceView; oneBoard: boolean }) {
  return (
    <table className="perf-table">
      <thead>
        <tr>
          <th scope="col">{t('perf.col.model')}</th>
          {COLUMNS.map(([key, tip]) => {
            const words = tip === undefined ? undefined : t(tip);
            return (
              <th key={key} scope="col" className="num" data-tip={words} title={words}>
                {t(key)}
              </th>
            );
          })}
        </tr>
      </thead>
      {view.rows.map((row) => (
        <Row key={`${row.family}\u0000${row.effort}`} row={row} oneBoard={oneBoard} />
      ))}
    </table>
  );
}

export function PerformanceBody({ view, oneBoard }: { view: PerformanceView; oneBoard: boolean }) {
  if (view.rows.length === 0) {
    return (
      <div className="perf-empty">
        <p className="pane-message">{t('perf.empty')}</p>
        <p className="pj-hint">
          {tx('perf.emptyHint', { command: <code className="pj-code">otea profile</code> })}
        </p>
      </div>
    );
  }
  const reading = readingOf(view.rows);
  return (
    <>
      {reading ? (
        <p className="perf-reading">{reading}</p>
      ) : (
        <p className="perf-few">{t('perf.few', { n: MIN_HANDOFFS })}</p>
      )}
      <Table view={view} oneBoard={oneBoard} />
    </>
  );
}

export function ModelPerformance() {
  const app = useApp();
  const [period, setPeriod] = useState<Period>('30d');
  const [board, setBoard] = useState('');
  const load = useCallback(
    (signal: AbortSignal) => fetchPerformance({ board: board || undefined, since: period }, signal),
    [board, period],
  );
  const remote = useRemote(load, app.version, app.connection);
  const name = app.project?.name ?? '';
  const boards = app.collections.map(({ name: each }) => each);
  return (
    <div className="page perf">
      <header className="head" data-enter="head">
        <div className="kicker">
          <b>{t('perf.kicker')}</b> &nbsp;·&nbsp; {name}
        </div>
        <h1 className="display">{t('perf.display')}</h1>
        <p className="dek">{t('perf.dek', { name })}</p>
      </header>
      <div className="perf-body" data-enter="fade">
        <div className="perf-tools">
          <Seg
            label={t('perf.period')}
            value={period}
            options={PERIODS.map((value) => ({ value, label: t(`perf.period.${value}`) }))}
            onChange={setPeriod}
          />
          <select
            className="perf-boards"
            aria-label={t('perf.board')}
            value={board}
            onChange={(event) => setBoard(event.target.value)}
          >
            <option value="">{t('perf.allBoards')}</option>
            {boards.map((each) => (
              <option key={each} value={each}>
                {each}
              </option>
            ))}
          </select>
        </div>
        {remote.status === 'ready' ? (
          <PerformanceBody view={remote.value} oneBoard={board !== ''} />
        ) : (
          <p
            className={
              remote.status === 'failed' ? 'pane-message action-error' : 'pane-message t-small'
            }
          >
            {remote.status === 'failed' ? remote.message : t('common.loading')}
          </p>
        )}
        <p className="perf-note">
          {t('perf.declared')} {t('perf.how')}
        </p>
      </div>
    </div>
  );
}
