import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { openBlockers } from '../../actions.ts';
import { fetchItem, undoMove } from '../../api.ts';
import { useApp } from '../../app/context.tsx';
import { Q } from '../../app/queue.ts';
import { bulkPlan, type Selected } from '../../bulk.ts';
import { t } from '../../i18n/i18n.ts';
import { Button } from '../../kit/Button.tsx';
import { Count } from '../../kit/Count.tsx';
import { Icon } from '../../kit/Icon.tsx';
import { Checkbox } from '../../kit/Marks.tsx';
import { anchorAbove } from '../../kit/pop/anchors.ts';
import { MenuItem, MenuLabel } from '../../kit/pop/Menu.tsx';
import { Pop } from '../../kit/pop/Pop.tsx';
import { toast } from '../../kit/pop/toast.tsx';
import { Swap } from '../../kit/Swap.tsx';
import { motionBus } from '../../motion/bus.ts';
import { Choreo, part } from '../../motion/choreo.ts';
import { reduced } from '../../motion/reduced.ts';
import { stateWordIn } from '../../preset-words.ts';
import type { CollectionView, Item, Move } from '../../types.ts';
import { type TrayButton, trayButtons, trayStates } from './tray.ts';

// The tray (SPEC §10.1, mock:478-494, 3738-3844): docked at the foot of the table while rows are
// ticked. A line leads, the surface unrolls; the count rolls; only the moves every ticked item can
// take; Devolver asks its reason once; a run moves one item at a time through the handoff, then a
// receipt stays 6 s and a toast offers Deshacer.

type Phase =
  | { kind: 'idle' }
  | { kind: 'reason'; button: TrayButton }
  | { kind: 'run'; state: string; total: number; done: number }
  | { kind: 'receipt'; text: string };

// The moves each ticked item can take where it stands, read from the server as the detail reads
// them; keyed by id and state, so a move reads them again.
type Moves = ReadonlyMap<string, { moves: Move[]; blockers: number }>;
const at = (it: Item) => `${it.id}@${it.state}`;

function useMoves(items: readonly Item[]): Moves {
  const [got, setGot] = useState<Moves>(new Map());
  const key = items.map(at).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: the items, by id and state
  useEffect(() => {
    const missing = items.filter((it) => !got.has(at(it)));
    if (!missing.length) return;
    const ctl = new AbortController();
    for (const it of missing) {
      fetchItem(it.id, ctl.signal).then(
        (view) => {
          if (!view) return;
          const one = { moves: view.transitions, blockers: openBlockers(view.relations) };
          setGot((m) => new Map(m).set(`${view.id}@${view.state}`, one));
        },
        () => undefined,
      );
    }
    return () => ctl.abort();
  }, [key]);
  return got;
}

// A move lands through the handoff: the next one waits until the list has carried this one (the
// data arrives, the handoff begins and ends), or gives up after a while.
function handedOff(): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let off = () => undefined as unknown;
    const done = () => {
      off();
      resolve();
    };
    const look = () => {
      if (motionBus.inFlight()) {
        off = motionBus.onIdle(done);
        return;
      }
      if (performance.now() - t0 > 1600) done();
      else requestAnimationFrame(look);
    };
    look();
  });
}

// The moves some ticked items could take but not all, named as the buttons are: two, and how many
// more.
function hiddenSaid(
  selected: readonly Selected[],
  hidden: readonly { moves: string[] }[],
  word: (s: string) => string,
): string {
  const tos = new Set(hidden.flatMap((h) => h.moves));
  const union: Move[] = [];
  for (const { moves } of selected) {
    for (const m of moves ?? [])
      if (tos.has(m.to) && !union.some((u) => u.to === m.to)) union.push(m);
  }
  const labels = [...new Set(trayButtons(union, word).map((b) => b.label))];
  const rest = labels.length - 2;
  return rest > 0
    ? `${labels.slice(0, 2).join(', ')} ${t('boardView.tray.andMore', { count: rest })}`
    : labels.join(t('boardView.tray.and'));
}

