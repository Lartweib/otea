import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useApp } from '../../app/context.tsx';
import { workspace } from '../../app/workspace.ts';
import { availableColumns, chosenColumns, filterable, type Sort, type Widths } from '../../grid.ts';
import { t } from '../../i18n/i18n.ts';
import { Button } from '../../kit/Button.tsx';
import { Count } from '../../kit/Count.tsx';
import { Icon } from '../../kit/Icon.tsx';
import { Chevron } from '../../kit/Marks.tsx';
import { redrawLists } from '../../lanes/dom.ts';
import { LaneHead } from '../../lanes/LaneHead.tsx';
import { type LaneBlock, LaneList } from '../../lanes/LaneList.tsx';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import type { Folds } from '../../nesting.ts';
import type { CollectionView, Item } from '../../types.ts';
import type { ViewPrefs } from '../../view-prefs.ts';
import { moveSplit } from '../detail/DetailHost.tsx';
import { universeOf } from '../toca/TocaView.tsx';
import { ColumnMenu, ColumnsMenu, FilterMenu, GroupMenu, ShowOnlyMenu } from './menus.tsx';
import {
  applyFilters,
  type BoardCtx,
  type BoardMode,
  boardEntries,
  defaultGroup,
  filterChoices,
  filterKeys,
  groupOptions,
  isFolded,
  MODES,
  pasosCards,
  pasosColumns,
  stepsStrip,
  valueText,
} from './model.ts';
import { type MorphJob, morph, penFade } from './morph-run.ts';
import { Pasos } from './Pasos.tsx';
import { listaBlocks, type RowCtx, tablaBlocks } from './rows.tsx';
import { relayoutTable, Tabla } from './Tabla.tsx';
import { Tray } from './Tray.tsx';
import { headLabel } from './table.ts';
import { reverseTree, rollSign, runTree, treeRunning } from './tree.ts';
import { useBoardPrefs, useFolds } from './use-board.ts';

// A board (SPEC §10.1): its head and steps strip, the tools (Pasos · Lista · Tabla, Agrupar,
// Filtrar, Columnas, the count, Nuevo ítem), the filter tokens, and the stage where the three views
// morph into each other. Grouping, sort and filters belong to the board: every view honours them.

const KIND = { pasos: 'cards', lista: 'list', tabla: 'table' } as const;

type Menu =
  | { kind: 'group' | 'filter' | 'columns'; anchor: HTMLElement }
  | { kind: 'show' | 'col'; key: string; anchor: HTMLElement };

// A tool that comes and goes with the view: it fades in from the left, and out the same way.
function useToolFade(show: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hidden, setHidden] = useState(!show);
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (first.current) {
      first.current = false;
      return;
    }
    if (!el) return;
    if (show) {
      setHidden(false);
      if (!reduced()) {
        el.animate(
          [
            { opacity: 0, transform: 'translateX(-4px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 240, delay: 200, easing: C.drift, fill: 'backwards' },
        );
      }
    } else if (reduced()) setHidden(true);
    else {
      el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(-4px)' }], {
        duration: 200,
        easing: C.drift,
      }).finished.then(
        () => setHidden(true),
        () => undefined,
      );
    }
  }, [show]);
  return { ref, hidden: show ? false : hidden };
}

export function BoardView({ board }: { board: string }) {
  const app = useApp();
  const collection = app.collectionOf(board);
  if (!collection) return <div className="board" />;
  return <Board board={board} key={board} />;
}

