import {
  type BoardDefinition,
  LEVELS,
  MOTIVE,
  type Part,
  partOf,
  STEP,
  stepById,
  usedRefs,
} from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import { type SampleItem, sampleValue } from './samples.ts';

// The published list as a Tabla (F15): one row per item with the board's columns, grouped by a
// field, the step or the motive. The grouped field is never a column too; an ended item shows only
// its motive, or a dash, under Turno.

export type TableRow = {
  item: SampleItem;
  step: string;
  cells: string[];
  turn: string;
  you: boolean;
};

export type TableView = {
  columns: Part[];
  // `key`: the group's head; null when nothing groups the table.
  groups: { key: string | null; rows: TableRow[] }[];
};

const stepName = (def: BoardDefinition, item: SampleItem): string => {
  if (item.closed) return item.look === 'dropped' ? t('bs.preview.dropped') : t('bs.done');
  return (item.step ? stepById(def, item.step)?.name : undefined) ?? '—';
};

function turnOf(item: SampleItem): string {
  if (item.closed) return item.motive ?? '—';
  if (item.look === 'yours')
    return t(item.phase === 'doing' ? 'bs.preview.table.yourStep' : 'bs.preview.table.review');
  if (item.look === 'working') return item.agent ?? t('bs.preview.anAgent');
  return t('bs.preview.table.waiting');
}

export function tableOf(def: BoardDefinition, items: readonly SampleItem[]): TableView {
  const group = def.list.group;
  const used = usedRefs(def);
  const columns = def.row
    .filter((ref) => ref !== group && used.has(ref))
    .flatMap((ref) => partOf(def, ref) ?? [])
    .slice(0, 3);
  const grouped = group && group !== STEP && group !== MOTIVE ? partOf(def, group) : undefined;
  const keyOf = (item: SampleItem): string | null => {
    if (!group) return null;
    if (group === STEP) return stepName(def, item);
    if (group === MOTIVE) return item.motive ?? '—';
    return grouped ? sampleValue(grouped, item.title.length) : '—';
  };
  const rows = items.map((item) => ({
    item,
    step: stepName(def, item),
    cells: columns.map((part) => sampleValue(part, item.title.length)),
    turn: turnOf(item),
    you: !item.closed && item.look === 'yours',
  }));
  const keys = [...new Set(items.map(keyOf))];
  if (grouped?.kind === 'level') {
    const rank = (key: string | null) =>
      LEVELS.findIndex((level) => t(`bs.level.${level}` as 'bs.level.low') === key);
    keys.sort((a, b) => rank(b) - rank(a));
  }
  return {
    columns,
    groups: keys.map((key) => ({
      key,
      rows: rows.filter((row) => keyOf(row.item) === key),
    })),
  };
}
