import { type DragEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { type Phase, waysOf } from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  isAgent,
  partOf,
  type Selection,
  type Step,
  stepById,
} from '../../../../src/core/board/model.ts';
import { listOf, t, tx } from '../../i18n/i18n.ts';
import { Seg } from '../../kit/Seg.tsx';
import { LaneList } from '../../lanes/LaneList.tsx';
import type { Look } from '../../lanes/looks.ts';
import { NodeGlyph } from '../../lanes/NodeGlyph.tsx';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import { Route } from '../../views/detail/Route.tsx';
import type { ReadyDraft } from '../use-board-draft.ts';
import { targetName } from '../words.ts';
import { moveTile, type Origin, PLACES, type Place, pageTiles, type Tile } from './arrange.ts';
import { GripMenu, placeName } from './GripMenu.tsx';
import { PartValue } from './PartValue.tsx';
import { definitionRoute } from './route.ts';
import { sampleRowBlock } from './SampleRow.tsx';
import { type SampleItem, sampleId, sampleTitle } from './samples.ts';
import { arrangeToast } from './toasts.tsx';

// Lo que ves: the item page at the selected step, in the item page's own grammar (its crumb,
// headline, standfirst, route and moves), the boxes in their zones, and the row it makes in the
// list. Every box says where it comes from: a click reveals its card. Acomodar turns the boxes into
// tiles that move between zones; a move only changes how things show.

export const agentWord = (who: Step['doer'] | Step['reviewer']): string =>
  isAgent(who) ? who.agent : t('bs.preview.anAgent');

export function lookAt(step: Step, phase: Phase, offline: readonly string[]): Look {
  if (phase === 'yours' || (phase === 'review' && step.reviewer === 'you')) return 'yours';
  if (phase === 'doing' && step.doer === 'you') return 'yours';
  if (phase === 'doing') {
    const agent = isAgent(step.doer) ? step.doer.agent : null;
    return agent && offline.includes(agent) ? 'waiting' : 'working';
  }
  return 'queued';
}

// Where a part is set, for «¿por qué está aquí?».
export function whereRef(def: BoardDefinition, ref: string, stepId?: string): Selection {
  if (def.form.some((entry) => entry.ref === ref) || ref === 'title') return { kind: 'form' };
  const here = stepId ? stepById(def, stepId) : undefined;
  if (here?.hand.some((hand) => hand.ref === ref)) return { kind: 'part', id: ref, step: here.id };
  const step = def.steps.find(({ hand }) => hand.some((entry) => entry.ref === ref));
  if (step) return { kind: 'part', id: ref, step: step.id };
  return { kind: 'anytime' };
}

function originText(def: BoardDefinition, origin: Origin): string {
  if (origin.kind === 'form') return t('bs.preview.from.form');
  if (origin.kind === 'anytime') return t('bs.preview.from.anytime');
  if (origin.kind === 'column') return t('bs.preview.from.column');
  return stepById(def, origin.step)?.name ?? '';
}

const offlineOf = (draft: ReadyDraft) =>
  draft.problems.filter((p) => p.code === 'agent_offline').map((p) => String(p.params.agent));