function Board({ board }: { board: string }) {
  const app = useApp();
  const collection = app.collectionOf(board);
  // biome-ignore lint/style/noNonNullAssertion: BoardView renders this only with the collection
  const col = collection!;
  const [prefs0, setPrefs] = useBoardPrefs(col);
  // biome-ignore lint/style/noNonNullAssertion: read for a known collection
  const prefs = prefs0!;
  const [folds, setFolds] = useFolds();
  const [shownFolds, setShownFolds] = useState<Folds>(folds);
  const [ticked, setTicked] = useState<string[]>([]);
  const lastTick = useRef<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [noRoom, setNoRoom] = useState<string[]>([]);
  const [morphing, setMorphing] = useState<{ from: BoardMode; to: BoardMode } | null>(null);
  const job = useRef<MorphJob | null>(null);
  const pending = useRef<{ from: BoardMode; to: BoardMode; w: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const born = useRef(true);
  const [stageW, setStageW] = useState(0);

  const mode: BoardMode = app.phone && prefs.mode === 'tabla' ? 'lista' : prefs.mode;
  const items = useMemo(() => app.all.filter((it) => it.collection === board), [app.all, board]);
  const ctx: BoardCtx = { collection: col, now: app.now, feed: app.feed };
  const universe = useMemo(() => universeOf(app.all, app.now), [app.all, app.now]);
  const available = useMemo(() => availableColumns(col), [col]);
  const columns = useMemo(() => chosenColumns(col, prefs.columns), [col, prefs.columns]);
  const selected = app.route.item;

  // The detail reads what the view lists to size itself.
  useLayoutEffect(() => {
    workspace.set({ listKind: KIND[mode] });
  }, [mode]);

  useLayoutEffect(() => {
    born.current = false;
    const el = stage.current;
    if (!el) return;
    const measure = () => setStageW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- choices ----
  const choose = useCallback((next: Partial<ViewPrefs>) => setPrefs(next), [setPrefs]);
  const setFilter = (key: string, values: string[]) => {
    const filters: Record<string, string[]> = { ...(prefs.filters as Record<string, string[]>) };
    if (values.length) filters[key] = values;
    else delete filters[key];
    choose({ filters });
  };
  const toggleValue = (key: string, value: string) => {
    const now = new Set(prefs.filters[key] ?? []);
    if (now.has(value)) now.delete(value);
    else now.add(value);
    setFilter(key, [...now]);
  };
  const clearFilters = () => choose({ filters: {} });

  // ---- the tree ----
  const listEl = () =>
    [...(stage.current?.querySelectorAll<HTMLElement>('.lanes') ?? [])].find(
      (l) => !l.closest('.mghost'),
    ) ?? null;
  const toggleFold = (id: string) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const wasOpen = !isFolded(it, folds);
    const settled = !!it.children && it.children.total > 0 && it.children.open === 0;
    const flip = (f: Folds): Folds => {
      const key = settled ? 'expanded' : 'collapsed';
      const set = new Set(f[key]);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...f, [key]: set };
    };
    const next = flip(folds);
    const list = listEl();
    if (treeRunning(id)) {
      setFolds(next);
      reverseTree(id);
      requestAnimationFrame(() => rollSign(listEl(), id));
      return;
    }
    if (wasOpen) {
      // Folding: the button turns now; the rows go when the head is back.
      flushSync(() => setFolds(next));
      rollSign(list, id);
      if (list) {
        runTree(list, id, false, () =>
          flushSync(() => setShownFolds((s) => withFold(s, next, id))),
        );
      } else setShownFolds(next);
    } else {
      flushSync(() => {
        setFolds(next);
        setShownFolds((s) => withFold(s, next, id));
      });
      rollSign(list, id);
      if (list)
        runTree(list, id, true, () =>
          flushSync(() => setShownFolds((s) => withFold(s, flip(next), id))),
        );
    }
  };

  // ---- ticks ----
  const onTick = (id: string, shift: boolean) => {
    setTicked((cur) => {
      const has = cur.includes(id);
      if (shift && lastTick.current) {
        const order = [
          ...(stage.current?.querySelectorAll<HTMLElement>(
            '.tabla:not(.mghost) .trow:not(.ghost)',
          ) ?? []),
        ].map((r) => r.dataset.k ?? '');
        const a = order.indexOf(lastTick.current);
        const b = order.indexOf(id);
        if (a >= 0 && b >= 0) {
          const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
          lastTick.current = id;
          return [...cur, ...range.filter((k) => !cur.includes(k))];
        }
      }
      lastTick.current = id;
      return has ? cur.filter((k) => k !== id) : [...cur, id];
    });
  };

  // ---- the model ----
  const { entries, shown, total } = boardEntries(items, prefs, shownFolds, ctx);
  const filtered = applyFilters(items, prefs.filters, ctx);
  const rowCtx: RowCtx = {
    collection: col,
    now: app.now,
    feed: app.feed,
    selected,
    ticked: new Set(ticked),
    open: (id) => {
      const it = items.find((x) => x.id === id);
      return it ? !isFolded(it, folds) : true;
    },
    onFold: toggleFold,
    onTick,
  };
  const empty: LaneBlock[] | null = !items.length
    ? [
        {
          kind: 'empty',
          key: 'empty:all',
          big: true,
          content: (
            <>
              <p>{t('boardView.empty', { board })}</p>
              <div className="acts2">
                <Button variant="primary" onClick={() => app.newItem({ board })}>
                  {t('boardView.newIn', { board })}
                </Button>
                <Button variant="quiet" onClick={() => app.openConnect()}>
                  {t('boardView.connect')}
                </Button>
              </div>
            </>
          ),
        },
      ]
    : !shown
      ? [
          {
            kind: 'empty',
            key: 'empty:nomatch',
            content: (
              <>
                {t('boardView.noMatch')}{' '}
                <Button variant="text" onClick={clearFilters}>
                  {t('boardView.clearFilters')}
                </Button>
              </>
            ),
          },
        ]
      : null;
  const visibleRows = entries
    .filter((e) => e.kind === 'row' && !e.hidden)
    .map((e) => (e.kind === 'row' ? e.item.id : ''));
  const tickedShown = visibleRows.filter((id) => ticked.includes(id));
  const ticks = {
    all: tickedShown.length > 0 && tickedShown.length === visibleRows.length,
    some: tickedShown.length > 0,
    toggleAll: () =>
      setTicked((cur) =>
        visibleRows.every((id) => cur.includes(id))
          ? cur.filter((id) => !visibleRows.includes(id))
          : [...cur, ...visibleRows.filter((id) => !cur.includes(id))],
      ),
  };
  const tickedItems = ticked
    .map((id) => items.find((it) => it.id === id))
    .filter((it): it is Item => !!it);

  const open = (id: string) => (app.route.item === id ? app.closeItem() : app.openItem(id));

  // ---- the views and the morph ----
  const setMode = (m: BoardMode) => choose({ mode: m });
  const switchMode = (next: BoardMode) => {
    const j = job.current;
    if (j && !j.done) {
      if ((next === j.from && j.target === 1) || (next === j.to && j.target === 0)) {
        j.reverse();
        setMode(next);
        return;
      }
      j.finishNow();
    }
    const cur = mode;
    if (cur === next) return;
    setMenu(null);
    if (cur === 'tabla') setTicked([]);
    const was = stage.current?.querySelector<HTMLElement>(`:scope > [data-mode="${cur}"]`);
    pending.current = { from: cur, to: next, w: was?.offsetWidth ?? 0 };
    setMorphing({ from: cur, to: next });
    setMode(next);
    if (selected) moveSplit();
  };
  useLayoutEffect(() => {
    const p = pending.current;
    const el = stage.current;
    if (!p || !el) return;
    pending.current = null;
    const A = el.querySelector<HTMLElement>(`:scope > [data-mode="${p.from}"]`);
    const B = el.querySelector<HTMLElement>(`:scope > [data-mode="${p.to}"]`);
    if (!A || !B) {
      setMorphing(null);
      return;
    }
    if (selected) penFade(false);
    job.current = morph(el, A, B, p.from, p.to, onDone(p.from), p.w || undefined);
  });
  // The morph ended on one side: the other goes, and the mode is that side's.
  const onDone = (from: BoardMode) => (side: 0 | 1) => {
    flushSync(() => {
      setMorphing(null);
      if (side === 0) setMode(from);
    });
    if (viewRef.current) redrawLists(viewRef.current);
    if (selected) {
      penFade(true);
      moveSplit();
    }
  };

  const modeEl = (m: BoardMode, ghost: boolean): ReactNode => {
    const drawIn = born.current;
    if (m === 'pasos') {
      const cols = pasosColumns(col, items);
      return (
        <Pasos
          key="pasos"
          ghost={ghost}
          collection={col}
          columns={cols}
          cards={pasosCards(filtered, cols, prefs.sort, ctx)}
          now={app.now}
          feed={app.feed}
          selected={selected}
          onOpen={open}
          reveal={drawIn}
        />
      );
    }
    if (m === 'lista') {
      return (
        <div key="lista" className={ghost ? 'lista mghost' : 'lista'} data-mode="lista">
          <LaneHead />
          <LaneList
            list="board"
            blocks={empty ?? listaBlocks(entries, rowCtx)}
            universe={universe}
            drawInOnMount={drawIn}
            onRow={open}
          />
        </div>
      );
    }
    const menuKey = menu?.kind === 'col' ? menu.key : null;
    return (
      <Tabla
        key="tabla"
        ghost={ghost}
        board={board}
        columns={columns}
        available={available}
        widths={prefs.widths}
        sort={prefs.sort}
        filtered={new Set(Object.keys(prefs.filters).filter((k) => prefs.filters[k]?.length))}
        room={stageW}
        blocks={empty ?? tablaBlocks(entries, columns, rowCtx)}
        universe={universe}
        drawIn={drawIn}
        ticks={ticks}
        onRow={open}
        onSort={(sort: Sort) => choose({ sort })}
        onMenu={(key, anchor) => setMenu({ kind: 'col', key, anchor })}
        menuKey={menuKey}
        onWidths={(widths: Widths, flip) => {
          const tbl = stage.current?.querySelector<HTMLElement>('.tabla:not(.mghost)') ?? null;
          if (flip) relayoutTable(tbl, () => flushSync(() => choose({ widths })));
          else choose({ widths });
        }}
        onNoRoom={setNoRoom}
      >
        {ghost ? null : (
          <Tray
            items={tickedItems}
            collection={col}
            onUntick={(id) => setTicked((cur) => cur.filter((k) => k !== id))}
            onKeep={(ids) => setTicked(ids)}
            onClear={() => setTicked([])}
          />
        )}
      </Tabla>
    );
  };
  const modes: BoardMode[] = morphing ? [morphing.from, morphing.to] : [mode];

  return (
    <div className="board" ref={viewRef}>
      <Head board={board} items={items} />
      <Tools
        col={col}
        mode={mode}
        phone={app.phone}
        prefs={prefs}
        shown={shown}
        total={total}
        columnsShown={columns.length}
        onMode={switchMode}
        menu={menu}
        setMenu={setMenu}
        onNew={() => app.newItem({ board })}
      />
      <Tokens prefs={prefs} ctx={ctx} onRemove={(k) => setFilter(k, [])} onClear={clearFilters} />
      <div className="stage" ref={stage}>
        {mode === 'pasos' && !morphing && items.length > 0 && !shown ? (
          <p className="nomatch">
            {t('boardView.noMatch')}
            <button type="button" onClick={clearFilters}>
              {t('boardView.clearFilters')}
            </button>
          </p>
        ) : null}
        {modes.map((m) => modeEl(m, !!morphing && m === morphing.from))}
      </div>
      <BoardMenus
        menu={menu}
        setMenu={setMenu}
        items={items}
        prefs={prefs}
        ctx={ctx}
        columns={columns}
        available={available}
        noRoom={noRoom}
        choose={choose}
        toggleValue={toggleValue}
        setFilter={setFilter}
        onColumns={(cols, flip) => {
          const tbl = stage.current?.querySelector<HTMLElement>('.tabla:not(.mghost)') ?? null;
          if (flip) relayoutTable(tbl, () => flushSync(() => choose(cols)));
          else choose(cols);
        }}
      />
    </div>
  );
}

// The folds a parent's rows follow: the target's state for this parent only.
function withFold(shown: Folds, target: Folds, id: string): Folds {
  const pick = (k: 'collapsed' | 'expanded') => {
    const s = new Set(shown[k]);
    if (target[k].has(id)) s.add(id);
    else s.delete(id);
    return s;
  };
  return { collapsed: pick('collapsed'), expanded: pick('expanded') };
}

// ---- the head ----

function Head({ board, items }: { board: string; items: readonly Item[] }) {
  const app = useApp();
  // biome-ignore lint/style/noNonNullAssertion: Board renders with its collection
  const col = app.collectionOf(board)!;
  const steps = stepsStrip(col, items);
  const dekKey = `boardView.dek.${col.preset}`;
  const dek = (t as (k: string) => string)(dekKey);
  return (
    <header className="bhead" data-enter="head">
      <div>
        <div className="kicker" data-leaf="">
          <b>{t('boardView.kicker')}</b> &nbsp;·&nbsp; {app.project?.name ?? ''}
        </div>
        <h1 className="display" data-leaf="">
          {board}
        </h1>
        {dek && dek !== dekKey ? (
          <p className="dek" data-leaf="">
            {dek}
          </p>
        ) : null}
      </div>
      <div className="steps" data-leaf="">
        {steps.map((s, i) => (
          <StepWord key={s.key} first={i === 0} you={s.you} label={s.label} count={s.count} />
        ))}
      </div>
    </header>
  );
}

function StepWord(p: { first: boolean; you: boolean; label: string; count: number }) {
  return (
    <>
      {p.first ? null : <i />}
      <span className={p.you ? 'you' : undefined}>
        {p.label} <Count value={p.count} hold className="sn" />
      </span>
    </>
  );
}

// ---- the tools ----

function Tools({
  col,
  mode,
  phone,
  prefs,
  shown,
  total,
  columnsShown,
  onMode,
  menu,
  setMenu,
  onNew,
}: {
  col: CollectionView;
  mode: BoardMode;
  phone: boolean;
  prefs: ViewPrefs;
  shown: number;
  total: number;
  columnsShown: number;
  onMode: (m: BoardMode) => void;
  menu: Menu | null;
  setMenu: (m: Menu | null) => void;
  onNew: () => void;
}) {
  const sw = useRef<HTMLDivElement>(null);
  const uline = useRef<HTMLElement>(null);
  const placed = useRef(false);
  // The underline slides to the view on (translateX + scaleX, 420 settle).
  useLayoutEffect(() => {
    const on = sw.current?.querySelector<HTMLElement>('button.on');
    const u = uline.current;
    if (!on || !u) return;
    const to = `translateX(${on.offsetLeft}px) scaleX(${on.offsetWidth})`;
    const from = getComputedStyle(u).transform;
    for (const a of u.getAnimations()) a.cancel();
    u.style.transform = to;
    if (placed.current && from && from !== 'none' && !reduced()) {
      u.animate([{ transform: from }, { transform: to }], { duration: 420, easing: C.settle });
    }
    placed.current = true;
  });
  const group = useToolFade(mode !== 'pasos');
  const columns = useToolFade(mode === 'tabla');
  const nFilters = Object.values(prefs.filters).filter((v) => v.length).length;
  const options = groupOptions(col);
  const groupName = options.find((o) => o.key === prefs.group)?.label ?? '';
  const sortCol = prefs.sort
    ? availableColumns(col).find((c) => c.key === prefs.sort?.key)
    : undefined;
  const toggle = (kind: 'group' | 'filter' | 'columns', anchor: HTMLElement) =>
    setMenu(menu?.kind === kind ? null : { kind, anchor });
  const modes = phone ? MODES.filter((m) => m !== 'tabla') : MODES;
  return (
    <div className="tools" data-enter="fade" data-leaf="">
      <div className="switch" role="tablist" aria-label={t('boardView.modes')} ref={sw}>
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? 'on' : undefined}
            onClick={() => onMode(m)}
          >
            <Icon name={m} />
            <span className="wl">{t(`boardView.mode.${m}`)}</span>
          </button>
        ))}
        <i className="uline" ref={uline} />
      </div>
      <span className="spacer" />
      <button
        ref={group.ref}
        type="button"
        className="tool"
        hidden={group.hidden}
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'group'}
        onClick={(e) => toggle('group', e.currentTarget)}
      >
        <Icon name="group" />
        <span className="wl">{t('boardView.tools.group')}</span> <b>{groupName}</b>
        <Chevron />
      </button>
      <button
        type="button"
        className="tool"
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'filter' || menu?.kind === 'show'}
        onClick={(e) => toggle('filter', e.currentTarget)}
      >
        <Icon name="filter" />
        <span className="wl">{t('boardView.tools.filter')}</span>
        {nFilters ? <b className="fcount">{nFilters}</b> : null}
        <Chevron />
      </button>
      <button
        ref={columns.ref}
        type="button"
        className="tool"
        hidden={columns.hidden}
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'columns'}
        onClick={(e) => toggle('columns', e.currentTarget)}
      >
        <Icon name="tabla" />
        <span className="wl">{t('boardView.tools.columns')}</span>{' '}
        <b className="ccount">{columnsShown}</b>
        <Chevron />
      </button>
      <span className="count">
        {shown === total
          ? t('boardView.count', { count: total })
          : t('boardView.countOf', { shown, total })}
        {prefs.sort && sortCol ? (
          <span className="sorted">
            {t('boardView.sortedBy', {
              column: sortCol.label.toLowerCase(),
              arrow: prefs.sort.dir === 'asc' ? '↑' : '↓',
            })}
          </span>
        ) : null}
      </span>
      <button type="button" className="tool newb" onClick={onNew}>
        <Icon name="plus" />
        <span className="wl">{t('boardView.tools.newItem')}</span>
      </button>
    </div>
  );
}

