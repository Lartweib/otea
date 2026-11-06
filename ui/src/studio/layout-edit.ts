import { evidenceTypeOf } from '../../../src/core/evidence.ts';
import {
  FIELD_MODULES,
  type FieldModule,
  LAYOUT_SLOTS,
  type LayoutEntry,
  MODULE_REGISTRY,
  type ModuleKind,
} from '../../../src/core/modules.ts';
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

// What + field here offers in a slot: the field modules when the slot takes fields, then every
// other module, struck where the slot does not take it.
export type ModuleOffer = { module: ModuleKind; struck?: string };

// An evidence module starts as images; its inspector turns it into another kind of file.
const OTHER_MODULES: readonly ModuleKind[] = ['relations', 'children', 'images', 'rounds'];

export function slotOffer(slot: LayoutSlot): { fields: FieldModule[]; modules: ModuleOffer[] } {
  return {
    fields: FIELD_MODULES.filter((module) => MODULE_REGISTRY[module].slots.includes(slot)),
    modules: OTHER_MODULES.map((module) =>
      MODULE_REGISTRY[module].slots.includes(slot)
        ? { module }
        : {
            module,
            struck: t('studio.add.notHere', {
              slots: MODULE_REGISTRY[module].slots.join(', '),
            }),
          },
    ),
  };
}

// A new field, shared by every type, placed at the index of the slot. A preset that speaks another
// language names it there too, as its name until someone words it.
export function addField(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  slot: LayoutSlot,
  index: number,
  name: string,
  module: FieldModule,
): string {
  const spec: Record<string, unknown> = { module };
  if (module === 'enum') spec.values = ['one', 'two'];
  let next = setIn(yaml, ['fields', name], spec);
  for (const language of Object.keys(labelsOf(rawOf(yaml))))
    next = setIn(next, ['labels', language, 'fields', name], name);
  return insertInSlot(next, preset, type, slot, index, name);
}

export function addModule(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  slot: LayoutSlot,
  index: number,
  module: ModuleKind,
): string {
  const entry = MODULE_REGISTRY[module].family === 'evidence' ? { module, id: module } : { module };
  return insertInSlot(yaml, preset, type, slot, index, entry);
}

// Replaces the entry at an index of a slot, as the inspector of a module changes it.
export function setEntry(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  slot: LayoutSlot,
  index: number,
  entry: LayoutEntry,
): string {
  const entries = slotOf(preset, type, slot).map(written);
  if (index < 0 || index >= entries.length) return yaml;
  entries[index] = written(entry);
  return writeSlot(yaml, type, slot, entries);
}

const EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'mp4',
  'webm',
  'mov',
  'diff',
  'patch',
  'log',
  'txt',
  'mmd',
  'mermaid',
];

// The file extensions an evidence module may accept.
export function extensionsOf(module: string): string[] {
  const kinds = MODULE_REGISTRY[module as ModuleKind]?.accepts ?? [];
  return EXTENSIONS.filter((extension) => kinds.includes(evidenceTypeOf(`f.${extension}`).kind));
}

// ---- sections: the detail's main column as titled runs of entries ----

type Raw = Record<string, unknown>;

export type SectionWidth = 'full' | 'half';

// Where an entry sits: a section, or one of the slots that keep their meaning beside sections.
export type EntryPlace = { section: number } | { slot: 'header' | 'side' | 'row' | 'intake' };

export type EntryEdit = { ok: true; yaml: string } | { ok: false; reason: string };

const refuse = (reason: string): EntryEdit => ({ ok: false, reason });

const isRelation = (module: ModuleKind) => MODULE_REGISTRY[module].family === 'relation';

function rawLayout(yaml: string, type: string): Raw {
  const raw = rawOf(yaml);
  let node: unknown = raw;
  for (const key of layoutPath(raw, type)) node = (node as Raw | undefined)?.[String(key)];
  return typeof node === 'object' && node !== null ? (node as Raw) : {};
}

function rawSections(yaml: string, type: string): Raw[] | undefined {
  const sections = rawLayout(yaml, type).sections;
  return Array.isArray(sections) ? (sections as Raw[]) : undefined;
}

function writeSections(yaml: string, type: string, sections: Raw[]): string {
  return setIn(yaml, [...layoutPath(rawOf(yaml), type), 'sections'], sections);
}

const entriesOf = (section: Raw | undefined): unknown[] =>
  Array.isArray(section?.entries) ? (section.entries as unknown[]) : [];

// Turns a layout that places body, evidence and relations into sections: Brief holds the evidence
// and the body's own entries, Structure the relation modules of the body and the side. The body and
// evidence slots are removed, the side keeps what is not a relation. A layout that already has
// sections is returned as it is.
export function ensureSections(yaml: string, preset: Preset | undefined, type: string): string {
  if (rawSections(yaml, type)) return yaml;
  const placed = (slot: LayoutSlot) => slotOf(preset, type, slot);
  const body = [...placed('evidence'), ...placed('body')];
  const side = placed('side');
  const brief = body.filter((e) => !isRelation(e.module));
  const structure = [...body, ...side].filter((e) => isRelation(e.module));
  const sections: Raw[] = [
    { title: 'Brief', entries: brief.map(written) },
    ...(structure.length > 0 ? [{ title: 'Structure', entries: structure.map(written) }] : []),
  ];
  const path = layoutPath(rawOf(yaml), type);
  const kept = side.filter((e) => !isRelation(e.module)).map(written);
  let next = setIn(yaml, [...path, 'side'], kept);
  next = setIn(next, [...path, 'body'], undefined);
  next = setIn(next, [...path, 'evidence'], undefined);
  return writeSections(next, type, sections);
}