export function ItemPreview({
  draft,
  stepId,
  phase,
  onPhase,
  arranging,
}: {
  draft: ReadyDraft;
  stepId: string;
  phase: Phase;
  onPhase: (phase: Phase) => void;
  arranging: boolean;
}) {
  const { def } = draft;
  const step = stepById(def, stepId);
  if (!step) return null;
  const hasReview = step.reviewer !== 'none';
  const at: Phase = hasReview ? phase : 'doing';
  const offline = offlineOf(draft);
  const look = lookAt(step, at, offline);
  const id = sampleId(def);
  const title = sampleTitle(def);
  const yours = look === 'yours';
  const doer = step.doer === 'you' ? t('bs.preview.you') : agentWord(step.doer);
  // The doer at the start of a sentence.
  const Doer = step.doer === 'any' ? t('bs.preview.anAgentCap') : doer;
  const reviewer = agentWord(step.reviewer);
  const route = definitionRoute(def, { step: step.id, phase: at }, [], {
    done: t('bs.done'),
    dip: (n) => t('bs.preview.dip', { n }),
  });
  const ways = waysOf(def, step.id);
  const reveal = (selection: Selection) => () => {
    if (!arranging) draft.reveal(selection);
  };

  const turn = yours
    ? t(at === 'doing' ? 'bs.preview.turn.yourStep' : 'bs.preview.turn.yourReview')
    : t('bs.preview.turn.of', { who: at === 'doing' ? doer : reviewer });
  const stand: ReactNode =
    at !== 'doing'
      ? step.reviewer === 'you' || at === 'yours'
        ? tx('bs.preview.stand.handed', { who: <b>{Doer}</b> })
        : tx('bs.preview.stand.reviewing', { who: <b>{reviewer}</b> })
      : step.doer === 'you'
        ? t('bs.preview.stand.yourStep')
        : isAgent(step.doer)
          ? tx('bs.preview.stand.doing', { who: <b>{doer}</b> })
          : t('bs.preview.stand.doingAny');

  const sample: SampleItem = {
    id,
    title,
    step: step.id,
    phase: at,
    look,
    agent:
      at === 'doing'
        ? isAgent(step.doer)
          ? step.doer.agent
          : null
        : isAgent(step.reviewer)
          ? step.reviewer.agent
          : null,
    round: 1,
    closed: false,
  };

  return (
    <article className={arranging ? 'bsp-ip arr' : 'bsp-ip'}>
      <div className="crumb bsp-crumb">
        <NodeGlyph look={look} size={14} />
        <span className="id">{id}</span>
        <span aria-hidden="true">·</span>
        <span>{def.item}</span>
        <span aria-hidden="true">·</span>
        <span>{step.name}</span>
        <span className={yours ? 'turn' : 'turn other'}>{turn}</span>
      </div>
      <h3 className="headline bsp-headline">{title}</h3>
      <p className="standfirst bsp-stand">{stand}</p>
      <div className="bsp-route">
        <Route
          id={`preview:${step.id}`}
          steps={route.steps}
          words={route.words}
          ci={route.ci}
          lane={route.lane}
          look={look}
          dips={route.dips}
          phone
        />
      </div>
      {hasReview ? (
        <div className="bsp-phase">
          <Seg<Phase>
            well
            value={at === 'doing' ? 'doing' : 'review'}
            label={t('bs.preview.phase.label')}
            onChange={(value) => onPhase(value)}
            options={[
              {
                value: 'doing',
                label: t('bs.preview.phase.doing', {
                  who: step.doer === 'you' ? t('bs.preview.youLower') : doer,
                }),
              },
              {
                value: 'review',
                label: t(
                  step.reviewer === 'you'
                    ? 'bs.preview.phase.yourReview'
                    : 'bs.preview.phase.theirReview',
                ),
              },
            ]}
          />
        </div>
      ) : null}
      {step.hand.length > 0 ? (
        <div className="bsp-hcheck">
          {step.hand.map((hand) => {
            const part = partOf(def, hand.ref);
            if (!part) return null;
            const ok = at !== 'doing' && hand.req !== 'no';
            const word = ok
              ? t(hand.fresh ? 'bs.preview.check.fresh' : 'bs.preview.check.ready')
              : t(
                  hand.req === 'always'
                    ? 'bs.preview.check.missing'
                    : hand.req === 'when'
                      ? 'bs.preview.check.sometimes'
                      : 'bs.preview.check.optional',
                );
            return (
              <button
                type="button"
                key={hand.ref}
                className={['bsp-hc', ok ? 'ok' : 'miss', hand.req !== 'no' ? 'req' : ''].join(' ')}
                onClick={reveal({ kind: 'part', id: hand.ref, step: step.id })}
                title={t('bs.preview.why')}
              >
                <span className="bx" aria-hidden="true">
                  {ok ? <Tick /> : null}
                </span>
                <span>{part.name}</span>
                <small>{word}</small>
              </button>
            );
          })}
        </div>
      ) : null}
      <Moves draft={draft} step={step} at={at} ways={ways} doer={Doer} reviewer={reviewer} />
      <Zones draft={draft} step={step} at={at} arranging={arranging} />
      <div className="bsp-rowpv">
        <p className="ll">{t('bs.preview.listRow')}</p>
        <LaneList
          list="preview"
          blocks={[sampleRowBlock(def, sample, 'one')]}
          className="bsp-flat"
        />
      </div>
    </article>
  );
}

