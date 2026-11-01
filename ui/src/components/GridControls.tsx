import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ALWAYS,
  type FilterChoice,
  type Filters,
  filterable,
  filterChoices,
  firstDirection,
  type GridColumn,
  type GridFit,
  type Sort,
  valueLabel,
  type Widths,
} from '../grid.ts';
import { Button, Icon, Severity, type SeverityLevel } from '../kit/index.ts';
import type { Item } from '../types.ts';
import type { ViewMode } from '../view-prefs.ts';

// What the list head offers a collection: its grouping, its filters, the grid's columns and the
// switch between list and grid, then a token per filtered column. One menu is open at a time: a
// column's (sort, group by it, show only some values), the grouping's, the filter's (which column
// to filter) or the columns' (which to show).
export type OpenMenu =
  | { kind: 'column'; key: string; anchor: HTMLElement }
  | { kind: 'group'; anchor: HTMLElement }
  | { kind: 'filter'; anchor: HTMLElement }
  | { kind: 'columns'; anchor: HTMLElement };

const LEVELS = ['low', 'medium', 'high', 'critical'];

function Bars({ value }: { value: string }) {
  const level = LEVELS.indexOf(value) + 1;
  return level > 0 ? <Severity level={level as SeverityLevel} /> : null;
}

export function ViewSwitch({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a pair of toggle buttons, labelled as one control
    <span className="view-switch" role="group" aria-label="View">
      <button
        type="button"
        className="view-switch-b"
        aria-pressed={mode === 'list'}
        aria-label="List view"
        onClick={() => onChange('list')}
      >
        <Icon name="list" />
        <span>List</span>
      </button>
      <button
        type="button"
        className="view-switch-b"
        aria-pressed={mode === 'grid'}
        aria-label="Grid view"
        onClick={() => onChange('grid')}
      >
        <Icon name="grid" />
        <span>Grid</span>
      </button>
    </span>
  );
}

type HeadControlsProps = {
  group: string;
  presetGroup: string;
  menu: OpenMenu | null;
  onMenu: (menu: OpenMenu | null) => void;
  mode: ViewMode | undefined;
  onMode: (mode: ViewMode) => void;
  // Over the grid: how many columns show, and whether they are not the preset's.
  columns: number | undefined;
  columnsSet: boolean;
};

export function HeadControls({
  group,
  presetGroup,
  menu,
  onMenu,
  mode,
  onMode,
  columns,
  columnsSet,
}: HeadControlsProps) {
  const toggle = (kind: 'group' | 'filter' | 'columns') => (anchor: HTMLElement) =>
    onMenu(menu?.kind === kind ? null : { kind, anchor });
  return (
    <span className="list-tools">
      <Button
        variant="quiet"
        size="sm"
        className="list-tool"
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'group'}
        data-set={group !== presetGroup || undefined}
        onClick={(event) => toggle('group')(event.currentTarget)}
      >
        <Icon name="group" />
        <span className="list-tool-label">group</span>
        <b>{group}</b>
      </Button>
      <Button
        variant="quiet"
        size="sm"
        className="list-tool"
        aria-haspopup="menu"
        aria-expanded={menu?.kind === 'filter'}
        onClick={(event) => toggle('filter')(event.currentTarget)}
      >
        <Icon name="filter" />
        <span className="list-tool-label">filter</span>
      </Button>
      {columns !== undefined ? (
        // Words and a count, no icon: the app has none for columns.
        <Button
          variant="quiet"
          size="sm"
          className="list-tool"
          aria-haspopup="menu"
          aria-expanded={menu?.kind === 'columns'}
          data-set={columnsSet || undefined}
          onClick={(event) => toggle('columns')(event.currentTarget)}
        >
          <span>columns</span>
          <b>{columns}</b>
        </Button>
      ) : null}
      {mode ? <ViewSwitch mode={mode} onChange={onMode} /> : null}
    </span>
  );
}

// Each filtered column as one removable token: `category · crash, physics ×`.
export function FilterTokens({
  filters,
  columns,
  onOpen,
  onClear,
  onClearAll,
}: {
  filters: Filters;
  columns: readonly GridColumn[];
  onOpen: (key: string, anchor: HTMLElement) => void;
  onClear: (key: string) => void;
  onClearAll: () => void;
}) {
  const active = columns.filter(({ key }) => (filters[key] ?? []).length > 0);
  if (active.length === 0) return null;
  return (
    <div className="filter-tokens">
      {active.map((column) => {
        const { key, label } = column;
        return (
          <span key={key} className="filter-token">
            <button
              type="button"
              className="filter-token-l"
              aria-haspopup="menu"
              onClick={(event) => onOpen(key, event.currentTarget)}
            >
              <em>{label}</em>
              <b>{(filters[key] ?? []).map((value) => valueLabel(column, value)).join(', ')}</b>
            </button>
            <button
              type="button"
              className="filter-token-x"
              aria-label={`Remove the ${label} filter`}
              onClick={() => onClear(key)}
            >
              <Icon name="close" />
            </button>
          </span>
        );
      })}
      <Button variant="quiet" size="sm" onClick={onClearAll}>
        clear all
      </Button>
    </div>
  );
}

