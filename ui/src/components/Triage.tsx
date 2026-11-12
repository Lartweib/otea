import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { waitsOf } from '../actions.ts';
import { evidenceFileUrl, fetchItem } from '../api.ts';
import { typeOfItem, useApp } from '../app/context.tsx';
import { onPublishedBoard } from '../board-studio/home/boards-store.ts';
import { t, tx } from '../i18n/i18n.ts';
import { useEscape } from '../kit/escape.ts';
import { Button, Count, StepPill } from '../kit/index.ts';
import { toast } from '../kit/pop/toast.tsx';
import type { Look } from '../lanes/looks.ts';
import { NodeGlyph } from '../lanes/NodeGlyph.tsx';
import { anim } from '../motion/anim.ts';
import { Choreo, part } from '../motion/choreo.ts';
import { reduced } from '../motion/reduced.ts';
import { stateWord } from '../preset-words.ts';
import {
  cardWords,
  type Direction,
  dragIntent,
  releaseDirection,
  resist,
  type TriagePlan,
  type TriKind,
  type TriState,
  triagePlan,
  triageQueue,
  triCurrent,
  triDecide,
  triNext,
  triReturn,
  triStart,
  triSync,
} from '../triage.ts';
import type { Evidence, Item, ItemView, Move } from '../types.ts';
import {
  arriveUnder,
  dropFace,
  dropLater,
  type Flight,
  heldAt,
  hold,
  lift,
  returnIn,
  settleStack,
  springHome,
  throwOut,
} from './triage-flight.ts';

// Triaje (#/triage, SPEC §10.4, mock:829-847, 3995-4036): the reviews, one card at a time over the
// next one. The card follows the pointer or the finger, stamped with the move a release would make;
// let go past the threshold it is thrown that way (right approves, left sends back), short of it it
// springs home. The buttons do the same without a drag: Aprobar throws it right, Devolver…
// opens notes in the card and throws it left with them, Después drops it to the end of the pass;
// the card under it rises into its place. Deshacer (the toast's) brings a card back from its side.
// "Todo al día." once every card is decided.

// The views of the card on top and of the one under it (their moves and evidence), read ahead, so
// a card rises ready. Read again when the live stream says something changed.
function useViews(ids: readonly string[], version: number): ReadonlyMap<string, ItemView> {
  const [views, setViews] = useState<ReadonlyMap<string, ItemView>>(new Map());
  const key = ids.join(' ');
  // biome-ignore lint/correctness/useExhaustiveDependencies: version asks for a fresh read
  useEffect(() => {
    const controller = new AbortController();
    for (const id of key.split(' ').filter(Boolean)) {
      fetchItem(id, controller.signal).then(
        (view) => {
          if (view) setViews((known) => new Map(known).set(id, view));
        },
        () => undefined,
      );
    }
    return () => controller.abort();
  }, [key, version]);
  return views;
}