export function Tick() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="bsp-tick">
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Moves({
  draft,
  step,
  at,
  ways,
  doer,
  reviewer,
}: {
  draft: ReadyDraft;
  step: Step;
  at: Phase;
  ways: string[];
  doer: string;
  reviewer: string;
}) {
  const { def } = draft;
  const first = ways[0];
  const why = () => draft.reveal({ kind: 'step', id: step.id });
  if (at !== 'doing' && (step.reviewer === 'you' || at === 'yours'))
    return (
      <div className="actions bsp-actions">
        <button type="button" className="btn primary" onClick={why}>
          {t('bs.preview.approve', { to: first ? targetName(def, first) : t('bs.done') })}
        </button>
        {ways.length > 1 ? (
          <span className="bsp-tag">
            {t('bs.preview.orWays', {
              ways: listOf(ways.slice(1).map((w) => `→ ${targetName(def, w)}`)),
            })}
          </span>
        ) : null}
        <button type="button" className="btn quiet" onClick={why}>
          {t('bs.preview.sendBack')}
        </button>
      </div>
    );
  if (at === 'doing' && step.doer === 'you') {
    const asks = step.hand
      .filter((hand) => hand.req === 'always')
      .map((hand) => partOf(def, hand.ref)?.name ?? '');
    return (
      <div className="actions bsp-actions">
        <button type="button" className="btn primary" onClick={why}>
          {t('bs.preview.handOff')}
        </button>
        <span className="bsp-tag">
          {asks.length
            ? t('bs.preview.asks', { parts: listOf(asks) })
            : t('bs.preview.asksNothing')}
        </span>
      </div>
    );
  }
  if (at === 'doing') {
    const then =
      step.reviewer === 'you'
        ? t('bs.preview.wait.toYou')
        : step.reviewer === 'none'
          ? t('bs.preview.wait.onTo', { to: first ? targetName(def, first) : t('bs.done') })
          : t('bs.preview.wait.thenReviews', { who: reviewer });
    return (
      <button type="button" className="bsp-waitline" onClick={why}>
        {t('bs.preview.wait.doing', { who: doer, then })}
      </button>
    );
  }
  const same =
    isAgent(step.doer) && isAgent(step.reviewer) && step.doer.agent === step.reviewer.agent;
  return (
    <button type="button" className="bsp-waitline" onClick={why}>
      {t('bs.preview.wait.reviewing', { who: reviewer })}
      {same ? ` ${t('bs.preview.wait.selfReview')}` : ''}
    </button>
  );
}

type Rects = Map<string, DOMRect>;

