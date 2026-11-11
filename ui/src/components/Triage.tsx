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
import { t, tx } from '../i18n/i18n.ts';
import { useEscape } from '../kit/escape.ts';
import { Button, Count, StepPill } from '../kit/index.ts';
import { toast } from '../kit/pop/toast.tsx';
import { NodeGlyph } from '../lanes/NodeGlyph.tsx';
import { anim } from '../motion/anim.ts';
import { Choreo, part } from '../motion/choreo.ts';
import { reduced } from '../motion/reduced.ts';
import { stateWord } from '../preset-words.ts';
import {
  cardWords,
  dragIntent,
  dragProgress,
  releaseDirection,
  type TriagePlan,
  type TriKind,
  type TriState,
  triagePlan,
  triageQueue,
  triCurrent,
  triDecide,
  triNext,
  triStart,
  triSync,
} from '../triage.ts';
import type { Evidence, Item, ItemView } from '../types.ts';
import { arriveUnder, DECIDE_MS, flyOut, riseUnder, settleBack } from './triage-flight.ts';

// Triaje (#/triage, SPEC §10.4, mock:829-847, 3995-4036): the reviews, one card at a time over the
// next one. Aprobar flies the card right, Devolver… opens notes in the card and flies it left with
// them, Después drops it to the end of the pass; the card under it rises into its place. "Todo al
// día." once every card is decided. On the phone a swipe right approves, a swipe left sends back.

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
          <img src={evidenceFileUrl(e.id)} alt={e.caption ?? e.filename} loading="lazy" />
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

type CardProps = {
  item: Item;
  under: boolean;
  view: ItemView | undefined;
  words: ReturnType<typeof cardWords>;
  state: string;
  phone: boolean;
  register: (id: string, el: HTMLElement | null) => void;
  onDecide: (kind: TriKind, reason?: string) => void;
  onOpen: () => void;
};

function standfirst({ agent, round }: ReturnType<typeof cardWords>): ReactNode {
  if (!agent) return t('triage.yours');
  const who = <b>{agent}</b>;
  return round > 1
    ? tx('triage.handsRound', { agent: who, round })
    : tx('triage.hands', { agent: who });
}

function TriCard({
  item,
  under,
  view,
  words,
  state,
  phone,
  register,
  onDecide,
  onOpen,
}: CardProps) {
  const [notes, setNotes] = useState(false);
  const card = useRef<HTMLElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const plan: TriagePlan | undefined = view
    ? triagePlan(view.transitions, waitsOf(view))
    : undefined;
  const forward = plan?.forward;
  const back = plan?.back;
  // The card under the top one waits complete (inert, never pale): it is the same card, brought forward.
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

  // The phone's swipes, from today's triage.ts: right approves, left sends back.
  const place = (dx: number) => {
    const el = card.current;
    if (!el) return;
    const tilt = Math.max(-3, Math.min(3, dx * 0.01));
    el.style.transform = `translateX(${dx}px) rotate(${tilt}deg)`;
    el.parentElement?.style.setProperty('--p', String(dragProgress(dx, el.offsetWidth)));
    el.dataset.lean = dx > 0 ? 'right' : 'left';
  };
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!phone || !ready || notes || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
    drag.current = {
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      dx: 0,
      t: e.timeStamp,
      vx: 0,
      live: false,
    };
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
    }
    const dt = e.timeStamp - d.t;
    if (dt > 0) d.vx = (dx - d.dx) / dt;
    d.dx = dx;
    d.t = e.timeStamp;
    place(dx);
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.live || e.pointerId !== d.pointer) return;
    const el = e.currentTarget;
    delete el.dataset.lean;
    const vx = e.timeStamp - d.t > 120 ? 0 : d.vx;
    const side = releaseDirection({ dx: d.dx, vx, width: el.offsetWidth });
    const move = side === 'right' ? forward : side === 'left' ? back : undefined;
    if (move && !move.reasonRequired) onDecide(side === 'right' ? 'approve' : 'send');
    else {
      settleBack(el);
      if (move) setNotes(true);
    }
  };
  const onPointerCancel = (e: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    settleBack(e.currentTarget);
  };

  const blocked = plan?.blocked?.[0];
  return (
    <article
      ref={(el) => {
        card.current = el;
        register(item.id, el);
      }}
      className={under ? 'tcard under' : 'tcard'}
      data-tk={item.id}
      aria-hidden={under || undefined}
      inert={under}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
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
      {phone ? <p className="tc-hint">{t('triage.swipeHint')}</p> : null}
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
  const flying = useRef(false);
  const settled = useRef(false);
  const stack = useRef<HTMLDivElement>(null);

  const s = pass ?? triStart([]);
  const cur = triCurrent(s);
  const next = triNext(s);
  const nextShown = next !== cur ? next : undefined;
  const views = useViews(
    [cur, nextShown].filter((id): id is string => !!id),
    app.version,
  );

  // New reviews join the pass, reviews moved elsewhere drop out (never mid-flight).
  const waitKey = waiting.join(' ');
  // biome-ignore lint/correctness/useExhaustiveDependencies: the reviews, by their ids
  useEffect(() => {
    if (!flying.current) setPass((was) => (was ? triSync(was, waiting) : was));
  }, [waitKey]);

  // The stack is as tall as its top card; the card that rose is let go of its flight; the card
  // that came to wait under it resolves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: after every change of the pass
  useLayoutEffect(() => {
    const top = cur ? els.current.get(cur) : undefined;
    if (top) {
      for (const a of top.getAnimations()) a.cancel();
      top.style.pointerEvents = '';
      if (stack.current) stack.current.style.minHeight = `${top.offsetHeight + 40}px`;
    }
    const under = nextShown ? els.current.get(nextShown) : undefined;
    if (under && settled.current && !under.getAnimations().length) arriveUnder(under);
    settled.current = true;
  }, [cur, nextShown, pass]);

  // The reviews as they are when the flight lands (the decided one may still be listed).
  const live = useRef(waiting);
  live.current = waiting;
  const triageQueueNow = () => live.current;

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

  const decide = (kind: TriKind, reason = '') => {
    if (!cur || flying.current) return;
    const id = cur;
    const it = known.current.get(id);
    const view = views.get(id);
    const plan = view ? triagePlan(view.transitions, waitsOf(view)) : undefined;
    const move = kind === 'approve' ? plan?.forward : kind === 'send' ? plan?.back : undefined;
    if (kind !== 'later' && !move) return;
    flying.current = true;
    const shown = shownOf(id);
    if (shown) frozen.current.set(id, shown);
    const card = els.current.get(id);
    if (card) flyOut(card, kind);
    riseUnder(nextShown ? els.current.get(nextShown) : undefined);
    if (move && it) {
      const type = typeOfItem(it, app.collectionOf);
      const state = stateWord(type, move.to);
      const msg =
        kind === 'approve'
          ? t('triage.toastApprove', { title: it.title, state })
          : t('triage.toastSend', { title: it.title, state });
      app.move(id, move.to, reason, msg).catch((error: unknown) => {
        toast({ msg: error instanceof Error ? error.message : t('common.failed'), id });
        setPass((was) => (was ? { ...was, q: [...was.q, id], decided: was.decided - 1 } : was));
      });
    }
    window.setTimeout(() => {
      flying.current = false;
      frozen.current.delete(id);
      setPass((was) => (was ? triSync(triDecide(was, kind), triageQueueNow()) : was));
    }, DECIDE_MS);
  };

  const at = s.i + 1;
  const n = s.q.length;
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
      <div className="tstack" ref={stack} data-enter="fade">
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