// ---- filter tokens ----

function Tokens({
  prefs,
  ctx,
  onRemove,
  onClear,
}: {
  prefs: ViewPrefs;
  ctx: BoardCtx;
  onRemove: (key: string) => void;
  onClear: () => void;
}) {
  const names = new Map(filterKeys(ctx.collection).map((k) => [k.key, k.label]));
  const toks = Object.entries(prefs.filters).filter(([, v]) => v.length);
  return (
    <div className="ftoks" data-enter="fade" data-leaf="">
      {toks.map(([k, v]) => {
        const name = (names.get(k) ?? k).replace(/^./, (c) => c.toUpperCase());
        return (
          <span key={k} className="ftok">
            <span className="k">{name}</span>
            {v.map((x) => valueText(k, x, ctx)).join(', ')}
            <button
              type="button"
              aria-label={t('boardView.removeFilter', { what: name })}
              onClick={() => onRemove(k)}
            >
              <Icon name="x" />
            </button>
          </span>
        );
      })}
      {toks.length > 1 ? (
        <button type="button" className="clr" onClick={onClear}>
          {t('boardView.clearAll')}
        </button>
      ) : null}
    </div>
  );
}

// ---- the menus ----

function BoardMenus({
  menu,
  setMenu,
  items,
  prefs,
  ctx,
  columns,
  available,
  noRoom,
  choose,
  toggleValue,
  setFilter,
  onColumns,
}: {
  menu: Menu | null;
  setMenu: (m: Menu | null) => void;
  items: readonly Item[];
  prefs: ViewPrefs;
  ctx: BoardCtx;
  columns: ReturnType<typeof chosenColumns>;
  available: ReturnType<typeof availableColumns>;
  noRoom: readonly string[];
  choose: (p: Partial<ViewPrefs>) => void;
  toggleValue: (key: string, value: string) => void;
  setFilter: (key: string, values: string[]) => void;
  onColumns: (p: Partial<ViewPrefs>, flip: boolean) => void;
}) {
  const close = () => setMenu(null);
  const anchor = menu?.anchor ?? null;
  const keys = filterKeys(ctx.collection);
  const showKey = menu?.kind === 'show' ? menu.key : null;
  const colKey = menu?.kind === 'col' ? menu.key : null;
  const colColumn = colKey ? available.find((c) => c.key === colKey) : undefined;
  const colLabel = colColumn ? headLabel(colColumn) : '';
  const groups = groupOptions(ctx.collection);
  return (
    <>
      <GroupMenu
        open={menu?.kind === 'group'}
        anchor={anchor}
        onClose={close}
        options={groups}
        current={prefs.group}
        preset={defaultGroup(ctx.collection)}
        onPick={(group) => choose({ group })}
      />
      <FilterMenu
        open={menu?.kind === 'filter'}
        anchor={anchor}
        onClose={close}
        keys={keys.map((k) => ({
          ...k,
          chosen: (prefs.filters[k.key] ?? []).map((v) => valueText(k.key, v, ctx)).join(', '),
        }))}
        onPick={(key) => {
          if (anchor) setTimeout(() => setMenu({ kind: 'show', key, anchor }), 0);
        }}
      />
      <ShowOnlyMenu
        open={menu?.kind === 'show'}
        anchor={anchor}
        onClose={close}
        what={keys.find((k) => k.key === showKey)?.label ?? ''}
        choices={showKey ? filterChoices(items, showKey, prefs.filters, ctx) : []}
        onToggle={(v) => showKey && toggleValue(showKey, v)}
        onAll={() => showKey && setFilter(showKey, [])}
      />
      <ColumnMenu
        open={menu?.kind === 'col'}
        anchor={anchor}
        onClose={close}
        label={colLabel}
        dir={prefs.sort && prefs.sort.key === colKey ? prefs.sort.dir : null}
        grouped={prefs.group === colKey}
        canGroup={!!colKey && groups.some((g) => g.key === colKey)}
        choices={
          colKey && colColumn && filterable(colColumn)
            ? filterChoices(items, colKey, prefs.filters, ctx)
            : []
        }
        onSort={(dir) => colKey && choose({ sort: dir ? { key: colKey, dir } : null })}
        onGroup={() => colKey && choose({ group: colKey })}
        onToggle={(v) => colKey && toggleValue(colKey, v)}
      />
      <ColumnsMenu
        open={menu?.kind === 'columns'}
        anchor={anchor}
        onClose={close}
        columns={available.map((c) => ({
          key: c.key,
          label: headLabel(c),
          on: columns.some((x) => x.key === c.key),
          always: c.key === 'id' || c.key === 'title',
          noRoom: noRoom.includes(c.key),
        }))}
        onToggle={(key) => {
          const on = columns.some((c) => c.key === key);
          const keys2 = on
            ? columns.filter((c) => c.key !== key).map((c) => c.key)
            : available
                .filter((c) => c.key === key || columns.some((x) => x.key === c.key))
                .map((c) => c.key);
          onColumns({ columns: keys2 }, true);
        }}
        onResetWidths={() => onColumns({ widths: {} }, true)}
        onResetColumns={() => onColumns({ columns: ctx.collection.view.columns, widths: {} }, true)}
      />
    </>
  );
}