export function Tray({
  items,
  collection,
  onUntick,
  onKeep,
  onClear,
}: {
  items: readonly Item[];
  collection: CollectionView;
  onUntick: (id: string) => void;
  onKeep: (ids: string[]) => void;
  onClear: () => void;
}) {
  const app = useApp();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // The receipt's 6 s; a new run or leaving clears it, so it never cuts a later run.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  const busy = phase.kind === 'run' || phase.kind === 'receipt';
  const want = items.length > 0 || busy;
  const [present, setPresent] = useState(want);
  const el = useRef<HTMLElement>(null);
  const ch = useRef<Choreo | null>(null);
  const [keepOpen, setKeepOpen] = useState(false);
  const keepBtn = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState('');
  const word = (s: string) => stateWordIn(collection.types, s);

  if (want && !present) setPresent(true);

  // The line leads, the surface unrolls riding its edge; closing is the same, mirrored.
  // biome-ignore lint/correctness/useExhaustiveDependencies: again when the tray mounts
  useLayoutEffect(() => {
    const root = el.current;
    if (!root) return;
    if (!ch.current) {
      ch.current = new Choreo([
        part(
          root.querySelector('.tline'),
          { transform: 'scaleX(0.001)' },
          { transform: 'scaleX(1)' },
          360,
          'glide',
          0,
        ),
        part(
          root.querySelector('.tsurf'),
          { clipPath: 'inset(0px -40px 100% -40px)' },
          { clipPath: 'inset(0px -40px -40px -40px)' },
          480,
          'settle',
          50,
        ),
        part(
          root.querySelector('.tsurf'),
          { transform: 'translateY(-10px)' },
          { transform: 'translateY(0px)' },
          480,
          'settle',
          50,
        ),
        part(root, { opacity: 0 }, { opacity: 1 }, 1, 'drift', 0, { ronly: true }),
      ]);
    }
    if (want && ch.current.dir !== 1) ch.current.go(1);
    else if (!want && ch.current.dir !== 0) {
      ch.current.go(0).then((latest) => {
        if (latest) {
          ch.current = null;
          setPresent(false);
        }
      });
    }
  }, [want, present]);

  const moves = useMoves(items);
  const selected: Selected[] = items.map((item) => {
    const m = moves.get(at(item));
    return { item, moves: m?.moves, blockers: m?.blockers ?? 0 };
  });
  const plan = bulkPlan(selected);
  const buttons = trayButtons(plan.moves, word);
  const byState = plan.states;

  if (!present) return null;

  const failed = (id: string, e: unknown) =>
    toast({
      msg: t('boardView.tray.failed', { id, why: e instanceof Error ? e.message : String(e) }),
    });

  const run = async (b: TrayButton, why: string) => {
    const order = items.map((it) => ({ id: it.id, from: it.state }));
    const state = word(b.move.to);
    clearTimeout(idleTimer.current);
    setPhase({ kind: 'run', state, total: order.length, done: 0 });
    const moved: { id: string; from: string; to: string }[] = [];
    for (let i = 0; i < order.length; i++) {
      const o = order[i];
      if (!o) continue;
      try {
        await app.move(o.id, b.move.to, why || undefined);
        moved.push({ ...o, to: b.move.to });
        onUntick(o.id);
        await handedOff();
      } catch (e) {
        failed(o.id, e);
      }
      setPhase({ kind: 'run', state, total: order.length, done: i + 1 });
    }
    const count = moved.length;
    setPhase({ kind: 'receipt', text: t('boardView.tray.receipt', { count, state }) });
    toast({
      msg: t('boardView.tray.toast', { count, state }),
      ...(count > 0
        ? {
            undo: () => {
              (async () => {
                for (const m of moved) {
                  try {
                    await Q.run(() => undoMove(m.id, m.from));
                  } catch (e) {
                    failed(m.id, e);
                  }
                }
              })();
            },
          }
        : {}),
    });
    idleTimer.current = setTimeout(() => setPhase({ kind: 'idle' }), reduced() ? 1200 : 6000);
  };

  const press = (b: TrayButton) => {
    if (b.reason) {
      setReason('');
      setPhase({ kind: 'reason', button: b });
    } else run(b, '');
  };

  let body: ReactNode;
  let k: string;
  if (phase.kind === 'run') {
    k = 'run';
    body = (
      <div className="tgrid">
        <div className="tprog" style={{ gridColumn: '1 / -1' }}>
          <span>{t('boardView.tray.movingTo', { state: phase.state })} </span>
          <Count value={phase.done} /> {t('boardView.tray.ofTotal', { total: phase.total })}
        </div>
      </div>
    );
  } else if (phase.kind === 'receipt') {
    k = 'receipt';
    body = (
      <div className="tgrid">
        <div className="tprog" style={{ gridColumn: '1 / -1' }}>
          <b>{phase.text}</b> {t('boardView.tray.closesIn')}
        </div>
      </div>
    );
  } else {
    k = phase.kind;
    const count = items.length;
    body = (
      <div className="tgrid">
        <div className="tcount">
          <Checkbox checked aria-label={t('boardView.tray.clearAria')} onChange={onClear} />
          <b>
            <Count value={count} /> {t('boardView.tray.selected', { count })}
          </b>
          <small>{trayStates(items, word)}</small>
        </div>
        <div className="tmoves">
          {phase.kind === 'reason' ? (
            <form
              className="tnote"
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim()) run(phase.button, reason.trim());
              }}
            >
              <input
                // biome-ignore lint/a11y/noAutofocus: the reason is what the person came to write
                autoFocus
                value={reason}
                placeholder={t('boardView.tray.why')}
                aria-label={t('boardView.tray.why')}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setPhase({ kind: 'idle' });
                  }
                }}
              />
              <Button variant="primary" size="sm" type="submit" disabled={!reason.trim()}>
                {t('boardView.tray.send')}
              </Button>
              <Button variant="text" size="sm" onClick={() => setPhase({ kind: 'idle' })}>
                {t('boardView.tray.cancel')}
              </Button>
            </form>
          ) : (
            <div className="tbtns">
              {buttons.map((b) => (
                <span key={b.move.to} className="tb">
                  {b.closeAs ? <span className="closeas">{t('common.closeAs')}</span> : null}
                  <Button variant={b.variant} size="sm" onClick={() => press(b)}>
                    {b.label}
                  </Button>
                </span>
              ))}
              {byState.length > 1 ? (
                <button
                  ref={keepBtn}
                  type="button"
                  className="btn text sm"
                  aria-haspopup="menu"
                  aria-expanded={keepOpen}
                  onClick={() => setKeepOpen((o) => !o)}
                >
                  {t('boardView.tray.keepOnly')} ▾
                </button>
              ) : null}
            </div>
          )}
          <div className="tcap">
            {plan.loading
              ? t('boardView.tray.reading')
              : buttons.length
                ? t('boardView.tray.cap', { count })
                : t('boardView.tray.none')}
            {!plan.loading && plan.hidden.length
              ? ` · ${t('boardView.tray.capHidden', { moves: hiddenSaid(selected, plan.hidden, word) })}`
              : ''}
          </div>
        </div>
        <div className="tend">
          <Button
            variant="text"
            size="sm"
            onClick={() => app.go({ view: 'brief', ids: items.map((it) => it.id) })}
          >
            {t('boardView.tray.brief')}
          </Button>
          <Button variant="text" size="sm" className="tclear" onClick={onClear}>
            <Icon name="x" />
            {t('boardView.tray.clear')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section
      className={phase.kind === 'receipt' ? 'tray lifted' : 'tray'}
      ref={el}
      aria-label={t('boardView.tray.aria')}
    >
      <i className="tline" />
      <div className="tsurf">
        <Swap k={k} as="div" className="tswap">
          {body}
        </Swap>
      </div>
      <Pop
        open={keepOpen}
        anchor={keepBtn.current}
        edge="bottom"
        place={keepBtn.current ? anchorAbove(keepBtn.current) : 'above'}
        role="menu"
        label={t('boardView.tray.keepOnlyTitle')}
        onClose={() => setKeepOpen(false)}
      >
        <MenuLabel>{t('boardView.tray.keepOnlyTitle')}</MenuLabel>
        {plan.narrow.map((n) => (
          <MenuItem key={n.state} onPick={() => onKeep(n.ids)}>
            {t('boardView.tray.keepN', {
              count: n.ids.length,
              id: n.ids[0] ?? '',
              state: word(n.state),
            })}
          </MenuItem>
        ))}
      </Pop>
    </section>
  );
}
