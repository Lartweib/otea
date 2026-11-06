import { isEvidenceModule } from './evidence.ts';
import { presetText } from './i18n/i18n.ts';
import { fieldLabel } from './intake.ts';
import { fieldWord, typeWord } from './preset-words.ts';
import type { CollectionView, FieldView, LayoutEntry, LayoutSlot, TypeView } from './types.ts';

// Where a type's layout places a part: its slot and its index there, and the field it draws. Studio
// reads it off the rendered part (slotData) to open what was clicked in the preset.
export type SlotPath = {
  type: string;
  slot: LayoutSlot;
  index: number;
  field?: string;
  // Set for an entry of a section: its index there is `index`, its slot is body.
  section?: number;
};

// A value with the field that shapes it, the label its layout entry gives it, and where the layout
// places it (none for a value whose field the type does not declare).
export type PlacedValue = { field: FieldView; value: string; label: string; at?: SlotPath };

// A column of an item detail: runs of field values, the evidence and relation modules where the
// layout places them, and the plain evidence list (the files no drawn module holds). Runs merge the
// values of neighbouring entries, so each value keeps its own place.
export type DetailBlock =
  | { kind: 'fields'; values: PlacedValue[] }
  | { kind: 'module'; entry: LayoutEntry; at?: SlotPath }
  | { kind: 'relation'; entry: LayoutEntry; at?: SlotPath }
  | { kind: 'reserved'; entry: LayoutEntry; at?: SlotPath }
  | { kind: 'evidence' };

// The data attributes a rendered part carries for its place: data-type, data-slot, data-index and,
// for a field, data-field. Nothing for a part the layout does not place.
export function slotData(at: SlotPath | undefined): Record<string, string> {
  if (!at) return {};
  return {
    'data-type': at.type,
    'data-slot': at.slot,
    'data-index': String(at.index),
    ...(at.field === undefined ? {} : { 'data-field': at.field }),
    ...(at.section === undefined ? {} : { 'data-section': String(at.section) }),
  };
}

function pathOf(type: TypeView, slot: LayoutSlot, index: number, entry: LayoutEntry): SlotPath {
  return {
    type: type.name,
    slot,
    index,
    ...(entry.field === undefined ? {} : { field: entry.field }),
  };
}

// The entries of the type's slots, in order, each with its place.
function placedEntries(type: TypeView, slots: readonly LayoutSlot[]) {
  return slots.flatMap((slot) =>
    type.layout[slot].map((entry, index) => ({ entry, at: pathOf(type, slot, index, entry) })),
  );
}

// Modules that draw from the item as a whole (its history, a field it reads by name) rather than
// one field or one module's files. questions and score draw nothing yet.
const RESERVED: readonly string[] = ['rounds', 'options'];

export function isReservedModule(entry: LayoutEntry): boolean {
  return RESERVED.includes(entry.module);
}

// A type that places rounds draws its evidence modules inside each round, not on their own.
export function placesRounds(type: TypeView | undefined): boolean {
  return !!type && type.layout.body.some(({ module }) => module === 'rounds');
}

export function isRelationModule(entry: LayoutEntry): boolean {
  return entry.module === 'relations' || entry.module === 'children';
}

// Whether the type's detail draws a children module, which then owns the children of a parent.
export function placesChildren(type: TypeView | undefined): boolean {
  if (!type) return false;
  const sectioned = (type.layout.sections ?? []).flatMap(({ entries }) => entries);
  return [...type.layout.body, ...sectioned, ...type.layout.side].some(
    ({ module }) => module === 'children',
  );
}

// A section of the detail, drawn in order under its title.
export type DetailSection = {
  index: number;
  title: string;
  width: 'full' | 'half';
  blocks: DetailBlock[];
};

// `sections` is set when the type's layout declares them; `primary` then holds only what no section
// draws (undeclared values, the plain evidence list).
export type DetailBlocks = {
  head: PlacedValue[];
  primary: DetailBlock[];
  side: DetailBlock[];
  sections?: DetailSection[];
};

// The type an item is of; undefined while its collection loads or when its preset lost the type.
export function typeOf(collection: CollectionView | undefined, name: string): TypeView | undefined {
  return collection?.types.find((type) => type.name === name);
}

// The types a new item may take: under a parent whose type lists its children, only those; with no
// parent, only the types that may stand alone. A preset without a hierarchy offers every type.
export function intakeTypes(collection: CollectionView, parent: TypeView | undefined): TypeView[] {
  if (!parent) return collection.types.filter(({ root }) => root !== false);
  const { children } = parent;
  if (children === undefined) return collection.types;
  return collection.types.filter(({ name }) => children.includes(name));
}

// Whether an item of the type may take children: always, unless the hierarchy gives it none.
export function takesChildren(type: TypeView | undefined): boolean {
  return type?.children === undefined || type.children.length > 0;
}

// The type of every item of a preset that declares no types (DEFAULT_TYPE in core).
const IMPLICIT_TYPE = 'item';

// A collection with a single type never marks it.
export function showsTypes(collection: CollectionView | undefined): boolean {
  return (collection?.types.length ?? 0) > 1;
}

// How the detail names an item's type: its icon and a word, its tag when the type has no icon, or
// nothing in a collection that never marks its type.
export type TypeMark =
  | { kind: 'icon'; icon: string; word: string }
  | { kind: 'tag'; name: string; label: string }
  | null;

