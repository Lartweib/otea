import { type ReactNode, useState } from 'react';
import { moveItem } from '../api.ts';
import { feedbackOf, frameLabel, toggleMark, verdictMoves } from '../compare.ts';
import { momentLabel } from '../format.ts';
import { t } from '../i18n/i18n.ts';
import { AgentMark, Button, NodeMark } from '../kit/index.ts';
import { stateWord } from '../preset-words.ts';
import { type BoardRounds, type Round, roundFiles, roundsOf } from '../rounds.ts';
import type { Evidence, ItemView, LayoutEntry, TypeView } from '../types.ts';
import { CompareRounds } from './CompareRounds.tsx';
import { ImageSingle } from './evidence/ImageViews.tsx';
import { VideoPlayer } from './evidence/VideoViews.tsx';

const STEP = 210;
const AG = 18;
const YOU = 54;

// A state as the preset names it in the language on screen.
type StateName = (state: string) => string;

// The item's own path between the lanes: down to your lane at the end of each round, back up with
// each verdict, into the trunk once it closes. Under each node, its round on three short lines (the
// round, when it was handed in, the verdict), each narrower than the gap between nodes so labels
// never meet; the whole label is its title.
function Rail({ rounds, closed, name }: { rounds: Round[]; closed: boolean; name: StateName }) {
  const width = Math.max(rounds.length * STEP + 64, 320);
  const xs = rounds.map((_, index) => 64 + index * STEP + STEP / 2 - 40);
  let d = `M0 ${AG}`;
  xs.forEach((x, index) => {
    d += ` H${x - 40} C${x - 18} ${AG} ${x - 18} ${YOU} ${x} ${YOU}`;
    const kind = rounds[index]?.verdict?.kind;
    if (kind === 'sent-back' || kind === 'approved') {
      d += ` C${x + 18} ${YOU} ${x + 18} ${AG} ${x + 40} ${AG}`;
    }
  });
  const last = xs.at(-1);
  const tail =
    last === undefined
      ? `H${width}`
      : closed
        ? `M${last} ${YOU} C${last + 22} ${YOU} ${last + 22} 36 ${last + 44} 36 H${width}`
        : rounds.at(-1)?.verdict
          ? `M${last + 40} ${AG} H${width}`
          : '';
  return (
    <div className="rd-rail" style={{ width }}>
      <svg width={width} height={YOU + 12} viewBox={`0 0 ${width} ${YOU + 12}`} aria-hidden="true">
        <path className="ln" d={`M0 ${AG} H${width}`} />
        <path className="lny" d={`M0 ${YOU} H${width}`} />
        <path className="rd-path" d={d} />
        {tail ? <path className="rd-path" d={tail} /> : null}
        {rounds.map((round, index) => {
          const x = xs[index] ?? 0;
          const now = index === rounds.length - 1;
          const kind =
            round.verdict?.kind === 'closed'
              ? round.verdict.closes === 'done'
                ? 'done'
                : 'discarded'
              : now
                ? 'you'
                : undefined;
          return (
            <g key={round.n}>
              {kind ? (
                <NodeMark kind={kind} cx={x} cy={YOU} r={7} />
              ) : (
                <circle className="rd-past" cx={x} cy={YOU} r={4.5} />
              )}
              {round.verdict?.kind === 'sent-back' ? (
                <circle className="rd-verdict" cx={x + 40} cy={AG} r={3} />
              ) : null}
            </g>
          );
        })}
      </svg>
      <span className="rd-lane" data-lane="agent">
        {t('list.laneAgents')}
      </span>
      <span className="rd-lane" data-lane="you">
        {t('list.laneYou')}
      </span>
      {rounds.map((round, index) => {
        const lines = [
          t('rounds.round', { n: round.n }),
          momentLabel(round.endedAt, Date.now()),
          verdictWord(round, name),
        ];
        return (
          <span
            key={round.n}
            className="rd-label"
            data-now={index === rounds.length - 1 || undefined}
            style={{ left: xs[index], maxWidth: STEP - 24 }}
            title={lines.join(' · ')}
          >
            <b>{lines[0]}</b>
            <span className="t-cap rd-line">{lines[1]}</span>
            <span className="t-cap rd-line">{lines[2]}</span>
          </span>
        );
      })}
    </div>
  );
}

function verdictWord(round: Round, name: StateName): string {
  const { verdict } = round;
  if (!verdict) return t('rounds.yourVerdict');
  if (verdict.kind === 'sent-back')
    return t('rounds.sentBackAt', { at: momentLabel(verdict.at, Date.now()) });
  if (verdict.kind === 'approved')
    return t('rounds.approvedAt', { at: momentLabel(verdict.at, Date.now()) });
  return t('rounds.closedAs', { state: name(verdict.to) });
}

