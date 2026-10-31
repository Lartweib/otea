import { type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchItem, moveItem } from '../api.ts';
import { ageLabel } from '../format.ts';
import { useActiveLease } from '../hooks.ts';
import { showsTypes, typeOf } from '../item-types.ts';
import { keyTargetOf } from '../keys.ts';
import { Button, Icon, Kbd, NODE_LABEL, Node, Pill, TypeTag } from '../kit/index.ts';
import { moduleFor } from '../modules/registry.ts';
import { valuesOf } from '../modules/values.ts';
import { MOTION, reducedMotion } from '../motion.ts';
import { itemNodeKind } from '../node-kind.ts';
import { openLabel } from '../relations.ts';
import { hashFor } from '../selection.ts';
import {
  type Direction,
  dragIntent,
  dragProgress,
  queueOf,
  releaseDirection,
  swipeAction,
  type TriagePlan,
  triagePlan,
} from '../triage.ts';
import type { Item, Move, Turn } from '../types.ts';
import type { CollectionOf } from './ItemList.tsx';
import { type Exit, type Flight, leaveStage } from './triage-flight.ts';

// What happened to a card: moved to a state (handing the turn to `turn`), or skipped (to is
// undefined).
type Decision = { id: string; title: string; to?: string; turn?: Turn };

type TriageProps = {
  // What waits for you, in list order.
  waiting: Item[];
  // The list is still loading: nothing is said about an empty turn yet.
  loading?: boolean;
  collectionOf: CollectionOf;
  version: number;
  onExit: () => void;
};

// A card that moves (leaves, settles back, comes up) moves layout: the slow token.
const SLIDE = { duration: MOTION.slow, easing: MOTION.ease };

// The field that leads a card as plain text, as it leads the detail.
const LEAD = 'description';

// The pull of a drag, 0 to 1, read by the card's stamps and the cards behind it.
function pull(card: HTMLElement, progress: number, lean?: Direction) {
  card.parentElement?.style.setProperty('--p', String(progress));
  if (lean) card.dataset.lean = lean;
  else delete card.dataset.lean;
}

function settle(card: HTMLElement) {
  const from = card.style.transform || 'none';
  card.style.transform = '';
  pull(card, 0);
  if (reducedMotion() || from === 'none') return;
  card.animate([{ transform: from }, { transform: 'none' }], SLIDE);
}

// The marks an item's card starts with: where it stands, its id, state and collection.
function CardTags({ item, collectionOf }: { item: Item; collectionOf: CollectionOf }) {
  const lease = useActiveLease(item.lease);
  const collection = collectionOf(item.collection);
  const kind = itemNodeKind(item, typeOf(collection, item.type), lease !== null);
  return (
    <div className="detail-tags">
      <Node kind={kind} label={NODE_LABEL[kind]} />
      {showsTypes(collection) ? (
        <TypeTag name={item.type} label={typeOf(collection, item.type)?.label ?? item.type} />
      ) : null}
      <span className="t-id">{item.id}</span>
      <Pill tone="state" yours={item.turn === 'human'}>
        {item.state}
      </Pill>
      <span className="t-cap">{item.collection}</span>
    </div>
  );
}

// Where the item stands, at the foot of the card: who holds it, its children, what it is tied to,
// how long ago it changed.
function CardStanding({ item }: { item: Item }) {
  const lease = useActiveLease(item.lease);
  const age = ageLabel(item.updatedAt, Date.now());
  const facts = [
    lease ? `held by ${lease.holder}` : null,
    item.children ? `children ${openLabel(item.children)}` : null,
    ...(item.relations ?? [])
      .filter(({ kind }) => kind !== 'parent')
      .map(({ kind, id }) => `${kind.replace('_', ' ')} ${id}`),
    age === '' ? null : `updated ${age === 'now' ? 'just now' : `${age} ago`}`,
  ].filter((fact): fact is string => fact !== null);
  return <p className="tcard-standing t-cap">{facts.join(' · ')}</p>;
}

