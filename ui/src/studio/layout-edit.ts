import { LAYOUT_SLOTS, type LayoutEntry, MODULE_REGISTRY } from '../../../src/core/modules.ts';
import type { Preset } from '../../../src/core/preset.ts';
import { t } from '../i18n/i18n.ts';
import type { LayoutSlot } from '../types.ts';
import { type Path, type RawPreset, rawOf, renameIn, setIn } from './draft.ts';

// Editing where a preset's fields live and show, as the preview's inspector does: the field's own
// entry, and its places in each type's layout. A slot the YAML leaves out is the core's default;
// changing it writes that default first, so the rest of the slot stays as the preview drew it.

export function fieldPath(raw: RawPreset, type: string | undefined, field: string): Path {
  return type !== undefined && raw.types?.[type]?.fields?.[field] !== undefined
    ? ['types', type, 'fields', field]
    : ['fields', field];
}

export function layoutPath(raw: RawPreset, type: string): Path {
  return raw.types?.[type] ? ['types', type, 'layout'] : ['layout'];
}

// The types that have a field: every type for a shared one, else the one that declares it.
export function sharedBy(raw: RawPreset, field: string): string[] {
  const types = Object.keys(raw.types ?? {});
  if (raw.fields?.[field] !== undefined) return types;
  return types.filter((type) => raw.types?.[type]?.fields?.[field] !== undefined);
}

// The order the inspector offers slots in: where a field is seen most, then the rest.
const FIELD_ORDER: readonly LayoutSlot[] = [
  'header',
  'row',
  'intake',
  'body',
  'side',
  'phone',
  'evidence',
];

const typeIn = (preset: Preset | undefined, type: string) =>
  preset?.types.find(({ name }) => name === type);

export function shownIn(preset: Preset | undefined, type: string, field: string): LayoutSlot[] {
  const shape = typeIn(preset, type);
  if (!shape) return [];
  return FIELD_ORDER.filter((slot) => shape.layout[slot].some((entry) => entry.field === field));
}

export type SlotChoice = { slot: LayoutSlot; struck?: string };

// The slots a field module may sit in; the others struck, with why.
export function slotChoices(module: string | undefined): SlotChoice[] {
  const spec = MODULE_REGISTRY[(module ?? 'text') as keyof typeof MODULE_REGISTRY];
  return FIELD_ORDER.map((slot) =>
    spec?.slots.includes(slot)
      ? { slot }
      : {
          slot,
          struck: t(
            slot === 'evidence' ? 'studio.inspect.evidenceNoField' : 'studio.inspect.slotNoField',
          ),
        },
  );
}

// An entry as the YAML writes it: a field by its name, a module as its map.
function written(entry: LayoutEntry): unknown {
  if (entry.field !== undefined && entry.label === undefined) return entry.field;
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined));
}

function slotOf(preset: Preset | undefined, type: string, slot: LayoutSlot): LayoutEntry[] {
  return typeIn(preset, type)?.layout[slot] ?? [];
}

function writeSlot(yaml: string, type: string, slot: LayoutSlot, entries: unknown[]): string {
  return setIn(yaml, [...layoutPath(rawOf(yaml), type), slot], entries);
}

export function setShownIn(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  field: string,
  slot: LayoutSlot,
  on: boolean,
): string {
  const entries = slotOf(preset, type, slot);
  const has = entries.some((entry) => entry.field === field);
  if (has === on) return yaml;
  const kept = on
    ? [...entries.map(written), field]
    : entries.filter((entry) => entry.field !== field).map(written);
  return writeSlot(yaml, type, slot, kept);
}

// Puts a new entry at an index of a slot.
export function insertInSlot(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  slot: LayoutSlot,
  index: number,
  entry: unknown,
): string {
  const entries = slotOf(preset, type, slot).map(written);
  entries.splice(Math.max(0, Math.min(index, entries.length)), 0, entry);
  return writeSlot(yaml, type, slot, entries);
}