function Zones({
  draft,
  step,
  at,
  arranging,
}: {
  draft: ReadyDraft;
  step: Step;
  at: Phase;
  arranging: boolean;
}) {
  const { def } = draft;
  const tiles = pageTiles(def, step.id);
  const host = useRef<HTMLDivElement>(null);
  const before = useRef<{ rects: Rects; moved: string; from: string } | null>(null);
  const drag = useRef<{ ref: string; fromRow: boolean } | null>(null);
  const [over, setOver] = useState<Place | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const rectsNow = (): Rects => {
    const out: Rects = new Map();
    for (const el of host.current?.querySelectorAll<HTMLElement>('.bsp-blk') ?? [])
      out.set(`${el.dataset.ref}|${el.dataset.place}`, el.getBoundingClientRect());
    return out;
  };

  // Tiles slide from where they were (FLIP); one that is new where it lands fades in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: after each move of the layout
  useLayoutEffect(() => {
    const was = before.current;
    before.current = null;
    if (!was || !host.current || reduced()) return;
    for (const el of host.current.querySelectorAll<HTMLElement>('.bsp-blk')) {
      const key = `${el.dataset.ref}|${el.dataset.place}`;
      const old =
        was.rects.get(key) ?? (el.dataset.ref === was.moved ? was.rects.get(was.from) : undefined);
      const now = el.getBoundingClientRect();
      if (old) {
        const dx = old.left - now.left;
        const dy = old.top - now.top;
        if (Math.abs(dx) + Math.abs(dy) > 0.5)
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
            duration: 560,
            easing: C.settle,
          });
      } else
        el.animate(
          [
            { opacity: 0, filter: 'blur(1px)' },
            { opacity: 1, filter: 'blur(0px)' },
          ],
          { duration: 300, delay: 200, easing: C.drift, fill: 'backwards' },
        );
    }
  }, [def.layout, def.row]);

  const move = (
    ref: string,
    to: Place | 'unrow',
    options: { before?: string; fromRow?: boolean; from: Place },
  ) => {
    const name = partOf(def, ref)?.name ?? '';
    before.current = { rects: rectsNow(), moved: ref, from: `${ref}|${options.from}` };
    draft.mutate((d) =>
      moveTile(d, ref, to, options.before, { fromRow: options.fromRow ?? false }),
    );
    arrangeToast(name, to, draft.undo);
  };

  const dropOn = (place: Place, beforeRef?: string) => (e: DragEvent) => {
    const held = drag.current;
    if (!held) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = null;
    setOver(null);
    setDragging(null);
    if (beforeRef === held.ref) return;
    move(held.ref, place, {
      ...(beforeRef ? { before: beforeRef } : {}),
      fromRow: held.fromRow && place !== 'row',
      from: held.fromRow ? 'row' : place,
    });
  };

  const tile = (item: Tile, place: Place) => {
    const part = partOf(def, item.ref);
    if (!part) return null;
    const empty = item.now && at === 'doing';
    const body =
      place === 'row' || place === 'hidden' ? null : <PartValue part={part} empty={empty} />;
    const label = (
      <div className="bsp-bl">
        <span className="margin-label">{part.name}</span>
        <span className="from">{originText(def, item.origin)}</span>
        {arranging ? (
          <GripMenu
            name={part.name}
            current={place}
            inRow={def.row.includes(item.ref)}
            onPick={(to) =>
              move(item.ref, to, {
                fromRow: place === 'row' && to !== 'row' && to !== 'unrow',
                from: place,
              })
            }
          />
        ) : null}
      </div>
    );
    if (!arranging)
      return (
        <button
          type="button"
          key={`${item.ref}|${place}`}
          className="bsp-blk why"
          data-ref={item.ref}
          data-place={place}
          title={t('bs.preview.why')}
          onClick={() => draft.reveal(whereRef(def, item.ref, step.id))}
        >
          {label}
          {body}
        </button>
      );
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: a tile dragged with the pointer; its grip menu is the keyboard's way
      <div
        key={`${item.ref}|${place}`}
        className={dragging === `${item.ref}|${place}` ? 'bsp-blk dragging' : 'bsp-blk'}
        data-ref={item.ref}
        data-place={place}
        draggable
        onDragStart={(e) => {
          drag.current = { ref: item.ref, fromRow: place === 'row' };
          setDragging(`${item.ref}|${place}`);
          try {
            e.dataTransfer.setData('text/plain', item.ref);
            e.dataTransfer.effectAllowed = 'move';
          } catch {
            // Some browsers refuse data on a drag they did not start; the ref is held above.
          }
        }}
        onDragEnd={() => {
          drag.current = null;
          setDragging(null);
          setOver(null);
        }}
        onDragOver={(e) => {
          if (drag.current) e.preventDefault();
        }}
        onDrop={dropOn(place, item.ref)}
      >
        {label}
        {body}
      </div>
    );
  };

  const zone = (place: Place) => (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop zone for the tiles above
    <div
      key={place}
      className={over === place ? 'bsp-zone over' : 'bsp-zone'}
      data-zone={place}
      onDragOver={(e) => {
        if (!arranging || !drag.current) return;
        e.preventDefault();
        if (over !== place) setOver(place);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && over === place)
          setOver(null);
      }}
      onDrop={dropOn(place)}
    >
      <span className="zl">
        <span>{placeName(place)}</span>
        <span>{t(`bs.preview.zone.${place}.gloss` as 'bs.preview.zone.top.gloss')}</span>
      </span>
      {tiles[place].map((item) => tile(item, place))}
      <span className="zempty">{t('bs.preview.dropHere')}</span>
    </div>
  );

  return (
    <div className="bsp-zones" ref={host}>
      {PLACES.map(zone)}
    </div>
  );
}