function Media({ entry }: { entry: Evidence }) {
  if (entry.kind === 'video') return <VideoPlayer evidence={entry} />;
  if (entry.kind === 'image') return <ImageSingle evidence={entry} />;
  return <span className="rd-file t-cap">{entry.filename}</span>;
}

// This round's files beside the same module's files of the round before, under one heading each.
function Compare({
  current,
  previous,
  modules,
}: {
  current: Round;
  previous: Round | undefined;
  modules: string[];
}) {
  const pairs = modules.flatMap((module) => {
    const now = roundFiles(current, module)[0];
    if (!now) return [];
    return [{ module, now, before: roundFiles(previous, module)[0] }];
  });
  const loose = current.evidence.filter(
    ({ module }) => module === null || !modules.includes(module),
  );
  if (pairs.length === 0 && loose.length === 0) {
    return <p className="t-small rd-none">{t('rounds.noFiles')}</p>;
  }
  return (
    <div className="rd-media">
      {pairs.map(({ module, now, before }) => (
        <div key={module} className="rd-pair" data-single={before ? undefined : true}>
          {before && previous ? (
            <figure className="rd-side">
              <figcaption className="t-cap">
                {t('rounds.round', { n: previous.n })} · {before.filename}
              </figcaption>
              <Media entry={before} />
            </figure>
          ) : null}
          <figure className="rd-side">
            <figcaption className="t-cap">
              {t('rounds.round', { n: current.n })} · {now.filename}
            </figcaption>
            <Media entry={now} />
          </figure>
        </div>
      ))}
      {loose.length > 0 ? (
        <p className="t-cap rd-loose">{loose.map(({ filename }) => filename).join(' · ')}</p>
      ) : null}
    </div>
  );
}

function Note({ round }: { round: Round }) {
  return (
    <p className="rd-note">
      <AgentMark name={round.by.name} decorative />
      <span className="rd-who">{round.by.name}</span>
      {round.note ? <q>{round.note}</q> : <span className="t-cap">{t('rounds.noNote')}</span>}
    </p>
  );
}

function VerdictLine({ round, name }: { round: Round; name: StateName }) {
  const { verdict } = round;
  if (!verdict) return <p className="rd-verdict-line t-small">{t('rounds.waiting')}</p>;
  const by = verdict.relayedBy ? t('rounds.relayedBy', { agent: verdict.relayedBy }) : '';
  const what =
    verdict.kind === 'sent-back'
      ? t('rounds.sentBack', { at: momentLabel(verdict.at, Date.now()) })
      : verdict.kind === 'approved'
        ? t('rounds.approved', { at: momentLabel(verdict.at, Date.now()) })
        : t('rounds.closedIn', {
            state: name(verdict.to),
            n: round.n,
            at: momentLabel(verdict.at, Date.now()),
          });
  return (
    <p className="rd-verdict-line t-small" data-kind={verdict.kind}>
      <b>{what}</b>
      {by ? ` · ${by}` : ''}
      {verdict.reason ? (
        <>
          {' · '}
          <q>{verdict.reason}</q>
        </>
      ) : null}
    </p>
  );
}

function Earlier({ rounds, name }: { rounds: Round[]; name: StateName }): ReactNode {
  if (rounds.length === 0) return null;
  return (
    <details className="rd-earlier">
      <summary className="t-label">{t('rounds.earlier', { count: rounds.length })}</summary>
      <ol>
        {[...rounds].reverse().map((round) => (
          <li key={round.n}>
            <span className="rd-earlier-head">
              <b>{t('rounds.round', { n: round.n })}</b>
              <span className="t-cap">{momentLabel(round.endedAt, Date.now())}</span>
              <span className="t-cap">
                {round.evidence.map(({ filename }) => filename).join(' · ')}
              </span>
            </span>
            <Note round={round} />
            <VerdictLine round={round} name={name} />
          </li>
        ))}
      </ol>
    </details>
  );
}

type RoundsModuleProps = {
  item: ItemView;
  type: TypeView;
  entry: LayoutEntry;
  canWrite: boolean;
  // The data attributes of its place in the layout (slotData), for Studio to find it.
  slot?: Readonly<Record<string, string>>;
  // A Studio board draws its round notes above: no "no rounds yet" under them.
  quiet?: boolean;
  // On a board: its rounds are its step's, as the step engine counts them.
  board?: BoardRounds;
};

