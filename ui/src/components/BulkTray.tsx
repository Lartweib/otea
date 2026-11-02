import {
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { moveVariants } from '../actions.ts';
import { fetchItem, moveItem } from '../api.ts';
import {
  type BulkPlan,
  bulkPlan,
  countsSummary,
  fitMoves,
  type Placed,
  type StateCount,
  trayMoves,
} from '../bulk.ts';
import { Button, Icon } from '../kit/index.ts';
import type { Item, Move } from '../types.ts';

// The moves each selected item can take from where it stands, read from the API as the detail
// reads them (so the browser's authority and the preset decide), keyed by the item's last change.
function useMoves(items: readonly Item[]): ReadonlyMap<string, readonly Move[]> {
  const [known, setKnown] = useState<ReadonlyMap<string, readonly Move[]>>(new Map());
  const keys = items.map(({ id, updatedAt }) => `${id}@${updatedAt}`);
  const wanted = keys.join(' ');
  // biome-ignore lint/correctness/useExhaustiveDependencies: one read per selected item and change
  useEffect(() => {
    const controller = new AbortController();
    for (const key of keys) {
      if (known.has(key)) continue;
      const id = key.slice(0, key.lastIndexOf('@'));
      fetchItem(id, controller.signal).then(
        (view) => setKnown((current) => new Map(current).set(key, view ? view.transitions : [])),
        () => undefined,
      );
    }
    return () => controller.abort();
  }, [wanted]);
  return new Map(
    items.flatMap(({ id, updatedAt }) => {
      const moves = known.get(`${id}@${updatedAt}`);
      return moves ? [[id, moves] as const] : [];
    }),
  );
}

// The scrollbar's width on the grid pane, so the tray ends where the rows do.
function useGutter(host: HTMLElement | null): number {
  const [gutter, setGutter] = useState(0);
  useEffect(() => {
    const pane = host?.parentElement?.querySelector<HTMLElement>(':scope > .list-pane');
    if (!pane) return undefined;
    const measure = () => setGutter(pane.offsetWidth - pane.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [host]);
  return gutter;
}

type Step =
  | { step: 'choosing' }
  | { step: 'explaining'; move: Move; reason: string }
  | { step: 'posting'; move: Move; why: string; states: StateCount[]; total: number; done: number }
  | { step: 'landed'; move: Move; moved: string[]; failed: { id: string; why: string }[] };

type Layer = Step['step'];
const LAYERS: readonly Layer[] = ['choosing', 'explaining', 'posting', 'landed'];

type Menu = { kind: 'more' | 'keep'; anchor: HTMLElement };

type MenuEntry =
  | { kind: 'title'; label: string }
  | { kind: 'item'; key: string; label: string; count?: number; quiet?: boolean; run: () => void };

const RECEIPT_MS = 6000;
const MENU_W = 248;

const label = (move: Move) => `${move.to}${move.reasonRequired ? '…' : ''}`;

// The receipt's headline: what moved where, or that nothing did.
function receiptOf(step: Extract<Step, { step: 'landed' }>): string {
  const [only] = step.moved;
  if (!only) return 'Nothing moved';
  return `${step.moved.length === 1 ? only : `${step.moved.length} items`} → ${step.move.to}`;
}

// What keeps the other moves out, or what the moves shown are.
function ruleOf(plan: BulkPlan, count: number): string {
  if (plan.hidden.length > 0) {
    return `hidden · ${plan.hidden.map(({ moves, why }) => `${moves.join(', ')}: ${why}`).join(' · ')}`;
  }
  return count === 1 ? 'the moves this item can take' : `only the moves all ${count} can take`;
}

// A menu that opens upward from the tray: role menu, its items reached with Tab or the arrows,
// Home and End; Esc closes it and gives the focus back to what opened it; a press outside closes it.
function TrayMenu({
  anchor,
  title,
  entries,
  onClose,
}: {
  anchor: HTMLElement;
  title: string;
  entries: readonly MenuEntry[];
  onClose: (focus: boolean) => void;
}) {
  const self = useRef<HTMLDivElement>(null);
  const place = () => {
    const box = anchor.getBoundingClientRect();
    return {
      left: Math.max(8, Math.min(box.right - MENU_W, window.innerWidth - MENU_W - 8)),
      bottom: window.innerHeight - box.top + 8,
    };
  };
  const [at, setAt] = useState(place);
  // biome-ignore lint/correctness/useExhaustiveDependencies: placed once per anchor
  useLayoutEffect(() => setAt(place()), [anchor]);

  useEffect(() => {
    self.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (self.current?.contains(target) || anchor.contains(target)) return;
      onClose(false);
    };
    const away = () => onClose(false);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', away);
    };
  }, [anchor, onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    const all = [...(self.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = all.indexOf(document.activeElement as HTMLElement);
    const go = (next: number) => {
      event.preventDefault();
      all[(next + all.length) % all.length]?.focus();
    };
    if (event.key === 'ArrowDown') go(index + 1);
    else if (event.key === 'ArrowUp') go(index - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(all.length - 1);
  };

  return createPortal(
    <div
      ref={self}
      className="grid-menu bulk-menu"
      role="menu"
      aria-label={title}
      style={{ left: at.left, bottom: at.bottom }}
      onKeyDown={onKeyDown}
    >
      {entries.map((entry) =>
        entry.kind === 'title' ? (
          <div key={`title:${entry.label}`} className="grid-menu-t">
            {entry.label}
          </div>
        ) : (
          <button
            key={entry.key}
            type="button"
            role="menuitem"
            className="grid-menu-i"
            data-quiet={entry.quiet || undefined}
            onClick={entry.run}
          >
            {entry.label}
            {entry.count === undefined ? null : <span className="grid-menu-n">{entry.count}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

// The states under the count, on two lines at most: when they do not fit, the states with the most
// items and how many more (`+2 more`), measured before paint; the whole summary stays the tooltip
// and what assistive tech reads. A line breaks only after a separator, never inside a state.
function States({ states }: { states: readonly StateCount[] }) {
  const self = useRef<HTMLSpanElement>(null);
  const all = countsSummary(states).join(' · ');
  const [keep, setKeep] = useState(states.length);
  const [width, setWidth] = useState(0);
  const measured = useRef('');
  useLayoutEffect(() => {
    const element = self.current;
    if (!element) return;
    // Every state again whenever they or the room change, then one fewer until they fit.
    const key = `${all}@${width}`;
    if (measured.current !== key) {
      measured.current = key;
      if (keep !== states.length) {
        setKeep(states.length);
        return;
      }
    }
    if (keep > 1 && element.scrollHeight > element.clientHeight + 1) setKeep(keep - 1);
  });
  useEffect(() => {
    const element = self.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const said = countsSummary(states, keep);
  const cut = keep < states.length;
  return (
    <span ref={self} className="bulk-s" title={all}>
      {cut ? <span className="visually-hidden">{all}</span> : null}
      <span aria-hidden={cut || undefined}>
        {said.map((each, index) => (
          <Fragment key={each}>
            {index > 0 ? ' ' : null}
            <span className="bulk-st">{index < said.length - 1 ? `${each} ·` : each}</span>
          </Fragment>
        ))}
      </span>
    </span>
  );
}

// The box and the count: how many are ticked and of which states.
function Who({ count, states }: { count: number; states: readonly StateCount[] }) {
  return (
    <div className="bulk-zone bulk-who">
      <span className="bulk-n">
        <i className="bulk-box" aria-hidden="true">
          <svg className="bulk-ck" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 5.2 L4.1 7.2 L8 2.9" />
          </svg>
        </i>
        <b>{count} selected</b>
      </span>
      <States states={states} />
    </div>
  );
}

type BulkTrayProps = {
  selected: readonly Item[];
  canWrite: boolean;
  // The grid pane's own cell (App), where the tray docks over the scroller's bottom edge.
  host: HTMLElement | null;
  onKeep: (ids: string[]) => void;
  onClear: () => void;
  // The list is shown (or the views morph towards it): the tray leaves as it always does.
  away: boolean;
};

// The tray under a grid selection, docked to the bottom edge of the grid pane: one size for every
// state, three zones (who: how many and of which states; what: the moves every one of them can take,
// the reason, the progress or the receipt; the way out: keep only, clear). A move that asks a reason
// asks once, here, and records the same reason on each item. Then the tray says what landed for six
// seconds and leaves. It rises with the first tick and keeps its last look while it leaves, also
// when the view switches to the list, alongside the morph.
export function BulkTray({ selected, canWrite, host, onKeep, onClear, away }: BulkTrayProps) {
  const moves = useMoves(canWrite ? selected : []);
  const [state, setState] = useState<Step>({ step: 'choosing' });
  const [menu, setMenu] = useState<Menu | null>(null);
  const [room, setRoom] = useState(0);
  // The moves' widths, and the set of moves (`wanted`) they were measured for.
  const [widths, setWidths] = useState<{
    of: string;
    moves: number[];
    label: number;
    more: number;
  }>();
  const gutter = useGutter(host);
  const tray = useRef<HTMLElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const layerEls = useRef<Partial<Record<Layer, HTMLDivElement | null>>>({});
  // What to focus once the next layer is drawn, and whether focus goes back to the grid as it leaves.
  const focusNext = useRef<string | undefined>(undefined);
  const backToGrid = useRef<string | undefined>(undefined);
  // Each layer's last look, kept while it fades out; the layer shown while the tray leaves.
  const drawn = useRef<Partial<Record<Layer, ReactNode>>>({});
  const shown = useRef<Layer>('choosing');

  const plan = bulkPlan(selected.map((item) => ({ item, moves: moves.get(item.id) })));
  const variants = moveVariants(plan.moves);
  const ordered = trayMoves(plan.moves, variants, plan.moves.length).shown;
  const closeAt = ordered.findIndex(({ variant }) => variant === 'quiet');
  const wanted = ordered.map(({ move }) => label(move)).join(' ');
  // Widths measured for another set of moves say nothing about these: until they are measured
  // (before paint), every move is drawn, so the line never shows a set without its buttons.
  const fit =
    widths?.of === wanted
      ? fitMoves({
          widths: widths.moves,
          closeAt: closeAt < 0 ? ordered.length : closeAt,
          label: widths.label,
          more: widths.more,
          gap: 8,
          room,
        })
      : ordered.length;
  const placed = trayMoves(plan.moves, variants, fit);
  const on = !away && (selected.length > 0 || state.step === 'posting' || state.step === 'landed');

  // The moves' own widths, once per set of moves: the room decides how many show.
  useLayoutEffect(() => {
    const row = measure.current;
    if (!row) return;
    const width = (selector: string) =>
      [...row.querySelectorAll<HTMLElement>(selector)].map((each) => each.offsetWidth);
    setWidths({
      of: wanted,
      moves: width('[data-w="move"]'),
      label: width('[data-w="label"]')[0] ?? 0,
      more: width('[data-w="more"]')[0] ?? 0,
    });
  }, [wanted]);

  const line = useCallback((element: HTMLDivElement | null) => {
    if (!element) return undefined;
    const observer = new ResizeObserver(() => setRoom(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The receipt stays six seconds.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one timer per receipt
  useEffect(() => {
    if (state.step !== 'landed') return;
    const timer = setTimeout(() => leave({ step: 'choosing' }), RECEIPT_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // A tick during the receipt goes straight back to choosing; unticking everything ends the reason.
  useEffect(() => {
    if (state.step === 'landed' && selected.length > 0) setState({ step: 'choosing' });
    if (state.step === 'explaining' && selected.length === 0) setState({ step: 'choosing' });
  }, [state.step, selected.length]);

  useEffect(() => {
    if (!on) setMenu(null);
  }, [on]);

  // Focus: into the layer just drawn, or, as the tray leaves, back to the first row it moved.
  useEffect(() => {
    const want = focusNext.current;
    if (want !== undefined && on) {
      focusNext.current = undefined;
      const layer = layerEls.current[state.step];
      const target =
        want === 'tray'
          ? tray.current
          : (want
              .split(',')
              .map((selector) => layer?.querySelector<HTMLElement>(selector))
              .find(Boolean) ?? layer?.querySelector<HTMLElement>('button:not(:disabled)'));
      target?.focus({ preventScroll: true });
    }
    const back = backToGrid.current;
    if (back !== undefined && !on) {
      backToGrid.current = undefined;
      const grid = host?.parentElement?.querySelector('.list-pane');
      const row = grid?.querySelector<HTMLElement>(
        `tr[data-flip="${CSS.escape(back)}"] .grid-check`,
      );
      (row ?? grid?.querySelector<HTMLElement>('.grid-check'))?.focus({ preventScroll: false });
    }
  });

  // Leaving (clear, dismiss, the receipt's time): the focus goes back to the grid if it was here.
  const leave = (next: Step, clear = false) => {
    if (tray.current?.contains(document.activeElement)) {
      backToGrid.current =
        selected[0]?.id ?? (state.step === 'landed' ? state.moved[0] : undefined) ?? '';
    }
    setMenu(null);
    setState(next);
    if (clear) onClear();
  };

  const run = async (move: Move, why: string) => {
    const ids = selected.map(({ id }) => id);
    const failed: { id: string; why: string }[] = [];
    const base = { step: 'posting', move, why, states: plan.states, total: ids.length } as const;
    focusNext.current = 'tray';
    setMenu(null);
    setState({ ...base, done: 0 });
    for (const [index, id] of ids.entries()) {
      try {
        await moveItem(id, move.to, why);
      } catch (error) {
        failed.push({ id, why: error instanceof Error ? error.message : 'failed' });
      }
      setState({ ...base, done: index + 1 });
    }
    const moved = ids.filter((id) => !failed.some((each) => each.id === id));
    setState({ step: 'landed', move, moved, failed });
    onClear();
  };

  const choose = (move: Move) => {
    setMenu(null);
    if (move.reasonRequired) {
      focusNext.current = 'input';
      setState({ step: 'explaining', move, reason: '' });
    } else void run(move, '');
  };

  const back = (move: Move) => {
    focusNext.current = `[data-move="${CSS.escape(move.to)}"],.bulk-more`;
    setState({ step: 'choosing' });
  };

  const openMenu = (kind: Menu['kind'], anchor: HTMLElement) =>
    setMenu((open) => (open?.kind === kind ? null : { kind, anchor }));
  const closeMenu = useCallback((focus: boolean) => {
    setMenu((open) => {
      if (focus) open?.anchor.focus();
      return null;
    });
  }, []);

  const keepOnly = plan.narrow.length > 0 && (
    <Button
      variant="quiet"
      className="bulk-keep"
      aria-haspopup="menu"
      aria-expanded={menu?.kind === 'keep'}
      onClick={(event) => openMenu('keep', event.currentTarget)}
    >
      keep only
      <span className="bulk-caret">
        <Icon name="chevron" />
      </span>
    </Button>
  );
  const out = (
    <div className="bulk-zone bulk-out">
      {keepOnly}
      <Button
        variant="quiet"
        className="bulk-clear"
        onClick={() => leave({ step: 'choosing' }, true)}
      >
        <Icon name="close" />
        clear
      </Button>
    </div>
  );

  const move = (each: Placed, index: number, closeAs: boolean) => (
    <Fragment key={each.move.to}>
      {closeAs && index === placed.shown.findIndex(({ variant }) => variant === 'quiet') ? (
        <span className="bulk-ca t-cap">close as</span>
      ) : null}
      <Button variant={each.variant} data-move={each.move.to} onClick={() => choose(each.move)}>
        {label(each.move)}
      </Button>
    </Fragment>
  );

  const choosing = () => {
    const count = selected.length;
    const rule = canWrite && !plan.loading ? ruleOf(plan, count) : '';
    return (
      <>
        <Who count={count} states={plan.states} />
        <div className="bulk-zone bulk-what">
          <div className="bulk-l1" ref={line}>
            {!canWrite ? (
              <span className="bulk-none">Read-only: run otea open to act from this browser.</span>
            ) : plan.loading ? (
              <span className="bulk-none">Reading the moves…</span>
            ) : plan.moves.length === 0 ? (
              <span className="bulk-none">No move fits all {count}.</span>
            ) : (
              <>
                {placed.shown.map((each, index) => move(each, index, placed.closeAs === 'shown'))}
                {placed.more.length > 0 ? (
                  <Button
                    className="bulk-more"
                    aria-haspopup="menu"
                    aria-expanded={menu?.kind === 'more'}
                    onClick={(event) => openMenu('more', event.currentTarget)}
                  >
                    {placed.more.length} more
                    <span className="bulk-caret">
                      <Icon name="chevron" />
                    </span>
                  </Button>
                ) : null}
              </>
            )}
          </div>
          <p className="bulk-l2" title={rule}>
            {rule}
          </p>
          {/* Every move at its own width, unseen: the room decides how many the line shows. */}
          <div className="bulk-measure" ref={measure} aria-hidden="true" inert>
            {ordered.map(({ move: each, variant }) => (
              <Button key={each.to} variant={variant} data-w="move" tabIndex={-1}>
                {label(each)}
              </Button>
            ))}
            <span className="bulk-ca t-cap" data-w="label">
              close as
            </span>
            <Button className="bulk-more" data-w="more" tabIndex={-1}>
              9 more
              <span className="bulk-caret">
                <Icon name="chevron" />
              </span>
            </Button>
          </div>
        </div>
        {out}
      </>
    );
  };

  const explaining = (step: Extract<Step, { step: 'explaining' }>) => {
    const why = step.reason.trim();
    const count = selected.length;
    return (
      <>
        <Who count={count} states={plan.states} />
        <div className="bulk-zone bulk-what">
          <form
            className="bulk-l1"
            onSubmit={(event) => {
              event.preventDefault();
              if (why !== '') void run(step.move, why);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              back(step.move);
            }}
          >
            <label className="bulk-input">
              <span className="bulk-input-l" aria-hidden="true">
                {step.move.to}
              </span>
              <input
                value={step.reason}
                placeholder="Why? Agents read this"
                aria-label={`Reason for moving ${count === 1 ? 'it' : `all ${count}`} to ${step.move.to}`}
                onChange={(event) => setState({ ...step, reason: event.target.value })}
              />
            </label>
            <Button type="submit" variant="primary" disabled={why === ''}>
              {step.move.to} · {count}
            </Button>
            <Button variant="quiet" onClick={() => back(step.move)}>
              cancel
            </Button>
          </form>
          <p className="bulk-l2">
            a reason is required · the same reason is recorded on each · agents read it
          </p>
        </div>
        {out}
      </>
    );
  };

  const posting = (step: Extract<Step, { step: 'posting' }>) => (
    <>
      <Who count={step.total} states={step.states} />
      <div className="bulk-zone bulk-what">
        <div className="bulk-l1">
          <span
            className="bulk-prog"
            role="progressbar"
            aria-label={`Moving to ${step.move.to}`}
            aria-valuemin={0}
            aria-valuemax={step.total}
            aria-valuenow={step.done}
          >
            <i
              className="bulk-fill"
              style={{ width: `${(step.done / Math.max(1, step.total)) * 100}%` }}
            />
          </span>
          <span className="bulk-pc">
            moving {Math.min(step.total, step.done + 1)} of {step.total} to <b>{step.move.to}</b>
          </span>
        </div>
        <p className="bulk-l2" title={step.why}>
          {step.why ? `“${step.why}”` : 'one item at a time'}
        </p>
      </div>
      <div className="bulk-zone bulk-out" />
    </>
  );

  const landed = (step: Extract<Step, { step: 'landed' }>) => {
    const [first, ...others] = step.failed;
    const all = step.failed.map(({ id, why }) => `${id}: ${why}`).join('\n');
    return (
      <>
        <div className="bulk-zone bulk-who">
          <span className="bulk-n">
            <span className={step.moved.length > 0 ? 'bulk-ok' : 'bulk-warn'}>
              <Icon name={step.moved.length > 0 ? 'done' : 'warn'} />
            </span>
            <b>{receiptOf(step)}</b>
          </span>
          <span className="bulk-s">just now</span>
        </div>
        <div className="bulk-zone bulk-what">
          {first ? (
            <div className="bulk-l1 bulk-fail" title={all}>
              <span className="bulk-warn">
                <Icon name="warn" />
              </span>
              <span className="bulk-pc">
                <b>{first.id}</b> did not move: {first.why}
                {others.length > 0 ? ` · ${others.length} more did not` : ''}
              </span>
            </div>
          ) : (
            <div className="bulk-l1">
              <span className="bulk-pc" title={step.moved.join(', ')}>
                {step.moved.length > 3 ? `${step.moved.length} items` : step.moved.join(' and ')}{' '}
                moved to <b>{step.move.to}</b>.
              </span>
            </div>
          )}
          <p className="bulk-l2">the selection is cleared · this receipt closes in 6 s</p>
        </div>
        <div className="bulk-zone bulk-out">
          <Button variant="quiet" onClick={() => leave({ step: 'choosing' })}>
            dismiss
          </Button>
        </div>
      </>
    );
  };

  if (on) {
    shown.current = state.step;
    drawn.current[state.step] =
      state.step === 'choosing'
        ? choosing()
        : state.step === 'explaining'
          ? explaining(state)
          : state.step === 'posting'
            ? posting(state)
            : landed(state);
  } else if (drawn.current.choosing === undefined) {
    // Drawn before the first tick, unseen, so its zones are there to come in on it.
    drawn.current.choosing = choosing();
  }
  const announce =
    on && state.step === 'landed'
      ? [receiptOf(state), ...state.failed.map(({ id, why }) => `${id} did not move: ${why}`)].join(
          '. ',
        )
      : '';

  const entries: MenuEntry[] =
    menu?.kind === 'more'
      ? placed.more.flatMap((each, index): MenuEntry[] => {
          const item: MenuEntry = {
            kind: 'item',
            key: each.move.to,
            label: label(each.move),
            quiet: each.variant === 'quiet',
            run: () => choose(each.move),
          };
          const first = placed.more.findIndex(({ variant }) => variant === 'quiet');
          return placed.closeAs === 'more' && index === first
            ? [{ kind: 'title', label: 'close as' }, item]
            : [item];
        })
      : plan.narrow.map(({ state: kept, ids }) => ({
          kind: 'item',
          key: kept,
          label: kept,
          count: ids.length,
          run: () => {
            // The first move of what is kept; with none, keep only (several states remain).
            focusNext.current = '[data-move],.bulk-keep,.bulk-clear';
            setMenu(null);
            onKeep(ids);
          },
        }));

  return (
    <>
      {/* Room under the last row, so it scrolls clear of the tray. */}
      <div className="bulk-room" data-on={on || undefined} aria-hidden="true" />
      {host
        ? createPortal(
            <div
              className="bulk-dock"
              data-on={on || undefined}
              inert={!on}
              style={{ right: gutter }}
            >
              <section ref={tray} className="bulk-tray" aria-label="Bulk moves" tabIndex={-1}>
                {LAYERS.map((layer) => (
                  <div
                    key={layer}
                    ref={(element) => {
                      layerEls.current[layer] = element;
                    }}
                    className="bulk-layer"
                    data-cur={shown.current === layer || undefined}
                    inert={shown.current !== layer}
                  >
                    {drawn.current[layer] ?? null}
                  </div>
                ))}
                <p className="visually-hidden" role="status">
                  {announce}
                </p>
              </section>
            </div>,
            host,
          )
        : null}
      {menu && on ? (
        <TrayMenu
          anchor={menu.anchor}
          title={menu.kind === 'more' ? 'More moves' : 'Keep only'}
          entries={
            menu.kind === 'keep' ? [{ kind: 'title', label: 'keep only' }, ...entries] : entries
          }
          onClose={closeMenu}
        />
      ) : null}
    </>
  );
}
