import type { ReactNode } from 'react';
import { momentLabel } from '../format.ts';
import { t } from '../i18n/i18n.ts';
import { AgentMark, NodeMark } from '../kit/index.ts';
import { type Round, roundFiles, roundsOf } from '../rounds.ts';
import type { Evidence, ItemView, LayoutEntry, TypeView } from '../types.ts';
import { ImageSingle } from './evidence/ImageViews.tsx';
import { VideoPlayer } from './evidence/VideoViews.tsx';

const STEP = 210;
const AG = 18;
const YOU = 54;

// The item's own path between the lanes: down to your lane at the end of each round, back up with
// each verdict, into the trunk once it closes.
function Rail({ rounds, closed }: { rounds: Round[]; closed: boolean }) {
  const width = Math.max(rounds.length * STEP + 64, 320);
  const xs = rounds.map((_, index) => 64 + index * STEP + STEP / 2 - 40);
  let d = `M0 ${AG}`;
  xs.forEach((x, index) => {
    d += ` H${x - 40} C${x - 18} ${AG} ${x - 18} ${YOU} ${x} ${YOU}`;
    if (rounds[index]?.verdict?.kind === 'sent-back') {
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
      {rounds.map((round, index) => (
        <span
          key={round.n}
          className="rd-label"
          data-now={index === rounds.length - 1 || undefined}
          style={{ left: xs[index] }}
        >
          <b>{t('rounds.round', { n: round.n })}</b>
          <span className="t-cap">
            {momentLabel(round.endedAt, Date.now())} · {verdictWord(round)}
          </span>
        </span>
      ))}
    </div>
  );
}

function verdictWord(round: Round): string {
  const { verdict } = round;
  if (!verdict) return t('rounds.yourVerdict');
  if (verdict.kind === 'sent-back')
    return t('rounds.sentBackAt', { at: momentLabel(verdict.at, Date.now()) });
  return t('rounds.closedAs', { state: verdict.to });
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

function VerdictLine({ round }: { round: Round }) {
  const { verdict } = round;
  if (!verdict) return <p className="rd-verdict-line t-small">{t('rounds.waiting')}</p>;
  const by = verdict.relayedBy ? t('rounds.relayedBy', { agent: verdict.relayedBy }) : '';
  const what =
    verdict.kind === 'sent-back'
      ? t('rounds.sentBack', { at: momentLabel(verdict.at, Date.now()) })
      : t('rounds.closedIn', {
          state: verdict.to,
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

function Earlier({ rounds }: { rounds: Round[] }): ReactNode {
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
            <VerdictLine round={round} />
          </li>
        ))}
      </ol>
    </details>
  );
}

type RoundsModuleProps = { item: ItemView; type: TypeView; entry: LayoutEntry };

// The item's rounds, read from its history: the path between the lanes, the latest round with its
// note, its files beside the round before's, and its verdict; earlier rounds fold below.
export function RoundsModule({ item, type, entry }: RoundsModuleProps) {
  const rounds = roundsOf(item.events, item.evidence, type.states);
  const modules = type.layout.evidence.flatMap(({ id }) => (id === undefined ? [] : [id]));
  const title = entry.label ?? t('rounds.title');
  const latest = rounds.at(-1);
  if (!latest) {
    return (
      <section className="rd-module" aria-label={title}>
        <h2 className="t-label">{title}</h2>
        <p className="t-small rd-none">{t('rounds.none')}</p>
      </section>
    );
  }
  const previous = rounds.at(-2);
  const closed = latest.verdict?.kind === 'closed';
  return (
    <section className="rd-module" aria-label={title}>
      <div className="rd-head">
        <h2 className="t-label">{title}</h2>
        <span className="t-cap">{t('rounds.count', { count: rounds.length })}</span>
      </div>
      <div className="rd-scroll">
        <Rail rounds={rounds} closed={closed} />
      </div>
      <article className="rd-current">
        <header className="rd-current-head">
          <h3 className="t-h">{t('rounds.round', { n: latest.n })}</h3>
          <span className="t-cap">
            {previous ? t('rounds.against', { n: previous.n }) : t('rounds.first')}
          </span>
        </header>
        <Note round={latest} />
        <Compare current={latest} previous={previous} modules={modules} />
        <VerdictLine round={latest} />
      </article>
      <Earlier rounds={rounds.slice(0, -1)} />
    </section>
  );
}