export function typeMark(collection: CollectionView | undefined, name: string): TypeMark {
  const type = typeOf(collection, name);
  const label = typeWord(type, name);
  if (type?.icon) {
    // A preset without types names its only type after itself (an epic, a notes item); one that
    // names its only type says it (a bug).
    const named = showsTypes(collection) || name !== IMPLICIT_TYPE;
    const word = named ? label.toLowerCase() : (collection?.preset ?? name);
    return { kind: 'icon', icon: type.icon, word };
  }
  return showsTypes(collection) ? { kind: 'tag', name, label } : null;
}

function fieldOf(type: TypeView, name: string): FieldView | undefined {
  return type.fields.find((field) => field.name === name);
}

// The fields the create form asks for, in the intake slot's order, each with its place.
export function intakeSlots(type: TypeView): { field: FieldView; at: SlotPath }[] {
  return placedEntries(type, ['intake']).flatMap(({ entry, at }) => {
    const found = entry.field === undefined ? undefined : fieldOf(type, entry.field);
    return found ? [{ field: found, at }] : [];
  });
}

export function intakeFields(type: TypeView): FieldView[] {
  return intakeSlots(type).map(({ field }) => field);
}

function placed(
  type: TypeView,
  { entry, at }: { entry: LayoutEntry; at: SlotPath },
  values: Readonly<Record<string, string>>,
): PlacedValue[] {
  const { field: name, label } = entry;
  const value = name === undefined ? undefined : values[name];
  const field = name === undefined ? undefined : fieldOf(type, name);
  if (!field || value === undefined) return [];
  // The preset's label for the field in the language on screen wins: a screen never mixes the two.
  const word = fieldWord(type, field.name) ?? (label ? presetText(label) : fieldLabel(field.name));
  return [{ field, value, label: word, at }];
}

function slotValues(
  type: TypeView,
  slot: LayoutSlot,
  values: Readonly<Record<string, string>>,
): PlacedValue[] {
  return placedEntries(type, [slot]).flatMap((entry) => placed(type, entry, values));
}

// Values whose field the type does not declare (or every value, while the type is unknown) show as
// plain text, so nothing an item holds goes missing.
function undeclared(
  type: TypeView | undefined,
  values: Readonly<Record<string, string>>,
): PlacedValue[] {
  return Object.entries(values)
    .filter(([name]) => !type || !fieldOf(type, name))
    .map(([name, value]) => ({ field: { name, module: 'text' }, value, label: name }));
}

export function rowValues(
  type: TypeView | undefined,
  values: Readonly<Record<string, string>>,
): PlacedValue[] {
  return type ? slotValues(type, 'row', values) : undeclared(type, values);
}

function blocksOf(
  type: TypeView,
  entries: readonly { entry: LayoutEntry; at: SlotPath }[],
  values: Readonly<Record<string, string>>,
  extra: PlacedValue[] = [],
): DetailBlock[] {
  const blocks: DetailBlock[] = [];
  const add = (found: PlacedValue[]) => {
    if (found.length === 0) return;
    const last = blocks.at(-1);
    if (last?.kind === 'fields') last.values.push(...found);
    else blocks.push({ kind: 'fields', values: found });
  };
  for (const placedEntry of entries) {
    const { entry, at } = placedEntry;
    if (isEvidenceModule(entry)) blocks.push({ kind: 'module', entry, at });
    else if (isRelationModule(entry)) blocks.push({ kind: 'relation', entry, at });
    else if (isReservedModule(entry)) blocks.push({ kind: 'reserved', entry, at });
    else add(placed(type, placedEntry, values));
  }
  add(extra);
  return blocks;
}

// The item detail in the order of the type's layout: the header slot under the title, the evidence
// and body slots in the primary column, the side slot atop the side. Reserved modules draw nothing
// yet. The plain evidence list closes the primary column. While the type is unknown, the relations
// still show aside.
export function detailBlocks(
  type: TypeView | undefined,
  values: Readonly<Record<string, string>>,
): DetailBlocks {
  if (!type) {
    const all = undeclared(type, values);
    const primary: DetailBlock[] = all.length > 0 ? [{ kind: 'fields', values: all }] : [];
    const relations: DetailBlock = { kind: 'relation', entry: { module: 'relations' } };
    return { head: [], primary: [...primary, { kind: 'evidence' }], side: [relations] };
  }
  if (type.layout.sections) {
    const rest = undeclared(type, values);
    return {
      head: slotValues(type, 'header', values),
      primary: [
        ...(rest.length > 0 ? [{ kind: 'fields' as const, values: rest }] : []),
        { kind: 'evidence' },
      ],
      side: blocksOf(type, placedEntries(type, ['side']), values),
      sections: type.layout.sections.map(({ title, width, entries }, section) => ({
        index: section,
        title,
        width: width ?? 'full',
        blocks: blocksOf(
          type,
          entries.map((entry, index) => ({
            entry,
            at: { ...pathOf(type, 'body', index, entry), section },
          })),
          values,
        ),
      })),
    };
  }
  return {
    head: slotValues(type, 'header', values),
    primary: [
      ...blocksOf(
        type,
        placedEntries(type, placesRounds(type) ? ['body'] : ['evidence', 'body']),
        values,
        undeclared(type, values),
      ),
      { kind: 'evidence' },
    ],
    side: blocksOf(type, placedEntries(type, ['side']), values),
  };
}
