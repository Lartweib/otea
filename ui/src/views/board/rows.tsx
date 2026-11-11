import type { MouseEvent, ReactNode } from 'react';
import type { FeedEvent } from '../../activity.ts';
import { agentOf, isStuck } from '../../derive/toca.ts';
import { whenText } from '../../derive/when.ts';
import type { GridColumn } from '../../grid.ts';
import { t } from '../../i18n/i18n.ts';
import { AgentMark, Checkbox, EnumChip, SeverityBars, StepPill } from '../../kit/Marks.tsx';
import { laneOf } from '../../lanes/geometry.ts';
import type { LaneBlock } from '../../lanes/LaneList.tsx';
import { lookOf } from '../../lanes/looks.ts';
import { stateWordIn } from '../../preset-words.ts';
import type { CollectionView, Item } from '../../types.ts';
import { type Entry, roundOf, severityOf, signalOf } from './model.ts';
import { cellClass } from './table.ts';

// The rows of Lista (board rows on the lanes, mock:1725-1733) and Tabla (40 px rows whose cells
// share the table's tracks, mock:1694-1710), built as LaneList blocks from the board's entries.

export type RowCtx = {
  collection: CollectionView;
  now: number;
  feed: readonly FeedEvent[];
  selected: string | undefined;
  ticked: ReadonlySet<string>;
  // Whether a parent's children show (the fold button's state, which leads the rows').
  open: (id: string) => boolean;
  onFold: (id: string) => void;
  onTick: (id: string, shift: boolean) => void;
};

const MIN = 60_000;

// How long, as a row says it: 12 min, 3 h, 2 días.
export function since(iso: string, now: number): string {
  const m = (now - Date.parse(iso)) / MIN;
  if (m < 1) return t('when.now');
  if (m < 60) return t('when.minutes', { minutes: Math.floor(m) });
  if (m < 1440) return t('when.hours', { hours: Math.round(m / 60) });
  if (m < 2880) return t('when.yesterday');
  return t('when.days', { count: Math.round(m / 1440) });
}

export function Who({ item, feed }: { item: Item; feed: readonly FeedEvent[] }) {
  if (item.turn === 'human') return <AgentMark you />;
  return <AgentMark name={agentOf(item, feed)} />;
}

export function FoldButton({
  item,
  n,
  open,
  onFold,
}: {
  item: Item;
  n: number;
  open: boolean;
  onFold: (id: string) => void;
}) {
  const click = (e: MouseEvent) => {
    e.stopPropagation();
    onFold(item.id);
  };
  return (
    <button
      type="button"
      className="fold"
      data-fold={item.id}
      aria-expanded={open}
      aria-label={t(open ? 'list.fold' : 'list.show', { count: n, id: item.id })}
      onClick={click}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <svg className="fg" viewBox="0 0 8 8" aria-hidden="true">
        <path d="M1.5 2.75 4 5.25l2.5-2.5" />
      </svg>
      <span className="sg">{open ? '−' : '+'}</span>
      {t('boardView.inside', { count: n })}
    </button>
  );
}

// Children's progress: one bar each, and how many are open.
function Progress({ item }: { item: Item }) {
  const c = item.children;
  if (!c || c.total === 0) return null;
  const bars: ReactNode[] = [];
  for (let i = 0; i < c.total; i++) {
    const cls = i < c.done + c.discarded ? 'done' : 'ag';
    bars.push(<i key={i} className={cls} />);
  }
  return (
    <>
      <span className="sep">·</span>
      <span className="prog">{bars}</span>
      <span className="po">{t('boardView.kidsOpen', { open: c.open, total: c.total })}</span>
    </>
  );
}

const rowBase = (e: Extract<Entry, { kind: 'row' }>, ctx: RowCtx) => ({
  kind: 'row' as const,
  key: e.item.id,
  lane: laneOf(e.item.turn),
  look: lookOf(e.item, ctx.now),
  sec: `g:${e.sec}`,
  child: e.child,
  selected: ctx.selected === e.item.id,
});

const typeOf = (it: Item, c: CollectionView) =>
  c.types.find((ty) => ty.name === it.type) ?? c.types[0];

function groupBlock(e: Extract<Entry, { kind: 'group' }>): LaneBlock {
  return { kind: 'sec', key: `sec:${e.key}`, title: e.title, count: e.count };
}

// ---- Lista ----