type MenuItem =
  | {
      kind: 'item';
      label: ReactNode;
      note?: string;
      on?: boolean;
      run: () => void;
      quiet?: boolean;
    }
  | { kind: 'check'; choice: FilterChoice; bars: boolean; run: () => void }
  | {
      kind: 'column';
      label: string;
      note: string;
      on: boolean;
      locked: boolean;
      off: boolean;
      run: () => void;
    }
  | { kind: 'radio'; label: string; on: boolean; run: () => void }
  | { kind: 'open'; label: string; note: string; run: () => void }
  | { kind: 'rule' }
  | { kind: 'title'; label: string }
  | { kind: 'note'; label: string };

type MenuProps = {
  menu: OpenMenu;
  // The columns shown, every column offered, and what the room fits of those shown.
  columns: readonly GridColumn[];
  available: readonly GridColumn[];
  fitted: GridFit;
  widths: Widths;
  columnsChanged: boolean;
  onColumns: (keys: readonly string[]) => void;
  onResetColumns: () => void;
  onResetWidths: () => void;
  items: readonly Item[];
  groupings: readonly string[];
  presetGroup: string;
  group: string;
  sort: Sort;
  filters: Filters;
  onSort: (sort: Sort) => void;
  onGroup: (group: string) => void;
  onFilter: (key: string, values: string[]) => void;
  onOpen: (menu: OpenMenu) => void;
  onClose: (focusAnchor: boolean) => void;
};

function columnItems(props: MenuProps, column: GridColumn): MenuItem[] {
  const { sort, filters, items, groupings, group, presetGroup, available } = props;
  const first = firstDirection(column);
  const other = first === 'asc' ? 'desc' : 'asc';
  const word = (dir: 'asc' | 'desc') => (dir === 'asc' ? 'Sort ascending' : 'Sort descending');
  const on = (dir: 'asc' | 'desc') => sort?.key === column.key && sort.dir === dir;
  const list: MenuItem[] = [
    { kind: 'title', label: column.label },
    {
      kind: 'item',
      label: word(first),
      note: first === 'asc' ? '↑' : '↓',
      on: on(first),
      run: () => props.onSort({ key: column.key, dir: first }),
    },
    {
      kind: 'item',
      label: word(other),
      note: other === 'asc' ? '↑' : '↓',
      on: on(other),
      run: () => props.onSort({ key: column.key, dir: other }),
    },
  ];
  if (sort?.key === column.key) {
    list.push({ kind: 'item', label: 'Clear sort', quiet: true, run: () => props.onSort(null) });
  }
  if (groupings.includes(column.key)) {
    const grouped = group === column.key;
    list.push({
      kind: 'item',
      label: grouped ? `Grouped by ${column.label}` : `Group by ${column.label}`,
      on: grouped,
      run: () => props.onGroup(grouped ? presetGroup : column.key),
    });
  }
  if (!filterable(column)) {
    list.push({ kind: 'rule' });
    list.push({ kind: 'note', label: 'This column sorts; fields, state and type filter.' });
    return list;
  }
  const chosen = filters[column.key] ?? [];
  const choices = filterChoices(items, column, filters, available);
  if (choices.length > 0) {
    list.push({ kind: 'rule' }, { kind: 'title', label: 'Show only' });
    for (const choice of choices) {
      list.push({
        kind: 'check',
        choice,
        bars: column.kind === 'severity',
        run: () =>
          props.onFilter(
            column.key,
            choice.on
              ? chosen.filter((value) => value !== choice.value)
              : [...chosen, choice.value],
          ),
      });
    }
  }
  if (chosen.length > 0) {
    list.push({
      kind: 'item',
      label: 'Show all',
      quiet: true,
      run: () => props.onFilter(column.key, []),
    });
  }
  return list;
}

// Every column the collection offers, ticked when shown, in the order the table shows them; a field
// says its kind. Id and title always show. A ticked column the room cannot fit says so.
function columnsItems(props: MenuProps): MenuItem[] {
  const { columns, available, fitted, widths } = props;
  const shown = columns.map(({ key }) => key);
  const list: MenuItem[] = [{ kind: 'title', label: 'Columns' }];
  for (const column of available) {
    const locked = ALWAYS.includes(column.key);
    const on = locked || shown.includes(column.key);
    const off = on && fitted.dropped.includes(column.key);
    const kind = ['enum', 'severity', 'text'].includes(column.kind) ? column.kind : '';
    list.push({
      kind: 'column',
      label: column.label,
      note: locked ? 'always' : off ? 'no room' : kind,
      on,
      locked,
      off,
      run: () => {
        if (locked) return;
        props.onColumns(on ? shown.filter((key) => key !== column.key) : [...shown, column.key]);
      },
    });
  }
  const sized = Object.keys(widths).length > 0;
  if (sized || props.columnsChanged) list.push({ kind: 'rule' });
  if (sized) {
    list.push({ kind: 'item', label: 'Reset widths', quiet: true, run: props.onResetWidths });
  }
  if (props.columnsChanged) {
    list.push({
      kind: 'item',
      label: 'Reset to preset',
      quiet: true,
      run: props.onResetColumns,
    });
  }
  return list;
}

