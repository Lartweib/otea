import { type PointerEvent, useCallback, useRef, useState } from 'react';
import { fetchItem, moveItem } from '../api.ts';
import { type Connection, useActiveLease, useRemote } from '../hooks.ts';
import { showsTypes, typeOf } from '../item-types.ts';
import { Button, Icon, NODE_LABEL, Node, Pill, TypeTag } from '../kit/index.ts';
import { moduleFor } from '../modules/registry.ts';
import { valuesOf } from '../modules/values.ts';
import { TIMING } from '../motion.ts';
import { itemNodeKind } from '../node-kind.ts';
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
import type { Item } from '../types.ts';
import type { CollectionOf } from './ItemList.tsx';

// What happened to a card: moved to a state, or skipped (to is undefined).
type Decision = { id: string; title: string; to?: string };

type TriageProps = {
  // What waits for you, in list order.
  waiting: Item[];
  collectionOf: CollectionOf;
  version: number;
  connection: Connection;
  onExit: () => void;
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Where a card goes when it leaves: off to the side it was swiped to, or down a little when skipped.
type Exit = Direction | 'skip';

function leave(card: HTMLElement, exit: Exit): Animation {
  const from = card.style.transform || 'none';
  if (reducedMotion()) {
    return card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
  }
  const side = exit === 'right' ? 1 : -1;
  const to =
    exit === 'skip'
      ? 'translateY(24px) scale(0.97)'
      : `translateX(${side * (card.offsetWidth + 96)}px) rotate(${side * 14}deg)`;
  return card.animate(
    [
      { transform: from, opacity: 1 },
      { transform: to, opacity: 0 },
    ],
    { ...TIMING.arrive, fill: 'forwards' },
  );
}

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
  card.animate([{ transform: from }, { transform: 'none' }], TIMING.arrive);
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

// The card waiting behind the top one: already readable, and lifted as the top one is pulled away.
function NextCard({ item, collectionOf }: { item: Item; collectionOf: CollectionOf }) {
  return (
    <div className="tcard raised tcard-next" aria-hidden="true">
      <CardTags item={item} collectionOf={collectionOf} />
      <p className="tcard-title">{item.title}</p>
    </div>
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
  | { step: 'explaining'; to: string; reason: string; error?: string }
  | { step: 'posting' };

type CardProps = {
  item: Item;
  collectionOf: CollectionOf;
  plan: TriagePlan | undefined;
  // The card holds on to its item from the first move until it has left, whatever the list says.
  onCommit: () => void;
  onLeft: (decision: Decision) => void;
  onFailed: () => void;
  // How many cards wait behind this one (drawn as a stack, at most two), and the first of them.
  behind: number;
  next: Item | undefined;
};

function TriageCard({
  item,
  collectionOf,
  plan,
  onCommit,
  onLeft,
  onFailed,
  behind,
  next,
}: CardProps) {
  const card = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const [state, setState] = useState<CardStep>({ step: 'idle' });
  const values = valuesOf(typeOf(collectionOf(item.collection), item.type)?.fields, item.fields);
  const ready = plan !== undefined && state.step === 'idle';

  // The arrival of a card, from just behind the one that left.
  const arrive = useCallback((element: HTMLElement | null) => {
    card.current = element;
    if (!element) return;
    const keyframes = reducedMotion()
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { transform: 'translateY(12px) scale(0.96)', opacity: 0.4 },
          { transform: 'none', opacity: 1 },
        ];
    element.animate(keyframes, reducedMotion() ? { duration: 200 } : TIMING.arrive);
  }, []);

  const commit = (exit: Exit, to: string | undefined, reason = '') => {
    const element = card.current;
    if (!element) return;
    onCommit();
    setState({ step: 'posting' });
    const gone = leave(element, exit).finished;
    const moved = to === undefined ? Promise.resolve() : moveItem(item.id, to, reason);
    moved.then(
      () =>
        gone.then(() =>
          onLeft(
            to === undefined
              ? { id: item.id, title: item.title }
              : { id: item.id, title: item.title, to },
          ),
        ),
      (error: unknown) => {
        for (const animation of element.getAnimations()) animation.cancel();
        settle(element);
        onFailed();
        const message = error instanceof Error ? error.message : 'Failed';
        setState(
          reason === '' || to === undefined
            ? { step: 'idle', error: message }
            : { step: 'explaining', to, reason, error: message },
        );
      },
    );
  };

  const act = (direction: Direction) => {
    if (!plan) return;
    const action = swipeAction(direction, plan);
    const element = card.current;
    if (action.kind === 'move') commit(direction, action.to);
    else {
      if (element) settle(element);
      if (action.kind === 'explain') setState({ step: 'explaining', to: action.to, reason: '' });
    }
  };

  const place = (dx: number) => {
    const element = card.current;
    if (!element) return;
    element.style.transform = reducedMotion() ? '' : `translateX(${dx}px) rotate(${dx * 0.03}deg)`;
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
          ref={arrive}
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
          <CardTags item={item} collectionOf={collectionOf} />
          <h2 className="tcard-title" id="tcard-title">
            {item.title}
          </h2>
          {values.length > 0 ? (
            <dl className="fields">
              {values.map(({ field, value }) => {
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
          {state.step === 'explaining' ? (
            <form
              className="reason"
              onSubmit={(event) => {
                event.preventDefault();
                const reason = state.reason.trim();
                if (reason !== '') commit('left', state.to, reason);
              }}
            >
              <label className="t-label" htmlFor="triage-reason">
                Reason for moving to {state.to}
              </label>
              <textarea
                id="triage-reason"
                className="input"
                // biome-ignore lint/a11y/noAutofocus: the form opens because a reason was just asked for
                autoFocus
                value={state.reason}
                onChange={(event) => setState({ ...state, reason: event.target.value })}
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
            </Button>
          ) : null}
          <Button variant="quiet" disabled={busy} onClick={() => commit('skip', undefined)}>
            Skip
          </Button>
          {forward ? (
            <Button
              variant={explaining ? 'default' : 'primary'}
              disabled={!ready}
              aria-label={`Move to ${forward.to}`}
              onClick={() => act('right')}
            >
              {forward.to}
              <Icon name="right" />
            </Button>
          ) : null}
        </div>
        <p className="t-cap triage-hint" aria-hidden="true">
          {[back ? `swipe left · ${back.to}` : '', forward ? `swipe right · ${forward.to}` : '']
            .filter(Boolean)
            .join('   ')}
        </p>
      </div>
    </>
  );
}

// The moves of the card on top, read from the server.
function useMoves(id: string, version: number, connection: Connection): TriagePlan | undefined {
  const load = useCallback((signal: AbortSignal) => fetchItem(id, signal), [id]);
  const view = useRemote(load, version, connection);
  return view.status === 'ready' && view.value ? triagePlan(view.value.transitions) : undefined;
}

type TopCardProps = Omit<CardProps, 'plan'> & { version: number; connection: Connection };

function TopCard({ version, connection, ...rest }: TopCardProps) {
  return <TriageCard plan={useMoves(rest.item.id, version, connection)} {...rest} />;
}

function Summary({
  log,
  onExit,
  onAgain,
}: {
  log: Decision[];
  onExit: () => void;
  onAgain: () => void;
}) {
  const moved = log.filter((decision) => decision.to !== undefined).length;
  const skipped = log.length - moved;
  return (
    <div className="tcard raised tcard-end">
      <h2 className="tcard-title">
        {moved === 0 ? 'Nothing decided' : `${moved} decided`}
        {skipped > 0 ? <span className="t-cap"> · {skipped} skipped</span> : null}
      </h2>
      <p className="t-small">The next thing for you lands on your lane in the list.</p>
      {log.length > 0 ? (
        <ul className="triage-log">
          {log.map((decision) => (
            <li key={decision.id}>
              <span className="t-id">{decision.id}</span>
              <span className="triage-log-what">
                {decision.to === undefined ? 'skipped' : `moved to ${decision.to}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="action-buttons">
        <Button onClick={onExit}>Back to the list</Button>
        {skipped > 0 ? (
          <Button variant="quiet" onClick={onAgain}>
            Show the skipped again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// Swipe triage: what waits for you, one card at a time. Right is the primary move, left sends it back.
export function Triage({ waiting, collectionOf, version, connection, onExit }: TriageProps) {
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const [log, setLog] = useState<Decision[]>([]);
  // The card in play: kept while it leaves, even once the list no longer has it waiting.
  const [held, setHeld] = useState<Item>();
  const queue = queueOf(
    waiting.map((item) => item.id),
    seen,
  );
  const top = held ?? waiting.find((item) => item.id === queue[0]);
  const remaining = held && !queue.includes(held.id) ? queue.length + 1 : queue.length;
  const nextId = queue.find((id) => id !== top?.id);
  const next = waiting.find((item) => item.id === nextId);
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
  return (
    <section className="triage" aria-label="Triage">
      <header className="triage-head">
        <Button variant="quiet" onClick={onExit}>
          <Icon name="left" />
          List
        </Button>
        <span className="t-cap">
          {top ? `${log.length + 1} of ${log.length + remaining}` : 'all decided'}
        </span>
      </header>
      <h1 className="t-display triage-title">
        {top
          ? `${remaining} waiting on you`
          : waiting.length === 0
            ? 'Nothing on your turn'
            : 'The stack is through'}
      </h1>
      {top ? (
        <TopCard
          key={top.id}
          item={top}
          collectionOf={collectionOf}
          version={version}
          connection={connection}
          onCommit={() => setHeld(top)}
          onLeft={decide}
          onFailed={() => setHeld(undefined)}
          behind={remaining - 1}
          next={next}
        />
      ) : (
        <Summary log={log} onExit={onExit} onAgain={again} />
      )}
    </section>
  );
}