export function listaBlocks(entries: readonly Entry[], ctx: RowCtx): LaneBlock[] {
  return entries.map((e): LaneBlock => {
    if (e.kind === 'group') return groupBlock(e);
    const it = e.item;
    const word = stateWordIn(ctx.collection.types, it.state);
    const when = whenText(it, ctx.now);
    const stuck = isStuck(it, ctx.now);
    const round = roundOf(it, ctx.feed, typeOf(it, ctx.collection));
    const signal = signalOf(it, ctx.collection);
    const sev = severityOf(it, ctx.collection);
    return {
      ...rowBase(e, ctx),
      ...(e.hidden ? { className: 'ghost folded' } : {}),
      content: (
        <>
          <div className="main-c">
            <div className="t" data-leaf="" data-title="">
              <span className="tt" data-s={`${it.id}:t`}>
                {it.title}
              </span>
              {e.kids > 0 ? (
                <FoldButton item={it} n={e.kids} open={ctx.open(it.id)} onFold={ctx.onFold} />
              ) : null}
            </div>
            <div className="m" data-leaf="">
              <span className="id" data-s={`${it.id}:id`}>
                {it.id}
              </span>
              <span className="sep">·</span>
              <span className={it.turn === 'human' ? 'stp you' : 'stp'}>{word}</span>
              {e.kids > 0 ? <Progress item={it} /> : null}
              {stuck && it.expiredLease ? (
                <>
                  <span className="sep">·</span>
                  <span className="warn">
                    {t('boardView.quiet', { time: since(it.expiredLease.expiresAt, ctx.now) })}
                  </span>
                </>
              ) : round > 1 ? (
                <>
                  <span className="sep">·</span>
                  <span className="round">{t('boardView.round', { n: round })}</span>
                </>
              ) : null}
              {signal ? (
                <>
                  <span className="sep">·</span>
                  <span>{signal}</span>
                </>
              ) : null}
            </div>
          </div>
          <span className="sev" data-leaf="">
            {sev === null ? null : <SeverityBars level={sev} />}
          </span>
          <span className="who" data-leaf="" data-s={`${it.id}:who`}>
            <Who item={it} feed={ctx.feed} />
          </span>
          <span className={when.warn ? 'age warn' : 'age'} data-leaf="" data-s={`${it.id}:when`}>
            {when.text}
          </span>
        </>
      ),
    };
  });
}

// ---- Tabla ----

function Cell({ column, item, ctx }: { column: GridColumn; item: Item; ctx: RowCtx }) {
  const cls = `c ${cellClass(column.key)}`;
  const after = column.kind !== 'id' && column.kind !== 'title';
  const pad = after ? { paddingLeft: 'var(--gap)' } : undefined;
  switch (column.kind) {
    case 'id':
      return (
        <span className={cls} data-leaf="">
          <span className="id" data-s={`${item.id}:id`}>
            {item.id}
          </span>
        </span>
      );
    case 'state': {
      const tone = item.turn === 'human' ? 'you' : item.turn === 'none' ? 'none' : undefined;
      return (
        <span className={cls} style={pad} data-leaf="">
          <StepPill {...(tone ? { tone } : {})}>
            {stateWordIn(ctx.collection.types, item.state)}
          </StepPill>
        </span>
      );
    }
    case 'type': {
      const type = ctx.collection.types.find((ty) => ty.name === item.type);
      return (
        <span className={cls} style={pad} data-leaf="">
          <EnumChip>{type?.label ?? item.type}</EnumChip>
        </span>
      );
    }
    case 'severity': {
      const sev = severityOf(item, ctx.collection);
      const v = item.fields[column.key];
      return (
        <span className={cls} style={pad} data-leaf="">
          {sev === null ? null : (
            <span className="svw">
              <SeverityBars level={sev} {...(v ? { label: v } : {})} />
              <span className="sw">{v}</span>
            </span>
          )}
        </span>
      );
    }
    case 'enum': {
      const v = item.fields[column.key];
      return (
        <span className={cls} style={pad} data-leaf="">
          {v ? <EnumChip>{v}</EnumChip> : null}
        </span>
      );
    }
    case 'text':
      return (
        <span className={cls} style={pad} data-leaf="">
          {item.fields[column.key] ?? ''}
        </span>
      );
    case 'who':
      return (
        <span className={`${cls} who`} style={pad} data-leaf="" data-s={`${item.id}:who`}>
          <Who item={item} feed={ctx.feed} />
        </span>
      );
    case 'age': {
      const when = whenText(item, ctx.now);
      return (
        <span
          className={`${cls} age r${when.warn ? ' warn' : ''}`}
          style={pad}
          data-leaf=""
          data-s={`${item.id}:when`}
        >
          {when.text}
        </span>
      );
    }
    default:
      return null;
  }
}

export function tablaBlocks(
  entries: readonly Entry[],
  columns: readonly GridColumn[],
  ctx: RowCtx,
): LaneBlock[] {
  return entries.map((e): LaneBlock => {
    if (e.kind === 'group') return groupBlock(e);
    const it = e.item;
    const ticked = ctx.ticked.has(it.id);
    const cls = ['trow', ticked ? 'ticked' : '', e.hidden ? 'ghost folded' : '']
      .filter(Boolean)
      .join(' ');
    return {
      ...rowBase(e, ctx),
      className: cls,
      content: (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: stops the row opening on a tick */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: the checkbox inside takes the keys */}
          <span className="c ckc" data-leaf="" onClick={(ev) => ev.stopPropagation()}>
            <Checkbox
              checked={ticked}
              aria-label={t('grid.select', { id: it.id })}
              onChange={() => undefined}
              onClick={(ev) => {
                ev.stopPropagation();
                ctx.onTick(it.id, ev.shiftKey);
              }}
              onKeyDown={(ev) => ev.stopPropagation()}
            />
          </span>
          {columns.map((c) =>
            c.kind === 'title' ? (
              <span key={c.key} className="c tcell" data-leaf="" data-title="">
                <span className="tt" data-s={`${it.id}:t`}>
                  {it.title}
                </span>
                {e.kids > 0 ? (
                  <FoldButton item={it} n={e.kids} open={ctx.open(it.id)} onFold={ctx.onFold} />
                ) : null}
              </span>
            ) : (
              <Cell key={c.key} column={c} item={it} ctx={ctx} />
            ),
          )}
        </>
      ),
    };
  });
}
