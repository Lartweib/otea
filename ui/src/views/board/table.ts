import { fitColumns, type GridColumn, gridTemplate, type Widths } from '../../grid.ts';
import { t } from '../../i18n/i18n.ts';

// Tabla's layout (SPEC §10.1, mock:1640-1692): today's grid.ts decides what the room holds and how
// wide each column is; this turns it into the mock's tracks (the select box, then each column, the
// air before every column after the title) and what goes hidden.

export type TableLayout = {
  tracks: string;
  // Keys shown, and the chosen ones the room could not hold.
  shown: string[];
  hidden: string[];
  air: number;
  title: number;
  // Severity is narrow enough to show its bars alone.
  sevbars: boolean;
  // Each shown column's width (the title's is what is left).
  widths: Record<string, number>;
};

export function tableLayout(
  columns: readonly GridColumn[],
  room: number,
  widths: Widths,
  heldAir?: number,
): TableLayout {
  const fit = fitColumns(columns, room, widths);
  const tpl = gridTemplate(fit.shown, room, heldAir);
  return {
    tracks: tpl.tracks,
    shown: fit.shown.map(({ column }) => column.key),
    hidden: fit.dropped,
    air: tpl.air,
    title: tpl.title,
    sevbars: fit.shown.some(({ column, compact }) => column.kind === 'severity' && compact),
    widths: Object.fromEntries(fit.shown.map(({ column, width }) => [column.key, width])),
  };
}

const BUILT_IN = {
  title: 'boardView.col.title',
  state: 'boardView.col.state',
  who: 'boardView.col.who',
  age: 'boardView.col.age',
} as const;

// A column's head: the built-ins as the mock names them, the rest in lower case.
export function headLabel(column: GridColumn): string {
  const key = BUILT_IN[column.kind as keyof typeof BUILT_IN];
  if (key) return t(key);
  return column.label.replace(/^./, (c) => c.toLowerCase());
}

// The class a column's head and cells share (the tiers hide by it).
export function cellClass(key: string): string {
  return `c-${key.replace(/[^\w-]/g, '_')}`;
}

// Every column after the title is resized from its left edge: going left widens it.
export function resizedWidth(
  _column: GridColumn,
  w0: number,
  dx: number,
  limits: { min: number; max: number },
): number {
  return Math.round(Math.max(limits.min, Math.min(limits.max, w0 - dx)));
}

export function widthChip(label: string, w: number, limits: { min: number; max: number }): string {
  const said =
    w <= limits.min ? t('boardView.col.min') : w >= limits.max ? t('boardView.col.max') : String(w);
  return `${label} · ${said}`;
}
