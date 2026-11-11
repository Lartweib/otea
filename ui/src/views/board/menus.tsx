import { t } from '../../i18n/i18n.ts';
import { anchorBelow } from '../../kit/pop/anchors.ts';
import { MenuItem, MenuLabel, MenuRule } from '../../kit/pop/Menu.tsx';
import { Pop } from '../../kit/pop/Pop.tsx';
import type { Choice, GroupOption } from './model.ts';

// The board's menus (mock:3325-3360): Agrupar, Filtrar and its Mostrar solo, a column's caret
// menu, and Columnas. Each is a Pop from its trigger; picks run through the board, whose lists
// carry their rows to their new places.

type Base = { open: boolean; anchor: HTMLElement | null; onClose: () => void };

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

export function GroupMenu({
  open,
  anchor,
  onClose,
  options,
  current,
  preset,
  onPick,
}: Base & {
  options: readonly GroupOption[];
  current: string;
  preset: string;
  onPick: (key: string) => void;
}) {
  return (
    <Pop
      open={open}
      anchor={anchor}
      edge="top"
      place={anchor ? anchorBelow(anchor, true) : 'below-right'}
      role="menu"
      label={t('boardView.groupBy')}
      onClose={onClose}
    >
      <MenuLabel>{t('boardView.groupBy')}</MenuLabel>
      {options.map((o) => (
        <MenuItem
          key={o.key}
          on={o.key === current}
          role="menuitemradio"
          aria-checked={o.key === current}
          small={o.key === preset ? t('boardView.default') : ''}
          onPick={() => onPick(o.key)}
        >
          {cap(o.label)}
        </MenuItem>
      ))}
    </Pop>
  );
}

export function FilterMenu({
  open,
  anchor,
  onClose,
  keys,
  onPick,
}: Base & {
  keys: readonly (GroupOption & { chosen: string })[];
  onPick: (key: string) => void;
}) {
  return (
    <Pop
      open={open}
      anchor={anchor}
      edge="top"
      place={anchor ? anchorBelow(anchor, true) : 'below-right'}
      role="menu"
      label={t('boardView.filterBy')}
      onClose={onClose}
    >
      <MenuLabel>{t('boardView.filterBy')}</MenuLabel>
      {keys.map((k) => (
        <MenuItem
          key={k.key}
          small={k.chosen || t('boardView.everything')}
          onPick={() => onPick(k.key)}
        >
          {cap(k.label)}
        </MenuItem>
      ))}
    </Pop>
  );
}

function Choices({
  choices,
  onToggle,
}: {
  choices: readonly Choice[];
  onToggle: (value: string) => void;
}) {
  return (
    <>
      {choices.map((c) => (
        <MenuItem key={c.value} check on={c.on} small={c.count} onClick={() => onToggle(c.value)}>
          {c.label}
        </MenuItem>
      ))}
    </>
  );
}

export function ShowOnlyMenu({
  open,
  anchor,
  onClose,
  what,
  choices,
  onToggle,
  onAll,
}: Base & {
  what: string;
  choices: readonly Choice[];
  onToggle: (value: string) => void;
  onAll: () => void;
}) {
  return (
    <Pop
      open={open}
      anchor={anchor}
      edge="top"
      place={anchor ? anchorBelow(anchor, true) : 'below-right'}
      role="menu"
      label={t('boardView.showOnly')}
      onClose={onClose}
    >
      <MenuLabel>{t('boardView.showOnlyOf', { what: what.toLowerCase() })}</MenuLabel>
      <Choices choices={choices} onToggle={onToggle} />
      <MenuRule />
      <MenuItem onPick={onAll}>{t('boardView.showAll')}</MenuItem>
    </Pop>
  );
}

export function ColumnMenu({
  open,
  anchor,
  onClose,
  label,
  dir,
  grouped,
  canGroup,
  choices,
  onSort,
  onGroup,
  onToggle,
}: Base & {
  label: string;
  dir: 'asc' | 'desc' | null;
  grouped: boolean;
  canGroup: boolean;
  choices: readonly Choice[];
  onSort: (dir: 'asc' | 'desc' | null) => void;
  onGroup: () => void;
  onToggle: (value: string) => void;
}) {
  return (
    <Pop
      open={open}
      anchor={anchor}
      edge="top"
      place={anchor ? anchorBelow(anchor, false) : 'below-left'}
      role="menu"
      label={label}
      onClose={onClose}
    >
      <MenuLabel>{label}</MenuLabel>
      <MenuItem on={dir === 'asc'} small="↑" onPick={() => onSort('asc')}>
        {t('boardView.col.asc')}
      </MenuItem>
      <MenuItem on={dir === 'desc'} small="↓" onPick={() => onSort('desc')}>
        {t('boardView.col.desc')}
      </MenuItem>
      {dir ? <MenuItem onPick={() => onSort(null)}>{t('boardView.col.clear')}</MenuItem> : null}
      {canGroup ? (
        <MenuItem on={grouped} onPick={onGroup}>
          {t(grouped ? 'boardView.col.groupedBy' : 'boardView.col.groupBy', { column: label })}
        </MenuItem>
      ) : null}
      {choices.length ? (
        <>
          <MenuRule />
          <MenuLabel>{t('boardView.showOnly')}</MenuLabel>
          <Choices choices={choices} onToggle={onToggle} />
        </>
      ) : null}
    </Pop>
  );
}

export type ColumnChoice = {
  key: string;
  label: string;
  on: boolean;
  always: boolean;
  noRoom: boolean;
};

export function ColumnsMenu({
  open,
  anchor,
  onClose,
  columns,
  onToggle,
  onResetWidths,
  onResetColumns,
}: Base & {
  columns: readonly ColumnChoice[];
  onToggle: (key: string) => void;
  onResetWidths: () => void;
  onResetColumns: () => void;
}) {
  return (
    <Pop
      open={open}
      anchor={anchor}
      edge="top"
      place={anchor ? anchorBelow(anchor, true) : 'below-right'}
      role="menu"
      label={t('boardView.columns')}
      onClose={onClose}
    >
      <MenuLabel>{t('boardView.columns')}</MenuLabel>
      {columns.map((c) => (
        <MenuItem
          key={c.key}
          check
          on={c.on}
          disabled={c.always}
          small={c.always ? t('boardView.always') : c.on && c.noRoom ? t('boardView.noRoom') : ''}
          {...(c.always ? {} : { onClick: () => onToggle(c.key) })}
        >
          {cap(c.label)}
        </MenuItem>
      ))}
      <MenuRule />
      <MenuItem onPick={onResetWidths}>{t('boardView.resetWidths')}</MenuItem>
      <MenuItem onPick={onResetColumns}>{t('boardView.resetColumns')}</MenuItem>
    </Pop>
  );
}
