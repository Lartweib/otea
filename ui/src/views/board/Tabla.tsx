import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  filterable,
  type GridColumn,
  nextSort,
  type Sort,
  type Widths,
  widthLimits,
} from '../../grid.ts';
import { t } from '../../i18n/i18n.ts';
import { Checkbox, Chevron } from '../../kit/Marks.tsx';
import { redrawLists } from '../../lanes/dom.ts';
import type { Universe } from '../../lanes/handoff.ts';
import { LaneHead } from '../../lanes/LaneHead.tsx';
import { type LaneBlock, LaneList } from '../../lanes/LaneList.tsx';
import { flipLeaves } from '../../motion/flip.ts';
import {
  cellClass,
  headLabel,
  resizedWidth,
  type TableLayout,
  tableLayout,
  widthChip,
} from './table.ts';

// Tabla (SPEC §10.1, mock:427-476, 1640-1710, 4174-4204): today's grid on the lanes, in the mock's
// look. A sticky head with the lane names and the tick-all box; each head sorts on a click and opens
// its menu from a caret; the edge facing the title resizes (a width chip says how wide, a double
// click goes back to automatic); the room drops fields from the last; 40 px rows.

type TablaProps = {
  board: string;
  columns: readonly GridColumn[];
  available: readonly GridColumn[];
  widths: Widths;
  sort: Sort;
  filtered: ReadonlySet<string>;
  // The stage's width, for the first layout (before the table measures itself).
  room: number;
  blocks: LaneBlock[];
  universe: Universe;
  drawIn: boolean;
  ticks: { all: boolean; some: boolean; toggleAll: () => void };
  onRow: (id: string) => void;
  onSort: (sort: Sort) => void;
  onMenu: (key: string, anchor: HTMLElement) => void;
  menuKey: string | null;
  onWidths: (widths: Widths, flip: boolean) => void;
  // Reports the keys the room could not hold (Columnas says "sin espacio").
  onNoRoom: (keys: string[]) => void;
  // The side a morph leaves.
  ghost?: boolean;
  children?: ReactNode;
};

// Every column the tiers can drop, hidden by class while it is.
const hideCss = (available: readonly GridColumn[]) =>
  available
    .map(({ key }) => `.tabla[data-hide~="${cellClass(key)}"] .${cellClass(key)}{display:none}`)
    .join('');

export function relayoutTable(tbl: HTMLElement | null, mutate: () => void) {
  if (!tbl) {
    mutate();
    return;
  }
  const els = [...tbl.querySelectorAll<HTMLElement>('.trow:not(.ghost) .c, .thead .th')];
  flipLeaves(
    els,
    () => {
      mutate();
      redrawLists(tbl);
    },
    { T: 480, inDelay: 200, noScale: true },
  );
}