// Images side by side, before then after, each captioned under a caps kicker (mock:2576-2611).
function Figures({ evidence }: { evidence: readonly Evidence[] }) {
  const rank = { before: 0, after: 1, single: 2 } as const;
  const shown = evidence
    .filter((e) => e.contentType.startsWith('image/'))
    .sort((a, b) => rank[a.role] - rank[b.role])
    .slice(0, 2);
  if (shown.length === 0) return null;
  return (
    <div className="figs">
      {shown.map((e) => (
        <figure key={e.id}>
          <img
            src={evidenceFileUrl(e.id)}
            alt={e.caption ?? e.filename}
            loading="lazy"
            draggable={false}
          />
          <figcaption>
            {e.role === 'single' ? null : (
              <b className="fk">{t(e.role === 'before' ? 'evidence.before' : 'evidence.after')}</b>
            )}
            {e.caption ?? e.filename}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

// The notes that go back with Devolver…: unrolled from under the moves, the same gesture mirrored
// to close (mock:4023-4024).
function Notes({
  open,
  onSend,
  onCancel,
}: {
  open: boolean;
  onSend: (reason: string) => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  const [text, setText] = useState('');
  const el = useRef<HTMLDivElement>(null);
  const ch = useRef<Choreo | null>(null);
  if (open && !mounted) setMounted(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on open, close and mount
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    if (open) {
      ch.current ??= new Choreo([
        part(
          node,
          { clipPath: 'inset(0px 0px 100% 0px)' },
          { clipPath: 'inset(0px 0px 0px 0px)' },
          440,
          'settle',
          0,
        ),
        part(node, { opacity: 0 }, { opacity: 1 }, 300, 'drift', 0),
        part(
          node,
          { transform: 'translateY(-6px)' },
          { transform: 'translateY(0px)' },
          440,
          'settle',
          0,
        ),
      ]);
      ch.current.go(1);
      node.querySelector('textarea')?.focus({ preventScroll: true });
    } else if (ch.current) {
      const c = ch.current;
      c.go(0).then((latest) => {
        if (latest && c.dir === 0) {
          ch.current = null;
          setMounted(false);
        }
      });
    }
  }, [open, mounted]);
  useEscape(open, 'notes', onCancel);
  if (!mounted) return null;
  return (
    <div className="tri-notes" ref={el}>
      <textarea
        rows={2}
        value={text}
        placeholder={t('triage.notesPlaceholder')}
        aria-label={t('triage.notes')}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="nbtns">
        <Button
          variant="primary"
          size="sm"
          disabled={text.trim() === ''}
          onClick={() => onSend(text.trim())}
        >
          {t('triage.send')}
        </Button>
        <Button variant="quiet" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
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

// Where a decision starts from: the card's pull and speed when it was let go (none for a button).
export type From = { x: number; v: number };

type CardProps = {
  item: Item;
  under: boolean;
  view: ItemView | undefined;
  words: ReturnType<typeof cardWords>;
  state: string;
  phone: boolean;
  wordOf: (state: string) => string;
  register: (id: string, el: HTMLElement | null) => void;
  onDecide: (kind: TriKind, reason?: string, from?: From) => void;
  onOpen: () => void;
};

function standfirst({ agent, round }: ReturnType<typeof cardWords>): ReactNode {
  if (!agent) return t('triage.yours');
  const who = <b>{agent}</b>;
  return round > 1
    ? tx('triage.handsRound', { agent: who, round })
    : tx('triage.hands', { agent: who });
}

// The node a move lands the item on: closed, with an agent, or still yours.
const lookOfMove = (move: Move): Look =>
  move.turn === 'none' ? 'done' : move.turn === 'agent' ? 'queued' : 'yours';

// The move a release would make, stamped on the card's trailing corner: up with the pull, set
// (filled) once a release would make it.
function Stamp({ side, move, word }: { side: Direction; move: Move; word: string }) {
  return (
    <span className="tstamp" data-side={side} aria-hidden="true">
      <NodeGlyph look={lookOfMove(move)} size={14} />
      <b>{t(side === 'right' ? 'triage.approve' : 'triage.stampSend')}</b>
      <span className="to">{t('triage.stampTo', { state: word })}</span>
    </span>
  );
}

function TriCard({
  item,
  under,
  view,
  words,
  state,
  phone,
  wordOf,
  register,
  onDecide,
  onOpen,
}: CardProps) {
  const [notes, setNotes] = useState(false);
  const card = useRef<HTMLElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const home = useRef<Flight | null>(null);
  const plan: TriagePlan | undefined = view
    ? triagePlan(view.transitions, waitsOf(view))
    : undefined;
  const forward = plan?.forward;
  const back = plan?.back;
  // The card under the top one waits complete (inert): it is the same card, brought forward.
  const ready = !!plan;

  const approve = () => {
    if (!forward) return;
    if (forward.reasonRequired) setNotes(true);
    else onDecide('approve');
  };
  const sendBack = () => {
    if (!back) return;
    if (back.reasonRequired) setNotes(true);
    else onDecide('send');
  };

  // The card follows the pointer; toward a side with no move it gives only a little.
  const place = (dx: number) => {
    const el = card.current;
    if (!el) return;
    hold(el, resist(dx, dx > 0 ? !!forward : !!back));
  };
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (under || !ready || notes || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
    // A card caught as it springs home is held from where it is.
    home.current?.cancel();
    home.current = null;
    const at = heldAt(e.currentTarget);
    drag.current = {
      pointer: e.pointerId,
      x: e.clientX - at,
      y: e.clientY,
      dx: at,
      t: e.timeStamp,
      vx: 0,
      live: at !== 0,
    };
    if (at !== 0) {
      e.currentTarget.setPointerCapture(e.pointerId);
      lift(e.currentTarget);
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    const dx = e.clientX - d.x;
    if (!d.live) {
      const intent = dragIntent(dx, e.clientY - d.y);
      if (intent === 'pending') return;
      if (intent === 'scroll') {
        drag.current = null;
        return;
      }
      d.live = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      window.getSelection()?.removeAllRanges();
      lift(e.currentTarget);
    }
    const dt = e.timeStamp - d.t;
    // The speed, smoothed over the last moves, so one jittery event is not a flick.
    if (dt > 0) d.vx = 0.6 * ((dx - d.dx) / dt) + 0.4 * d.vx;
    d.dx = dx;
    d.t = e.timeStamp;
    place(dx);
  };
  const release = (el: HTMLElement, d: Drag, at: number) => {
    // A pause before letting go is not a flick.
    const vx = at - d.t > 120 ? 0 : d.vx;
    const x = heldAt(el);
    const side = releaseDirection({ dx: x, vx, width: el.offsetWidth });
    const move = side === 'right' ? forward : side === 'left' ? back : undefined;
    if (side && move && !move.reasonRequired) {
      onDecide(side === 'right' ? 'approve' : 'send', '', { x, v: vx });
      return;
    }
    home.current = springHome(el, x, vx);
    // A move that needs a reason is never made by a gesture: the card comes home and asks for it.
    if (move) setNotes(true);
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.live || e.pointerId !== d.pointer) return;
    release(e.currentTarget, d, e.timeStamp);
  };
  const onPointerCancel = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.live) home.current = springHome(e.currentTarget, heldAt(e.currentTarget), 0);
  };
  useEffect(() => {
    const el = card.current;
    return () => {
      home.current?.cancel();
      if (el) dropFace(el);
    };
  }, []);

  const blocked = plan?.blocked?.[0];
  return (
    <article
      ref={(el) => {
        card.current = el;
        register(item.id, el);
      }}
      className={under ? 'tcard under' : 'tcard'}
      data-tk={item.id}
      data-ready={!under && ready && !notes ? '' : undefined}
      aria-hidden={under || undefined}
      inert={under}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {forward ? <Stamp side="right" move={forward} word={wordOf(forward.to)} /> : null}
      {back ? <Stamp side="left" move={back} word={wordOf(back.to)} /> : null}
      <div className="tc-k">
        <NodeGlyph look="yours" size={14} />
        <span className="id">{item.id}</span>
        <StepPill tone="you">{state}</StepPill>
        <span>{item.collection}</span>
      </div>
      <h2>{item.title}</h2>
      <p className="sf">{standfirst(words)}</p>
      {words.say ? <p className="say">{words.say}</p> : null}
      {view ? <Figures evidence={view.evidence} /> : null}
      <div className="tc-acts">
        <Button variant="primary" disabled={!ready || !forward} onClick={approve}>
          {t('triage.approve')}
        </Button>
        {!plan || back ? (
          <Button
            variant="quiet"
            disabled={!ready || !back}
            onClick={sendBack}
            aria-expanded={notes}
          >
            {t('triage.sendBack')}
          </Button>
        ) : null}
        <Button variant="text" onClick={() => onDecide('later')}>
          {t('triage.later')}
        </Button>
        <span className="sp" />
        <Button variant="text" onClick={onOpen}>
          {t('triage.open')}
        </Button>
      </div>
      {blocked ? <p className="tc-wait">{blocked.note}</p> : null}
      {ready && (forward || back) ? (
        <p className="tc-hint" aria-hidden="true">
          {phone ? t('triage.swipeHint') : t('triage.dragHint')}
        </p>
      ) : null}
      <Notes
        open={notes}
        onCancel={() => setNotes(false)}
        onSend={(reason) => {
          setNotes(false);
          onDecide('send', reason);
        }}
      />
    </article>
  );
}

export function Triage() {
  const app = useApp();
  const ctx = {
    now: app.now,
    feed: app.feed,
    types: (it: Item) => typeOfItem(it, app.collectionOf),
    onBoard: (it: Item) => onPublishedBoard(it.collection),
  };
  const loading = app.items.status === 'loading';
  const waiting = loading ? [] : triageQueue(app.all, ctx);
  const [pass, setPass] = useState<TriState | null>(null);
  if (!pass && !loading) setPass(triStart(waiting));
  // The cards met in this pass, kept so a decided card still renders while it flies.
  const known = useRef(new Map<string, Item>());
  for (const it of app.all) known.current.set(it.id, it);
  const els = useRef(new Map<string, HTMLElement>());
  // A decided card keeps what it showed while it flies, whatever the data says meanwhile.
  type Shown = {
    item: Item;
    view: ItemView | undefined;
    words: ReturnType<typeof cardWords>;
    state: string;
  };
  const frozen = useRef(new Map<string, Shown>());
  // The card in flight, if any: the pass waits for it before it moves on.
  const flying = useRef<string | null>(null);
  const flight = useRef<Flight | null>(null);
  // The side each decided card left by, so a card taken back returns from there.
  const exits = useRef(new Map<string, Direction>());
  // Cards whose move failed while they flew: they come back once they land.
  const failed = useRef(new Set<string>());
  const settled = useRef<string | undefined>(undefined);
  const stack = useRef<HTMLDivElement>(null);

  const s = pass ?? triStart([]);
  const cur = triCurrent(s);
  const next = triNext(s);
  const nextShown = next !== cur ? next : undefined;
  const views = useViews(
    [cur, nextShown].filter((id): id is string => !!id),
    app.version,
  );

  // New reviews join the pass, reviews moved elsewhere drop out, a decided one taken back returns
  // (never mid-flight).
  const waitKey = waiting.join(' ');
  // biome-ignore lint/correctness/useExhaustiveDependencies: the reviews, by their ids
  useEffect(() => {
    if (!flying.current) setPass((was) => (was ? triSync(was, waiting) : was));
  }, [waitKey]);

  // The stack is as tall as its top card. When a new card is on top it is let go of its flight
  // (or, taken back, it returns from the side it left by); the card that came to wait under it
  // resolves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: after every change of the pass
  useLayoutEffect(() => {
    const top = cur ? els.current.get(cur) : undefined;
    if (top && stack.current) {
      stack.current.style.minHeight = `${top.offsetHeight + 40}px`;
      stack.current.style.setProperty('--h', `${top.offsetHeight}px`);
    }
    if (cur === settled.current) return;
    const first = settled.current === undefined;
    settled.current = cur;
    if (!top || !cur) return;
    settleStack(top);
    const side = exits.current.get(cur);
    if (side) {
      exits.current.delete(cur);
      returnIn(top, side);
      return;
    }
    const under = nextShown ? els.current.get(nextShown) : undefined;
    if (under && !first) arriveUnder(under);
  }, [cur, nextShown, pass]);

  useEffect(() => () => flight.current?.cancel(), []);

  // The stack keeps the top card's height as it changes (the notes unrolling, evidence loading).
  useEffect(() => {
    const top = cur ? els.current.get(cur) : undefined;
    const box = stack.current;
    if (!top || !box || typeof ResizeObserver === 'undefined') return;
    const fit = new ResizeObserver(() => {
      box.style.minHeight = `${top.offsetHeight + 40}px`;
      box.style.setProperty('--h', `${top.offsetHeight}px`);
    });
    fit.observe(top);
    return () => fit.disconnect();
  }, [cur]);

  // The reviews as they are when the flight lands (the decided one may still be listed).
  const live = useRef(waiting);
  live.current = waiting;

  function shownOf(id: string): Shown | undefined {
    const it = known.current.get(id);
    if (!it) return undefined;
    const type = typeOfItem(it, app.collectionOf);
    return {
      item: it,
      view: views.get(id),
      words: cardWords(it, app.feed),
      state: stateWord(type, it.state),
    };
  }

  const wordOf = (id: string) => (state: string) => {
    const it = known.current.get(id);
    return it ? stateWord(typeOfItem(it, app.collectionOf), state) : state;
  };

  const decide = (kind: TriKind, reason = '', from?: From) => {
    if (!cur || flying.current) return;
    const id = cur;
    const it = known.current.get(id);
    const view = views.get(id);
    const plan = view ? triagePlan(view.transitions, waitsOf(view)) : undefined;
    const move = kind === 'approve' ? plan?.forward : kind === 'send' ? plan?.back : undefined;
    if (kind !== 'later' && !move) return;
    const side: Direction = kind === 'approve' ? 'right' : 'left';
    flying.current = id;
    const shown = shownOf(id);
    if (shown) frozen.current.set(id, shown);
    const card = els.current.get(id);
    const out = card
      ? kind === 'later'
        ? dropLater(card)
        : throwOut(card, side, from?.x ?? 0, from?.v ?? 0)
      : null;
    flight.current = out;
    if (move && it) {
      exits.current.set(id, side);
      const state = stateWord(typeOfItem(it, app.collectionOf), move.to);
      const msg =
        kind === 'approve'
          ? t('triage.toastApprove', { title: it.title, state })
          : t('triage.toastSend', { title: it.title, state });
      app.move(id, move.to, reason, msg).catch((error: unknown) => {
        toast({ msg: error instanceof Error ? error.message : t('common.failed'), id });
        // A move that did not go through brings its card back, from the side it left by.
        if (flying.current === id) failed.current.add(id);
        else setPass((was) => (was ? triReturn(was, id) : was));
      });
    }
    (out?.done ?? Promise.resolve()).then(() => {
      flying.current = null;
      flight.current = null;
      frozen.current.delete(id);
      const back = failed.current.delete(id);
      // A card that comes back at once is the same card on top: it is shown again from its side.
      if (back) settled.current = '';
      setPass((was) => {
        if (!was) return was;
        const after = triSync(triDecide(was, kind), live.current);
        return back ? triReturn(after, id) : after;
      });
    });
  };

  const at = s.i + 1;
  const n = s.q.length;
  const behind = Math.max(0, Math.min(2, n - s.i - 1));
  const card = (id: string, under: boolean) => {
    const shown = frozen.current.get(id) ?? shownOf(id);
    if (!shown) return null;
    return (
      <TriCard
        key={id}
        item={shown.item}
        under={under}
        view={shown.view}
        words={shown.words}
        state={shown.state}
        phone={app.phone}
        wordOf={wordOf(id)}
        register={(key, el) => {
          if (el) els.current.set(key, el);
          else els.current.delete(key);
        }}
        onDecide={decide}
        onOpen={() => app.openItem(id)}
      />
    );
  };
  return (
    <div className="tri">
      <div className="thd" data-enter="head">
        <button type="button" className="back" onClick={() => app.go({ view: 'toca' })}>
          <span aria-hidden="true">← </span>
          {t('triage.back')}
        </button>
        <h1 className="display">{t('triage.title')}</h1>
        {pass ? (
          <span className="tpos">
            {cur ? (
              <>
                {tx('triage.pos', { at: <Count value={at} />, n })}
                {' · '}
              </>
            ) : null}
            {t('triage.decided', { count: s.decided })}
          </span>
        ) : null}
      </div>
      <div className="tstack" ref={stack} data-enter="fade" data-behind={behind}>
        {loading ? (
          <p className="tri-loading">{t('common.loading')}</p>
        ) : cur ? (
          <>
            {nextShown ? card(nextShown, true) : null}
            {card(cur, false)}
          </>
        ) : (
          <Done decided={s.decided} onBack={() => app.go({ view: 'toca' })} />
        )}
      </div>
    </div>
  );
}

function Done({ decided, onBack }: { decided: number; onBack: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (decided > 0 && el.current) {
      const kf = reduced()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'none' },
          ];
      anim(el.current, kf, reduced() ? 160 : 480, reduced() ? 'drift' : 'glide', 0, 'backwards');
    }
  }, [decided]);
  return (
    <div className="tdone" ref={el}>
      <h2>{t('triage.done')}</h2>
      <p>{decided > 0 ? t('triage.doneBody', { count: decided }) : t('triage.nothingBody')}</p>
      <div className="acts2">
        <Button variant="quiet" onClick={onBack}>
          {t('triage.backTo')}
        </Button>
      </div>
    </div>
  );
}