// The item's rounds, read from its history: the path between the lanes, the latest round with its
// note, its files beside the round before's, and its verdict; earlier rounds fold below.
// The verdict, given where the round is read: a note, the frames marked on the clock, then approve
// or send back. Sending back needs feedback: the note, the marks, or both.
function Verdict({
  item,
  round,
  marks,
  onUnmark,
}: {
  item: ItemView;
  round: Round;
  marks: number[];
  onUnmark: (frame: number) => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { approve, sendBack } = verdictMoves(item.transitions);
  const feedback = feedbackOf(note, marks, t('compare.marked'));
  const move = (to: string, reason: string) => {
    setBusy(true);
    setError(undefined);
    moveItem(item.id, to, reason).then(
      () => setBusy(false),
      (failure: unknown) => {
        setBusy(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
  };
  if (!approve && !sendBack) return null;
  return (
    <div className="rd-verdict-form">
      <label className="t-label" htmlFor={`verdict-${item.id}`}>
        {t('compare.noteLabel', { n: round.n + 1 })}
      </label>
      {marks.length > 0 ? (
        <span className="rd-marks">
          {marks.map((mark) => (
            <button key={mark} type="button" className="rd-markchip" onClick={() => onUnmark(mark)}>
              {frameLabel(mark)}
              <span aria-hidden="true"> ×</span>
            </button>
          ))}
        </span>
      ) : null}
      <textarea
        id={`verdict-${item.id}`}
        className="rd-note-input"
        rows={2}
        value={note}
        placeholder={t('compare.notePlaceholder')}
        onChange={(event) => setNote(event.target.value)}
      />
      {error ? <p className="action-error t-small">{error}</p> : null}
      <div className="rd-verdict-actions">
        {approve ? (
          <Button variant="primary" disabled={busy} onClick={() => move(approve.to, note.trim())}>
            {t('compare.approve', { n: round.n })}
          </Button>
        ) : null}
        {sendBack ? (
          <Button
            disabled={busy || (sendBack.reasonRequired && feedback === '')}
            onClick={() => move(sendBack.to, feedback)}
          >
            {marks.length > 0
              ? t('compare.sendBackMarks', { count: marks.length })
              : t('compare.sendBack')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function RoundsModule({
  item,
  type,
  entry,
  canWrite,
  slot,
  quiet,
  board,
}: RoundsModuleProps) {
  const [marks, setMarks] = useState<number[]>([]);
  const rounds = roundsOf(item.events, item.evidence, type.states, board);
  const modules = type.layout.evidence.flatMap(({ id }) => (id === undefined ? [] : [id]));
  const title = entry.label ?? t('rounds.title');
  const name: StateName = (state) => stateWord(type, state);
  const latest = rounds.at(-1);
  if (!latest) {
    if (quiet) return null;
    return (
      <section className="rd-module" aria-label={title} {...slot}>
        <h2 className="t-label">{title}</h2>
        <p className="t-small rd-none">{t('rounds.none')}</p>
      </section>
    );
  }
  const previous = rounds.at(-2);
  const closed = latest.verdict?.kind === 'closed';
  return (
    <section className="rd-module" aria-label={title} {...slot}>
      <div className="rd-head">
        <h2 className="t-label">{title}</h2>
        <span className="t-cap">{t('rounds.count', { count: rounds.length })}</span>
      </div>
      <div className="rd-scroll">
        <Rail rounds={rounds} closed={closed} name={name} />
      </div>
      <article className="rd-current">
        <header className="rd-current-head">
          <h3 className="t-h">{t('rounds.round', { n: latest.n })}</h3>
          <span className="t-cap">
            {previous ? t('rounds.against', { n: previous.n }) : t('rounds.first')}
          </span>
        </header>
        <Note round={latest} />
        {previous ? (
          <CompareRounds
            rounds={rounds}
            modules={modules}
            marks={marks}
            onMark={(frame) => setMarks((current) => toggleMark(current, frame))}
          />
        ) : (
          <Compare current={latest} previous={previous} modules={modules} />
        )}
        {canWrite && !latest.verdict && item.turn === 'human' ? (
          <Verdict
            item={item}
            round={latest}
            marks={marks}
            onUnmark={(frame) => setMarks((current) => toggleMark(current, frame))}
          />
        ) : (
          <VerdictLine round={latest} name={name} />
        )}
      </article>
      <Earlier rounds={rounds.slice(0, -1)} name={name} />
    </section>
  );
}