function withSections(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  change: (sections: Raw[]) => Raw[],
): string {
  const ready = ensureSections(yaml, preset, type);
  return writeSections(ready, type, change([...(rawSections(ready, type) ?? [])]));
}

export function addSection(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  title: string,
): string {
  return withSections(yaml, preset, type, (sections) => [...sections, { title, entries: [] }]);
}

export function renameSection(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  index: number,
  title: string,
): string {
  return withSections(yaml, preset, type, (sections) =>
    sections.map((section, at) => (at === index ? { ...section, title } : section)),
  );
}

export function moveSection(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  from: number,
  to: number,
): string {
  return withSections(yaml, preset, type, (sections) => {
    if (from === to || from < 0 || from >= sections.length) return sections;
    const [moved] = sections.splice(from, 1);
    if (moved) sections.splice(Math.max(0, Math.min(to, sections.length)), 0, moved);
    return sections;
  });
}

// `full` is the default, so it is written by leaving the width out.
export function setSectionWidth(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  index: number,
  width: SectionWidth,
): string {
  return withSections(yaml, preset, type, (sections) =>
    sections.map((section, at) => {
      if (at !== index) return section;
      const { title, entries } = section;
      return width === 'half' ? { title, width, entries } : { title, entries };
    }),
  );
}

// Its entries become unplaced: the fields stay declared, the modules go.
export function removeSection(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  index: number,
): string {
  return withSections(yaml, preset, type, (sections) => sections.filter((_, at) => at !== index));
}

const fieldNameOf = (entry: unknown): string | undefined =>
  typeof entry === 'string' ? entry : ((entry as Raw | null)?.field as string | undefined);

function sameEntry(a: unknown, b: unknown): boolean {
  const field = fieldNameOf(a);
  if (field !== undefined) return field === fieldNameOf(b);
  const x = a as Raw;
  const y = b as Raw;
  return x.module === y?.module && x.id === y?.id;
}

type Spot = EntryPlace & { index: number };

// Moves the entry at `from` to the index `to` of another place (or of the same), between any
// sections and the slots header, side, row and intake. Refuses, with the reason, what the module
// rules or the layout do not allow.
export function moveEntry(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  from: Spot,
  to: Spot,
): EntryEdit {
  const ready = ensureSections(yaml, preset, type);
  const sections = (rawSections(ready, type) ?? []).map((s) => ({
    ...s,
    entries: [...entriesOf(s)],
  }));
  const layout = rawLayout(ready, type);
  const touched = new Set<string>();
  const listOf = (place: EntryPlace): unknown[] | undefined => {
    if ('section' in place) return sections[place.section]?.entries;
    if (touched.has(place.slot)) return layout[place.slot] as unknown[];
    touched.add(place.slot);
    const raw = layout[place.slot];
    const list = Array.isArray(raw) ? [...raw] : slotOf(preset, type, place.slot).map(written);
    layout[place.slot] = list;
    return list;
  };
  const source = listOf(from);
  const target = listOf(to);
  const entry = source?.[from.index];
  if (!source || !target || entry === undefined) return refuse('There is no entry there to move.');
  const fields = typeIn(preset, type)?.fields ?? {};
  const name = fieldNameOf(entry);
  const module = (typeof entry === 'string' ? fields[entry]?.module : (entry as Raw).module) as
    | ModuleKind
    | undefined;
  const spec = module ? MODULE_REGISTRY[module] : undefined;
  if (!spec || !module) return refuse('Its module is unknown.');
  const slot = 'section' in to ? 'body' : to.slot;
  if (!spec.slots.includes(slot)) {
    const here = 'section' in to ? 'a section' : to.slot;
    return refuse(
      `The ${module} module cannot sit in ${here} (it goes in ${spec.slots.join(', ')}).`,
    );
  }
  const sameList = source === target;
  source.splice(from.index, 1);
  const scope = 'section' in to ? sections.flatMap(entriesOf) : target;
  const taken = scope.some((other) => sameEntry(entry, other));
  if (!sameList && taken && name !== undefined) {
    return refuse(`Field "${name}" is already in ${'section' in to ? 'the sections' : to.slot}.`);
  }
  if (!sameList && taken && isRelation(module)) {
    return refuse(`The ${module} module is already there.`);
  }
  const leavesIntake =
    'slot' in from && from.slot === 'intake' && !('slot' in to && to.slot === 'intake');
  if (leavesIntake && name !== undefined && fields[name]?.required === 'create') {
    return refuse(`Field "${name}" is required to create, so the create form must ask for it.`);
  }
  const at = sameList && from.index < to.index ? to.index - 1 : to.index;
  target.splice(Math.max(0, Math.min(at, target.length)), 0, entry);
  let next = writeSections(ready, type, sections);
  for (const key of touched)
    next = setIn(next, [...layoutPath(rawOf(next), type), key], layout[key]);
  return { ok: true, yaml: next };
}

export { LAYOUT_SLOTS };
