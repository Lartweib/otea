import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { BoardDefinition } from '../../../src/core/board/model.ts';
import { waitsOf } from '../actions.ts';
import { evidenceFileUrl, fetchItem } from '../api.ts';
import { typeOfItem, useApp } from '../app/context.tsx';
import { onPublishedBoard } from '../board-studio/home/boards-store.ts';
import { listOf, t, tx } from '../i18n/i18n.ts';
import { useEscape } from '../kit/escape.ts';
import { Button, Count, StepPill } from '../kit/index.ts';
import { toast } from '../kit/pop/toast.tsx';
import { type Look, lookOf } from '../lanes/looks.ts';
import { NodeGlyph } from '../lanes/NodeGlyph.tsx';
import { anim } from '../motion/anim.ts';
import { Choreo, part } from '../motion/choreo.ts';
import { reduced } from '../motion/reduced.ts';
import { stateWord, valueWord } from '../preset-words.ts';
import { approvalWaitWords } from '../refusals.ts';
import {
  approvalGate,
  cardFigures,
  cardWords,
  type Direction,
  deliveredFields,
  dragIntent,
  type Gate,
  HANDOVER,
  type Pile,
  type PileEntry,
  pileLanding,
  pileOf,
  pileSide,
  pileView,
  releaseDirection,
  resist,
  roundEvidence,
  type TriagePlan,
  type TriKind,
  type TriState,
  triagePlan,
  triageQueue,
  triCurrent,
  triDecide,
  triNext,
  triPile,
  triReturn,
  triStart,
  triSync,
} from '../triage.ts';
import type { Evidence, Item, ItemView, Move } from '../types.ts';
import { useStudioBoard } from '../views/board/studio-board.tsx';
import type { ItemBoardBlock } from '../views/detail/board-item.ts';
import {
  arriveUnder,
  dropFace,
  dropLater,
  type Flight,
  heldAt,
  hold,
  type Landing,
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
// The card holds the middle; what the pass decided piles up beside it, on the side it was thrown
// to: sent back on the left, approved on the right, the last one on top. Where the view is too
// narrow for the piles they fold to their counts under the card, and a card is thrown off the side.

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

// Images side by side, before then after, each captioned under a caps kicker (mock:2576-2611):
// the round's newest (cardFigures).
function Figures({ shown }: { shown: readonly Evidence[] }) {
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

// What the round hands in: the step's fields with their values, and the round's files the images
// above do not show.
function Delivered({ round }: { round: RoundShown }) {
  const { fields, files } = round;
  if (fields.length === 0 && files.length === 0) return null;
  return (
    <div className="tc-hand">
      {fields.length > 0 ? (
        <>
          <p className="tc-hk">{t('triage.delivered')}</p>
          <dl>
            {fields.map((f) => (
              <div key={f.ref}>
                <dt>{f.name}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      {files.length > 0 ? (
        <p className="tc-files">
          {t('triage.alsoFiles', { list: listOf(files.map((f) => f.filename)) })}
        </p>
      ) : null}
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

// What a card shows of the round under review: its images, the fields and other files it hands in.
// pending: the board the item is on is still being read (its gate is not known yet).
type RoundShown = {
  figures: Evidence[];
  fields: { ref: string; name: string; value: string }[];
  files: Evidence[];
  gate: Gate | undefined;
  pending: boolean;
};

type CardProps = {
  item: Item;
  under: boolean;
  view: ItemView | undefined;
  round: RoundShown;
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

// The card's moves once its view is read and, on a board, the board too: an approval the board
// would refuse is never offered, it is shown held with why.
function planOf(view: ItemView | undefined, round: RoundShown): TriagePlan | undefined {
  if (!view || round.pending) return undefined;
  return triagePlan(view.transitions, waitsOf(view), round.gate);
}

function TriCard({
  item,
  under,
  view,
  round,
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
  const plan = planOf(view, round);
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
  const waitId = `tc-wait-${item.id}`;
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
      <Delivered round={round} />
      <Figures shown={round.figures} />
      <div className="tc-acts">
        <Button
          variant="primary"
          disabled={!ready || !forward}
          onClick={approve}
          aria-describedby={blocked ? waitId : undefined}
        >
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
      {blocked ? (
        <p className="tc-wait" id={waitId} data-gate={round.gate ? '' : undefined}>
          {blocked.note}
        </p>
      ) : null}
      {/* The hint names both ways: said only while both are open. */}
      {ready && forward && back ? (
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

// How many cards a pile shows whole; the rest are its edges, counted.
const PILE_SHOWN = 6;

type PileProps = {
  pile: Pile;
  entries: readonly PileEntry[];
  // The card flying onto this pile now, if any: its place is made at once, unseen until it lands.
  landing: PileEntry | undefined;
  titleOf: (id: string) => string;
  lookOf: (id: string) => Look;
  wordOf: (id: string, state: string) => string;
  onOpen: (id: string) => void;
};

// One pile beside the card: what this pass approved (right) or sent back (left), the last decided
// on top. The cards already on it make way for one landing and close up over one taken back,
// sliding to their new places (360, settle); under reduced motion they just are there. A card taken
// back off the pile leaves its entry as the landing's handover reversed: the entry crossfades out
// (HANDOVER ms) as the card comes up out of it.
function PileOf({ pile, entries, landing, titleOf, lookOf, wordOf, onOpen }: PileProps) {
  const side = pileSide(pile);
  const all = landing ? [landing, ...entries] : entries;
  const { shown, more } = pileView(all, PILE_SHOWN);
  const list = useRef<HTMLOListElement>(null);
  const tops = useRef(new Map<string, number>());
  const copies = useRef(new Map<string, HTMLElement>());
  const held = all.map((e) => e.id).join(' ');
  const keys = shown.map((e) => e.id).join(' ');
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again when the pile changes
  useLayoutEffect(() => {
    const ol = list.current;
    if (!ol) return;
    const was = tops.current;
    const now = new Map<string, number>();
    const still = new Set(held.split(' '));
    for (const [id, top] of was) {
      const copy = copies.current.get(id);
      if (still.has(id) || !copy || ol.offsetWidth === 0) continue;
      copy.classList.add('tpile-ghost');
      copy.style.top = `${top}px`;
      copy.inert = true;
      ol.append(copy);
      void anim(copy, [{ opacity: 1 }, { opacity: 0 }], HANDOVER, 'drift', 0, 'forwards')
        .finished.catch(() => undefined)
        .then(() => copy.remove());
    }
    copies.current = new Map();
    for (const li of ol.querySelectorAll<HTMLElement>(':scope > li[data-id]')) {
      const id = li.dataset.id ?? '';
      const top = li.offsetTop;
      now.set(id, top);
      copies.current.set(id, li.cloneNode(true) as HTMLElement);
      const before = was.get(id);
      if (before !== undefined && before !== top && !reduced()) {
        anim(
          li,
          [{ transform: `translateY(${before - top}px)` }, { transform: 'none' }],
          360,
          'settle',
          0,
          'backwards',
        );
      }
    }
    tops.current = now;
  }, [keys, held, landing?.id]);
  const label = t(pile === 'approved' ? 'triage.pileApproved' : 'triage.pileSent');
  return (
    <aside className="tpile" data-side={side} aria-label={label}>
      <div className="tpile-k">
        <span>{label}</span>
        <Count value={entries.length} />
      </div>
      <ol className="tpile-list" ref={list} data-pile-land={side}>
        {all.length === 0 ? (
          <li className="tpile-empty">
            {t(pile === 'approved' ? 'triage.pileApprovedEmpty' : 'triage.pileSentEmpty')}
          </li>
        ) : (
          shown.map((e) => (
            <li
              key={e.id}
              data-id={e.id}
              data-landing={e === landing ? '' : undefined}
              className="tpile-card"
            >
              <button type="button" onClick={() => onOpen(e.id)}>
                <span className="tpile-id">
                  <NodeGlyph look={lookOf(e.id)} size={14} />
                  {e.id}
                </span>
                <span className="tpile-title">{titleOf(e.id)}</span>
                <span className="tpile-to">
                  {t('triage.stampTo', { state: wordOf(e.id, e.to) })}
                </span>
              </button>
            </li>
          ))
        )}
      </ol>
      {more > 0 ? (
        <p className="tpile-more" data-more={Math.min(more, 3)}>
          {t('triage.pileMore', { count: more })}
        </p>
      ) : null}
    </aside>
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
    round: RoundShown;
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
  const root = useRef<HTMLDivElement>(null);
  // The card flying onto its pile now: its place on the pile is made as it leaves.
  const [landing, setLanding] = useState<PileEntry | undefined>(undefined);

  const s = pass ?? triStart([]);
  const cur = triCurrent(s);
  const next = triNext(s);
  const nextShown = next !== cur ? next : undefined;
  const views = useViews(
    [cur, nextShown].filter((id): id is string => !!id),
    app.version,
  );
  // The boards the two cards are on, when Studio publishes them: what a step hands in, and what
  // its approval waits for.
  const collectionOf = (id: string | undefined) =>
    id ? (known.current.get(id)?.collection ?? '') : '';
  const boards = [
    [collectionOf(cur), useStudioBoard(collectionOf(cur))?.live],
    [collectionOf(nextShown), useStudioBoard(collectionOf(nextShown))?.live],
  ] as const;
  const defOf = (collection: string): BoardDefinition | undefined =>
    boards.find(([c, def]) => c === collection && def)?.[1];

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
      returnIn(top, side, landingOn(top, side));
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
    const view = views.get(id);
    return {
      item: it,
      view,
      round: roundShown(it, view, type),
      words: cardWords(it, app.feed, view),
      state: stateWord(type, it.state),
    };
  }

  // The round under review, as the card shows it (on a board, read with the board).
  function roundShown(
    it: Item,
    view: ItemView | undefined,
    type: ReturnType<typeof typeOfItem>,
  ): RoundShown {
    const def = defOf(it.collection);
    const pending = !def && onPublishedBoard(it.collection);
    if (!view) return { figures: [], fields: [], files: [], gate: undefined, pending };
    const round = roundEvidence(view, def);
    const figures = cardFigures(round);
    const files = round.filter((e) => !e.contentType.startsWith('image/'));
    const block = (view as ItemView & { board?: ItemBoardBlock }).board;
    const held = def ? approvalGate(def, { state: view.state, board: block }) : undefined;
    return {
      figures,
      fields: def ? deliveredFields(def, view, (f, v) => valueWord(type, f, v)) : [],
      files,
      gate: held ? { to: held.to, note: approvalWaitWords(held.missing) } : undefined,
      pending,
    };
  }

  const wordOf = (id: string) => (state: string) => {
    const it = known.current.get(id);
    return it ? stateWord(typeOfItem(it, app.collectionOf), state) : state;
  };

  // Where a card resting on the stack lands on the pile of its side, if that pile is on the screen
  // (on a narrow view the piles fold to their counts, and the card is thrown off the side).
  const landingOn = (card: HTMLElement, side: Direction): Landing | undefined => {
    const list = root.current?.querySelector<HTMLElement>(`[data-pile-land="${side}"]`);
    const box = list?.getBoundingClientRect();
    const at = stack.current?.getBoundingClientRect();
    if (!box || !at || box.width === 0 || reduced()) return undefined;
    return {
      ...pileLanding(
        { left: at.left, top: at.top, width: card.offsetWidth, height: card.offsetHeight },
        { left: box.left, top: box.top, width: box.width, height: 0 },
      ),
      entry: () => list?.querySelector<HTMLElement>('.tpile-card[data-landing]'),
    };
  };

  const decide = (kind: TriKind, reason = '', from?: From) => {
    if (!cur || flying.current) return;
    const id = cur;
    const it = known.current.get(id);
    const shown = shownOf(id);
    const plan = shown ? planOf(shown.view, shown.round) : undefined;
    const move = kind === 'approve' ? plan?.forward : kind === 'send' ? plan?.back : undefined;
    if (kind !== 'later' && !move) return;
    const side: Direction = kind === 'approve' ? 'right' : 'left';
    flying.current = id;
    if (shown) frozen.current.set(id, shown);
    const card = els.current.get(id);
    const pile = pileOf(kind);
    if (pile && move) setLanding({ id, pile, to: move.to });
    const out = card
      ? kind === 'later'
        ? dropLater(card)
        : throwOut(card, side, from?.x ?? 0, from?.v ?? 0, landingOn(card, side))
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
      setLanding(undefined);
      setPass((was) => {
        if (!was) return was;
        const after = triSync(triDecide(was, kind, move?.to), live.current);
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
        round={shown.round}
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
  const approved = triPile(s, 'approved');
  const sent = triPile(s, 'sent');
  const pileProps = {
    titleOf: (id: string) => known.current.get(id)?.title ?? id,
    lookOf: (id: string): Look => {
      const it = known.current.get(id);
      return it ? lookOf(it, app.now) : 'done';
    },
    wordOf: (id: string, state: string) => wordOf(id)(state),
    onOpen: (id: string) => app.openItem(id),
  };
  return (
    <div className="tri" ref={root}>
      <div className="thd" data-enter="head">
        <button type="button" className="back" onClick={() => app.go({ view: 'toca' })}>
          <span aria-hidden="true">← </span>
          {t('triage.back')}
        </button>
        <div className="ttitle">
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
      </div>
      <div className="tbody">
        <PileOf
          pile="sent"
          entries={sent}
          landing={landing?.pile === 'sent' ? landing : undefined}
          {...pileProps}
        />
        <div className="tmain">
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
          {s.decided > 0 ? (
            <p className="tcounts">
              <span data-side="left">
                <span aria-hidden="true">← </span>
                {t('triage.countSent', { count: sent.length })}
              </span>
              <span data-side="right">
                {t('triage.countApproved', { count: approved.length })}
                <span aria-hidden="true"> →</span>
              </span>
            </p>
          ) : null}
        </div>
        <PileOf
          pile="approved"
          entries={approved}
          landing={landing?.pile === 'approved' ? landing : undefined}
          {...pileProps}
        />
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