export function Tabla(p: TablaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(p.room);
  const layout = tableLayout(p.columns, room || p.room, p.widths);
  const live = useRef<TableLayout>(layout);
  live.current = layout;

  // The table measures itself; until then it lays out at the stage's width.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setRoom(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hiddenKey = layout.hidden.join(' ');
  // biome-ignore lint/correctness/useExhaustiveDependencies: by the keys, not the array
  useLayoutEffect(() => p.onNoRoom(layout.hidden), [hiddenKey]);

  const startResize = (column: GridColumn, e: PointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const rz = e.currentTarget;
    rz.setPointerCapture(e.pointerId);
    rz.classList.add('on');
    const base = live.current;
    const w0 = base.widths[column.key] ?? 0;
    const limits = widthLimits(column, w0, base.title);
    const x0 = e.clientX;
    const lost0 = base.hidden.length;
    let widths: Record<string, number> = { ...p.widths };
    const chip = document.createElement('div');
    chip.className = 'wchip';
    document.body.appendChild(chip);
    const label = headLabel(column);
    const mv = (ev: globalThis.PointerEvent) => {
      const w = resizedWidth(column, w0, ev.clientX - x0, limits);
      const next = { ...widths, [column.key]: w };
      const l = tableLayout(p.columns, el.clientWidth, next, base.air);
      if (l.hidden.length <= lost0) {
        widths = next;
        el.style.setProperty('--cols', l.tracks);
        el.classList.toggle('sevbars', l.sevbars);
        redrawLists(el);
      }
      chip.textContent = widthChip(label, widths[column.key] ?? w, limits);
      chip.style.left = `${ev.clientX + 12}px`;
      chip.style.top = `${ev.clientY - 28}px`;
    };
    const up = () => {
      rz.classList.remove('on');
      chip.remove();
      rz.removeEventListener('pointermove', mv);
      rz.removeEventListener('pointerup', up);
      rz.removeEventListener('pointercancel', up);
      p.onWidths(widths, false);
    };
    rz.addEventListener('pointermove', mv);
    rz.addEventListener('pointerup', up);
    rz.addEventListener('pointercancel', up);
    mv(e.nativeEvent);
  };
  const resetWidth = (column: GridColumn) => {
    const { [column.key]: _gone, ...rest } = p.widths;
    p.onWidths(rest, true);
  };

  const titleAt = p.columns.findIndex((c) => c.kind === 'title');
  const style = {
    '--cols': layout.tracks,
    '--gap': `${layout.air}px`,
  } as CSSProperties;
  return (
    <div
      ref={ref}
      className={['tabla', layout.sevbars ? 'sevbars' : '', p.ghost ? 'mghost' : '']
        .filter(Boolean)
        .join(' ')}
      data-mode="tabla"
      data-b={p.board}
      data-hide={layout.hidden.map(cellClass).join(' ')}
      style={style}
    >
      <style>{hideCss(p.available)}</style>
      <div className="thead" data-enter="fade">
        <LaneHead />
        <span className="th" data-leaf="">
          <Checkbox
            checked={p.ticks.all}
            indeterminate={p.ticks.some && !p.ticks.all}
            aria-label={t('grid.selectAll')}
            onChange={p.ticks.toggleAll}
          />
        </span>
        {p.columns.map((c, i) => {
          const after = i > titleAt && titleAt >= 0;
          const sorted = p.sort?.key === c.key ? p.sort.dir : null;
          const label = headLabel(c);
          const cls = [
            'th',
            cellClass(c.key),
            c.kind === 'age' ? 'r' : '',
            after ? 'after' : '',
            p.filtered.has(c.key) ? 'filtered' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const canResize = after && !['who', 'age'].includes(c.kind);
          return (
            <span
              key={c.key}
              className={cls}
              data-leaf=""
              style={after ? { paddingLeft: 'var(--gap)' } : undefined}
            >
              {canResize ? (
                <Edge
                  label={label}
                  width={layout.widths[c.key] ?? 0}
                  onDown={(e) => startResize(c, e)}
                  onReset={() => resetWidth(c)}
                />
              ) : null}
              <button
                type="button"
                className="lab"
                aria-label={t('boardView.col.sortBy', { column: label })}
                onClick={() => p.onSort(nextSort(p.sort, c))}
              >
                {label}
                {sorted ? <span className="ar">{sorted === 'asc' ? '↑' : '↓'}</span> : null}
              </button>
              {filterable(c) ? (
                <button
                  type="button"
                  className="car"
                  aria-haspopup="menu"
                  aria-expanded={p.menuKey === c.key}
                  aria-label={t('boardView.col.menu', { column: label })}
                  onClick={(e) => p.onMenu(c.key, e.currentTarget)}
                >
                  <Chevron />
                </button>
              ) : null}
            </span>
          );
        })}
      </div>
      <LaneList
        list="table"
        blocks={p.blocks}
        universe={p.universe}
        drawInOnMount={p.drawIn}
        onRow={p.onRow}
      />
      {p.children}
    </div>
  );
}

// The edge of a column that faces the title: it resizes it.
function Edge(p: {
  label: string;
  width: number;
  onDown: (e: PointerEvent<HTMLSpanElement>) => void;
  onReset: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a column's edge, a separator as the divider is
    <span
      className="rz"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('boardView.col.width', { column: p.label })}
      aria-valuenow={p.width}
      tabIndex={0}
      style={{ left: 'calc(var(--gap) - 12px)' }}
      onPointerDown={p.onDown}
      onDoubleClick={p.onReset}
    />
  );
}