function menuItems(props: MenuProps): MenuItem[] {
  const { menu, columns, available, groupings, group, presetGroup, filters } = props;
  if (menu.kind === 'columns') return columnsItems(props);
  if (menu.kind === 'group') {
    return [
      { kind: 'title', label: 'Group by' },
      ...groupings.map(
        (key): MenuItem => ({
          kind: 'radio',
          label: key === presetGroup ? `${key} · default` : key,
          on: key === group,
          run: () => props.onGroup(key),
        }),
      ),
    ];
  }
  if (menu.kind === 'filter') {
    return [
      { kind: 'title', label: 'Filter by' },
      ...columns.filter(filterable).map(
        (column): MenuItem => ({
          kind: 'open',
          label: column.label,
          note: (filters[column.key] ?? []).length > 0 ? String(filters[column.key]?.length) : '',
          // The column's menu opens where the filter's was, under the filter button.
          run: () => props.onOpen({ kind: 'column', key: column.key, anchor: menu.anchor }),
        }),
      ),
    ];
  }
  // A token's column may be hidden: its menu still opens.
  const column = available.find(({ key }) => key === menu.key);
  return column ? columnItems(props, column) : [];
}

const MENU_W = 248;

// Where the menu opens: under its anchor, its left edge on the anchor's (a column's caret: its right
// edge on the caret's), kept inside the window.
function placeOf(anchor: HTMLElement): { left: number; top: number } {
  const box = anchor.getBoundingClientRect();
  const caret = anchor.classList.contains('gh-menu');
  const left = caret ? box.right - MENU_W + 6 : box.left;
  return {
    left: Math.max(8, Math.min(left, window.innerWidth - MENU_W - 8)),
    top: box.bottom + 6,
  };
}

// The menu: role menu, its items reached with Tab or the arrows, Home and End; Esc closes it and
// gives the focus back to what opened it; a press outside closes it.
export function GridMenu(props: MenuProps) {
  const { menu, onClose } = props;
  const self = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState(() => placeOf(menu.anchor));
  const items = menuItems(props);

  useLayoutEffect(() => {
    setPlace(placeOf(menu.anchor));
  }, [menu.anchor]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus moves in once per menu opened
  useEffect(() => {
    self.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus({ preventScroll: true });
  }, [menu.anchor, menu.kind]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (self.current?.contains(target) || menu.anchor.contains(target)) return;
      onClose(false);
    };
    const away = () => onClose(false);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', away);
    };
  }, [menu.anchor, onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    const all = [...(self.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => {
      event.preventDefault();
      all[(index + all.length) % all.length]?.focus();
    };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(all.length - 1);
  };

  const title = items.find((item) => item.kind === 'title');
  return createPortal(
    <div
      ref={self}
      className="grid-menu"
      role="menu"
      aria-label={title?.kind === 'title' ? title.label : 'Menu'}
      style={{ left: place.left, top: place.top }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => {
        const key = `${item.kind}:${index}`;
        switch (item.kind) {
          case 'title':
            return (
              <div key={key} className="grid-menu-t">
                {item.label}
              </div>
            );
          case 'rule':
            return <div key={key} className="grid-menu-hr" />;
          case 'note':
            return (
              <p key={key} className="grid-menu-note">
                {item.label}
              </p>
            );
          case 'check':
            return (
              <button
                key={key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={item.choice.on}
                className="grid-menu-i grid-menu-v"
                data-zero={item.choice.count === 0 || undefined}
                onClick={item.run}
              >
                <i className="grid-menu-box" aria-hidden="true" />
                {item.bars ? <Bars value={item.choice.value} /> : null}
                <span className="grid-menu-vl" data-none={item.choice.value === '' || undefined}>
                  {item.choice.label}
                </span>
                <span className="grid-menu-n">{item.choice.count}</span>
              </button>
            );
          case 'column':
            return (
              <button
                key={key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={item.on}
                aria-disabled={item.locked || undefined}
                className="grid-menu-i grid-menu-v grid-menu-c"
                data-locked={item.locked || undefined}
                data-off={item.off || undefined}
                onClick={item.run}
              >
                <i className="grid-menu-box" aria-hidden="true" />
                <span className="grid-menu-vl">{item.label}</span>
                <span className="grid-menu-n">{item.note}</span>
              </button>
            );
          case 'radio':
            return (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={item.on}
                className="grid-menu-i grid-menu-r"
                onClick={item.run}
              >
                <i className="grid-menu-dot" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          case 'open':
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                className="grid-menu-i"
                onClick={item.run}
              >
                <span>{item.label}</span>
                <span className="grid-menu-n">{item.note}</span>
              </button>
            );
          default:
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                className="grid-menu-i"
                data-on={item.on || undefined}
                data-quiet={item.quiet || undefined}
                onClick={item.run}
              >
                <span>{item.label}</span>
                {item.note ? <span className="grid-menu-n">{item.note}</span> : null}
              </button>
            );
        }
      })}
    </div>,
    document.body,
  );
}