// The card waiting behind the top one, already complete: when the top one leaves, this is what is
// seen rising, never an empty frame. Hidden from assistive tech and the keyboard until its turn.
function NextCard({ item, collectionOf }: { item: Item; collectionOf: CollectionOf }) {
  return (
    <div className="tcard raised tcard-next" aria-hidden="true" inert>
      <div className="tcard-head">
        <CardTags item={item} collectionOf={collectionOf} />
      </div>
      <p className="tcard-title">{item.title}</p>
      <CardBody item={item} collectionOf={collectionOf} />
      <CardStanding item={item} />
    </div>
  );
}

// What the card says about the item: the description as plain text, then the other fields.
function CardBody({ item, collectionOf }: { item: Item; collectionOf: CollectionOf }) {
  const values = valuesOf(typeOf(collectionOf(item.collection), item.type)?.fields, item.fields);
  const lead = values.find(({ field }) => field.name === LEAD);
  const rest = values.filter((value) => value !== lead);
  const Lead = lead ? moduleFor(lead.field.module).Detail : undefined;
  if (!lead && rest.length === 0) return <p className="t-small tcard-empty">No fields.</p>;
  return (
    <>
      {lead && Lead ? (
        <div className="tcard-lead">
          <Lead field={lead.field} value={lead.value} />
        </div>
      ) : null}
      {rest.length > 0 ? (
        <dl className="tcard-fields">
          {rest.map(({ field, value }) => {
            const { Detail } = moduleFor(field.module);
            return (
              <div key={field.name} className="tcard-field">
                <dt>{field.name}</dt>
                <dd>
                  <Detail field={field} value={value} />
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </>
  );
}

type Drag = {
  pointer: number;
  x: number;
  y: number;
  dx: number;
  t: number;
  vx: number;
  live: boolean;
};

type CardStep =
  | { step: 'idle'; error?: string }
  | { step: 'explaining'; move: Move; reason: string; error?: string }
  | { step: 'posting' };

// A card on its way out: what was decided, the move being posted, and how to bring the card back
// if the move fails. The mode flies it to where it goes (see triage-flight.ts).
type Leaving = {
  element: HTMLElement;
  exit: Exit;
  decision: Decision;
  moved: Promise<unknown>;
  restore: (message: string) => void;
};

type CardProps = {
  item: Item;
  collectionOf: CollectionOf;
  plan: TriagePlan | undefined;
  // The mode holds on to the card's item from the first move until it has left.
  onLeave: (leaving: Leaving) => void;
  // How many cards wait behind this one (drawn as a stack, at most two), and the first of them.
  behind: number;
  next: Item | undefined;
};

function TriageCard({ item, collectionOf, plan, onLeave, behind, next }: CardProps) {
  const card = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const [state, setState] = useState<CardStep>({ step: 'idle' });
  const ready = plan !== undefined && state.step === 'idle';

  // The card rises from where the next card waited (it is that card, brought forward): a
  // transform only, so nothing behind it shows through. Reduced motion: it crossfades.
  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    if (reducedMotion()) {
      element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast });
      return;
    }
    element.animate([{ transform: 'translateY(10px) scale(0.97)' }, { transform: 'none' }], SLIDE);
  }, []);

  const commit = (exit: Exit, move: Move | undefined, reason = '') => {
    const element = card.current;
    if (!element || state.step === 'posting') return;
    setState({ step: 'posting' });
    onLeave({
      element,
      exit,
      decision:
        move === undefined
          ? { id: item.id, title: item.title }
          : { id: item.id, title: item.title, to: move.to, turn: move.turn },
      moved: move === undefined ? Promise.resolve() : moveItem(item.id, move.to, reason),
      restore: (message) => {
        settle(element);
        setState(
          reason === '' || move === undefined
            ? { step: 'idle', error: message }
            : { step: 'explaining', move, reason, error: message },
        );
      },
    });
  };

  const act = (direction: Direction) => {
    if (!plan) return;
    const action = swipeAction(direction, plan);
    const move = direction === 'right' ? plan.forward : plan.back;
    const element = card.current;
    if (action.kind === 'move' && move) commit(direction, move);
    else {
      if (element) settle(element);
      if (action.kind === 'explain' && move) setState({ step: 'explaining', move, reason: '' });
    }
  };

  // Keys: a for the primary move, r to send it back, s for later. Typing stays in its field.
  const keys = useRef<(event: KeyboardEvent) => void>(() => undefined);
  keys.current = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (keyTargetOf(event.target) !== 'body') return;
    if (event.key === 'a' && ready && plan?.forward) act('right');
    else if (event.key === 'r' && ready && plan?.back) act('left');
    else if (event.key === 's' && state.step !== 'posting') commit('skip', undefined);
    else return;
    event.preventDefault();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const place = (dx: number) => {
    const element = card.current;
    if (!element) return;
    // It tilts with the pull, never past a slight 3°.
    const tilt = Math.max(-3, Math.min(3, dx * 0.01));
    element.style.transform = reducedMotion() ? '' : `translateX(${dx}px) rotate(${tilt}deg)`;
    pull(element, dragProgress(dx, element.offsetWidth), dx > 0 ? 'right' : 'left');
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!ready || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
    drag.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      t: event.timeStamp,
      vx: 0,
      live: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointer) return;
    const dx = event.clientX - current.x;
    if (!current.live) {
      const intent = dragIntent(dx, event.clientY - current.y);
      if (intent === 'pending') return;
      if (intent === 'scroll') {
        drag.current = null;
        return;
      }
      current.live = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging = 'true';
    }
    const dt = event.timeStamp - current.t;
    if (dt > 0) current.vx = (dx - current.dx) / dt;
    current.dx = dx;
    current.t = event.timeStamp;
    place(dx);
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    drag.current = null;
    if (!current?.live || event.pointerId !== current.pointer) return;
    delete event.currentTarget.dataset.dragging;
    // A pause before letting go is not a flick.
    const vx = event.timeStamp - current.t > 120 ? 0 : current.vx;
    const direction = releaseDirection({
      dx: current.dx,
      vx,
      width: event.currentTarget.offsetWidth,
    });
    if (direction) act(direction);
    else settle(event.currentTarget);
  };

  const onPointerCancel = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
    settle(event.currentTarget);
  };

  const forward = plan?.forward;
  const back = plan?.back;
  const busy = state.step === 'posting';
  const explaining = state.step === 'explaining';
  return (
    <>
      <div className="triage-stack" data-behind={Math.min(2, behind)}>
        {next ? <NextCard item={next} collectionOf={collectionOf} /> : null}
        <article
          ref={card}
          className="tcard raised"
          aria-labelledby="tcard-title"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {forward ? (
            <span className="stamp" data-side="right" aria-hidden="true">
              {forward.to}
            </span>
          ) : null}
          {back ? (
            <span className="stamp" data-side="left" aria-hidden="true">
              {back.to}
            </span>
          ) : null}
          <div className="tcard-head">
            <CardTags item={item} collectionOf={collectionOf} />
            <a className="tcard-open t-cap" href={hashFor(item.id)}>
              open the item
            </a>
          </div>
          <h2 className="tcard-title" id="tcard-title">
            {item.title}
          </h2>
          <CardBody item={item} collectionOf={collectionOf} />
          <CardStanding item={item} />
          {state.step === 'explaining' ? (
            <form
              className="reason"
              onSubmit={(event) => {
                event.preventDefault();
                const reason = state.reason.trim();
                if (reason !== '') commit('left', state.move, reason);
              }}
            >
              <label className="t-label" htmlFor="triage-reason">
                Reason for moving to {state.move.to}
              </label>
              <textarea
                id="triage-reason"
                className="input"
                // biome-ignore lint/a11y/noAutofocus: the form opens because a reason was just asked for
                autoFocus
                value={state.reason}
                onChange={(event) => setState({ ...state, reason: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    setState({ step: 'idle' });
                  }
                }}
              />
              <div className="action-buttons">
                <Button type="submit" variant="primary" disabled={state.reason.trim() === ''}>
                  Confirm
                </Button>
                <Button variant="quiet" onClick={() => setState({ step: 'idle' })}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
          {state.step !== 'posting' && state.error ? (
            <p className="action-error" role="alert">
              {state.error}
            </p>
          ) : null}
        </article>
      </div>
      <div className="triage-bar">
        <div className="triage-buttons">
          {back ? (
            <Button disabled={!ready} aria-label={`Move to ${back.to}`} onClick={() => act('left')}>
              <Icon name="left" />
              {back.to}
              <Kbd>r</Kbd>
            </Button>
          ) : null}
          <Button variant="quiet" disabled={busy} onClick={() => commit('skip', undefined)}>
            Later
            <Kbd>s</Kbd>
          </Button>
          {forward ? (
            <Button
              variant={explaining ? 'default' : 'primary'}
              disabled={!ready}
              aria-label={`Move to ${forward.to}`}
              onClick={() => act('right')}
            >
              {forward.to}
              <Kbd>a</Kbd>
              <Icon name="right" />
            </Button>
          ) : null}
        </div>
        {plan?.blocked ? (
          <div className="triage-blocked">
            {plan.blocked.map(({ move, note }) => (
              <span key={move.to} className="move-blocked">
                <Button size="sm" disabled aria-describedby={`triage-block-${move.to}`}>
                  {move.to}
                </Button>
                <span className="move-block-note t-cap" id={`triage-block-${move.to}`}>
                  {note}
                </span>
              </span>
            ))}
          </div>
        ) : null}
        <p className="t-cap triage-hint" aria-hidden="true">
          {[back ? `swipe left · ${back.to}` : '', forward ? `swipe right · ${forward.to}` : '']
            .filter(Boolean)
            .join('   ')}
        </p>
      </div>
    </>
  );
}

// The moves of the card on top and of the one behind it, read from the server ahead of time, so a
// card rises with its moves ready. Read again whenever the live stream says something changed.
function usePlans(ids: readonly string[], version: number): ReadonlyMap<string, TriagePlan> {
  const [plans, setPlans] = useState<ReadonlyMap<string, TriagePlan>>(new Map());
  const key = ids.join(' ');
  // biome-ignore lint/correctness/useExhaustiveDependencies: version asks for a fresh read
  useEffect(() => {
    const controller = new AbortController();
    for (const id of key.split(' ').filter(Boolean)) {
      fetchItem(id, controller.signal).then(
        (view) => {
          if (!view) return;
          const plan = triagePlan(view.transitions, view.children);
          setPlans((known) => new Map(known).set(id, plan));
        },
        () => undefined,
      );
    }
    return () => controller.abort();
  }, [key, version]);
  return plans;
}

// What this pass decided, on one side of the stage: handed back to agents, or settled otherwise.
// landing: the id of a decision whose card is still flying here; its entry is laid out (so the card
// can land on it) but unseen until the card hands over to it.
function Tray({
  label,
  decisions,
  empty,
  landing,
}: {
  label: string;
  decisions: Decision[];
  empty: string;
  landing?: string | undefined;
}) {
  return (
    <aside className="triage-tray" aria-label={label}>
      <span className="t-label">{label}</span>
      {decisions.length === 0 ? (
        <p className="triage-tray-empty t-small">{empty}</p>
      ) : (
        <ul>
          {[...decisions].reverse().map((decision) => (
            <li
              key={decision.id}
              className="triage-tray-row"
              data-landing={decision.id === landing ? decision.id : undefined}
            >
              <span className="t-id">{decision.id}</span>
              <span className="triage-tray-title">{decision.title}</span>
              <span className="t-cap">moved to {decision.to}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

// Where the pass stands: one mark per card, decided, skipped, current or still to come.
function Progress({ ids, log, current }: { ids: string[]; log: Decision[]; current?: string }) {
  const outcome = new Map(log.map((decision) => [decision.id, decision]));
  return (
    <div className="triage-strip" aria-hidden="true">
      {ids.map((id) => {
        const decision = outcome.get(id);
        const mark =
          id === current
            ? 'current'
            : decision === undefined
              ? 'waiting'
              : decision.to === undefined
                ? 'skipped'
                : 'decided';
        return <i key={id} data-mark={mark} />;
      })}
    </div>
  );
}

// The stage once nothing is left: what was decided, and the ways out.
function End({
  log,
  nothing,
  onExit,
  onAgain,
}: {
  log: Decision[];
  nothing: boolean;
  onExit: () => void;
  onAgain: () => void;
}) {
  const moved = log.filter((decision) => decision.to !== undefined).length;
  const skipped = log.length - moved;
  return (
    <div className="triage-end">
      <h2 className="t-h">{nothing ? 'Nothing waits for you' : 'All caught up'}</h2>
      <p className="t-small">
        {nothing
          ? 'Agents hold everything that is open. What comes back to you lands on your lane in the list.'
          : `${moved} decided${skipped > 0 ? ` · ${skipped} for later` : ''}. The next thing for you lands on your lane in the list.`}
      </p>
      <div className="action-buttons">
        <Button variant="primary" onClick={onExit}>
          Back to the list
          <Kbd>esc</Kbd>
        </Button>
        {skipped > 0 ? (
          <Button variant="quiet" onClick={onAgain}>
            Show the {skipped} for later again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// Triage: what waits for you, one card at a time, as a mode of its own. The card fills the stage;
// right (a) is the primary move, left (r) sends it back, s leaves it for later, Esc leaves.
// What was decided settles in the trays beside the stage: back with agents, or decided otherwise.
export function Triage({ waiting, loading = false, collectionOf, version, onExit }: TriageProps) {
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const [log, setLog] = useState<Decision[]>([]);
  // The card in play: kept while it leaves, even once the list no longer has it waiting.
  const [held, setHeld] = useState<Item>();
  // Every card of this pass, in the order met: what was decided, then what still waits.
  const [met, setMet] = useState<string[]>([]);
  const root = useRef<HTMLElement>(null);
  // The card leaving now, and its flight.
  const [leaving, setLeaving] = useState<Leaving>();
  const flight = useRef<Flight | undefined>(undefined);
  const queue = queueOf(
    waiting.map((item) => item.id),
    seen,
  );
  const top = held ?? waiting.find((item) => item.id === queue[0]);
  const remaining = held && !queue.includes(held.id) ? queue.length + 1 : queue.length;
  const nextId = queue.find((id) => id !== top?.id);
  const next = waiting.find((item) => item.id === nextId);
  const plans = usePlans(
    [top?.id, next?.id].filter((id): id is string => id !== undefined),
    version,
  );
  const ids = [...new Set([...met, ...log.map(({ id }) => id), ...queue])];
  if (ids.length !== met.length || ids.some((id, at) => met[at] !== id)) setMet(ids);
  const decide = (decision: Decision) => {
    setSeen((current) => new Set(current).add(decision.id));
    setLog((current) => [...current, decision]);
    setHeld(undefined);
  };
  const again = () => {
    const skipped = new Set(
      log.filter((decision) => decision.to === undefined).map(({ id }) => id),
    );
    setSeen((current) => new Set([...current].filter((id) => !skipped.has(id))));
    setLog((current) => current.filter((decision) => decision.to !== undefined));
  };

  // The mode comes in rising a little (base); reduced motion crossfades.
  useLayoutEffect(() => {
    root.current?.animate(
      reducedMotion()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'none' },
          ],
      reducedMotion() ? { duration: MOTION.fast } : { duration: MOTION.base, easing: MOTION.ease },
    );
  }, []);

  // A card leaves once its tray has laid out the entry it lands on: the flight and the move run
  // together, and the decision is kept when both are done. A move that fails brings the card back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: each leaving card flies once
  useLayoutEffect(() => {
    if (!leaving) return;
    const { element, exit, decision, moved, restore } = leaving;
    const slot =
      decision.to === undefined
        ? null
        : (root.current?.querySelector<HTMLElement>(
            `[data-landing="${CSS.escape(decision.id)}"]`,
          ) ?? null);
    const side = decision.turn === 'agent' ? 'left' : 'right';
    const current = leaveStage(element, exit === 'skip' ? 'skip' : side, slot);
    flight.current = current;
    Promise.all([current.done, moved]).then(
      () => {
        flight.current = undefined;
        setLeaving(undefined);
        decide(decision);
      },
      (error: unknown) => {
        current.cancel();
        flight.current = undefined;
        setLeaving(undefined);
        setHeld(undefined);
        restore(error instanceof Error ? error.message : 'Failed');
      },
    );
  }, [leaving]);

  useEffect(() => () => flight.current?.cancel(), []);

  // Esc leaves triage (a reason being written takes its own Esc first).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || keyTargetOf(event.target) !== 'body') return;
      event.preventDefault();
      onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const decided = log.filter((decision) => decision.to !== undefined);
  // The entry a flying card lands on is in its tray from the start of the flight.
  const landing = leaving?.decision.to !== undefined ? leaving.decision : undefined;
  const trayed = landing ? [...decided, landing] : decided;
  const backed = trayed.filter((decision) => decision.turn === 'agent');
  const settled = trayed.filter((decision) => decision.turn !== 'agent');
  // A pass is on once there is something to triage (or something was): the trays show then.
  const pass = !loading && (waiting.length > 0 || log.length > 0);
  const position = log.length + 1;
  const total = log.length + remaining;
  return (
    <section className="triage" aria-label="Triage" ref={root}>
      <header className="triage-head">
        <Button variant="quiet" className="triage-exit" onClick={onExit}>
          <Icon name="left" />
          List
          <Kbd>esc</Kbd>
        </Button>
        <div className="triage-heading">
          <h1 className="t-display triage-title">
            {loading
              ? 'Triage'
              : top
                ? `${remaining} left on your turn`
                : waiting.length === 0 && log.length === 0
                  ? 'Triage'
                  : 'All caught up'}
          </h1>
          {pass ? (
            <span className="t-cap">
              {decided.length} decided · {log.length - decided.length} for later
            </span>
          ) : null}
        </div>
        <span className="t-cap triage-count">{top ? `${position} of ${total}` : ''}</span>
      </header>
      <div className="triage-body">
        {pass ? (
          <Tray
            label="back with agents"
            decisions={backed}
            empty="What you send back lands here, on its way to the agent lane."
            landing={landing?.id}
          />
        ) : null}
        <div className="triage-main">
          {loading ? (
            <p className="t-small triage-loading">Loading…</p>
          ) : top ? (
            <TriageCard
              key={top.id}
              item={top}
              collectionOf={collectionOf}
              plan={plans.get(top.id)}
              onLeave={(card) => {
                setHeld(top);
                setLeaving(card);
              }}
              behind={remaining - 1}
              next={next}
            />
          ) : (
            <End log={log} nothing={log.length === 0} onExit={onExit} onAgain={again} />
          )}
          {ids.length > 1 ? (
            <Progress ids={ids} log={log} {...(top ? { current: top.id } : {})} />
          ) : null}
        </div>
        {pass ? (
          <Tray
            label="decided"
            decisions={settled}
            empty="What you move on settles here until you leave."
            landing={landing?.id}
          />
        ) : null}
      </div>
    </section>
  );
}