export function moveInSlot(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  slot: LayoutSlot,
  from: number,
  to: number,
): string {
  const entries = slotOf(preset, type, slot).map(written);
  if (from === to || from < 0 || from >= entries.length) return yaml;
  const [moved] = entries.splice(from, 1);
  entries.splice(Math.max(0, Math.min(to, entries.length)), 0, moved);
  return writeSlot(yaml, type, slot, entries);
}

export function removeFromSlot(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  slot: LayoutSlot,
  index: number,
): string {
  const entries = slotOf(preset, type, slot).map(written);
  entries.splice(index, 1);
  return writeSlot(yaml, type, slot, entries);
}

// The types whose layouts the YAML writes, with each slot it names.
function writtenSlots(raw: RawPreset): Array<{ path: Path; slot: string; entries: unknown[] }> {
  const layouts: Array<{ path: Path; layout: unknown }> = [
    { path: ['layout'], layout: (raw as { layout?: unknown }).layout },
    ...Object.entries(raw.types ?? {}).map(([name, spec]) => ({
      path: ['types', name, 'layout'] as Path,
      layout: spec?.layout,
    })),
  ];
  return layouts.flatMap(({ path, layout }) =>
    typeof layout === 'object' && layout !== null
      ? Object.entries(layout as Record<string, unknown>)
          .filter(([, entries]) => Array.isArray(entries))
          .map(([slot, entries]) => ({ path, slot, entries: entries as unknown[] }))
      : [],
  );
}

const names = (entry: unknown, field: string) =>
  entry === field ||
  (typeof entry === 'object' && entry !== null && (entry as { field?: unknown }).field === field);

// Removes a field: its entry, its places in every layout the YAML writes, and its words.
export function removeField(
  yaml: string,
  _preset: Preset | undefined,
  type: string | undefined,
  field: string,
): string {
  const raw = rawOf(yaml);
  let next = setIn(yaml, fieldPath(raw, type, field), undefined);
  for (const { path, slot, entries } of writtenSlots(raw)) {
    if (entries.some((entry) => names(entry, field))) {
      next = setIn(
        next,
        [...path, slot],
        entries.filter((entry) => !names(entry, field)),
      );
    }
  }
  for (const language of Object.keys(labelsOf(raw))) {
    if (labelsOf(raw)[language]?.fields?.[field] !== undefined)
      next = setIn(next, ['labels', language, 'fields', field], undefined);
  }
  return next;
}

type RawLabels = Record<string, { fields?: Record<string, string> } | undefined>;

function labelsOf(raw: RawPreset): RawLabels {
  return ((raw as { labels?: RawLabels }).labels ?? {}) as RawLabels;
}

// Renames a field where the preset names it: its key, the layouts the YAML writes, its words and
// the grid's columns. The playbook's prose and stored items are not rewritten.
export function renameField(
  yaml: string,
  _preset: Preset | undefined,
  type: string | undefined,
  from: string,
  to: string,
): string {
  const raw = rawOf(yaml);
  const at = fieldPath(raw, type, from);
  let next = renameIn(yaml, at.slice(0, -1), from, to);
  for (const { path, slot, entries } of writtenSlots(raw)) {
    if (entries.some((entry) => names(entry, from))) {
      next = setIn(
        next,
        [...path, slot],
        entries.map((entry) =>
          entry === from
            ? to
            : names(entry, from)
              ? { ...(entry as Record<string, unknown>), field: to }
              : entry,
        ),
      );
    }
  }
  for (const language of Object.keys(labelsOf(raw))) {
    if (labelsOf(raw)[language]?.fields?.[from] !== undefined)
      next = renameIn(next, ['labels', language, 'fields'], from, to);
  }
  const columns = raw.view?.columns;
  if (columns?.includes(from))
    next = setIn(
      next,
      ['view', 'columns'],
      columns.map((column) => (column === from ? to : column)),
    );
  if (raw.view?.group_by === from) next = setIn(next, ['view', 'group_by'], to);
  return next;
}

export { LAYOUT_SLOTS };
