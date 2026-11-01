import { isEvidenceModule } from './evidence.ts';
import type { CollectionView, FieldView, LayoutEntry, LayoutSlot, TypeView } from './types.ts';

// A value with the field that shapes it and the label its layout entry gives it.
export type PlacedValue = { field: FieldView; value: string; label: string };

// A column of an item detail: runs of field values, the evidence and relation modules where the
// layout places them, and the plain evidence list (the files no drawn module holds).
export type DetailBlock =
  | { kind: 'fields'; values: PlacedValue[] }
  | { kind: 'module'; entry: LayoutEntry }
  | { kind: 'relation'; entry: LayoutEntry }
  | { kind: 'evidence' };

export function isRelationModule(entry: LayoutEntry): boolean {
  return entry.module === 'relations' || entry.module === 'children';
}

// Whether the type's detail draws a children module, which then owns the children of a parent.
export function placesChildren(type: TypeView | undefined): boolean {
  if (!type) return false;
  return [...type.layout.body, ...type.layout.side].some(({ module }) => module === 'children');
}

export type DetailBlocks = { head: PlacedValue[]; primary: DetailBlock[]; side: DetailBlock[] };

// The type an item is of; undefined while its collection loads or when its preset lost the type.
export function typeOf(collection: CollectionView | undefined, name: string): TypeView | undefined {
  return collection?.types.find((type) => type.name === name);
}

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
  const label = type?.label ?? name;
  if (type?.icon) {
    // A preset without types names its only type after itself (an epic, a bug-triage item).
    const word = showsTypes(collection) ? label.toLowerCase() : (collection?.preset ?? name);
    return { kind: 'icon', icon: type.icon, word };
  }
  return showsTypes(collection) ? { kind: 'tag', name, label } : null;
}

function fieldOf(type: TypeView, name: string): FieldView | undefined {
  return type.fields.find((field) => field.name === name);
}

export function intakeFields(type: TypeView): FieldView[] {
  return type.layout.intake.flatMap(({ field }) => {
    const found = field === undefined ? undefined : fieldOf(type, field);
    return found ? [found] : [];
  });
}

function placed(
  type: TypeView,
  entry: LayoutEntry,
  values: Readonly<Record<string, string>>,
): PlacedValue[] {
  const { field: name, label } = entry;
  const value = name === undefined ? undefined : values[name];
  const field = name === undefined ? undefined : fieldOf(type, name);
  if (!field || value === undefined) return [];
  return [{ field, value, label: label ?? field.name }];
}

function slotValues(
  type: TypeView,
  slot: LayoutSlot,
  values: Readonly<Record<string, string>>,
): PlacedValue[] {
  return type.layout[slot].flatMap((entry) => placed(type, entry, values));
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
  entries: readonly LayoutEntry[],
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
  for (const entry of entries) {
    if (isEvidenceModule(entry)) blocks.push({ kind: 'module', entry });
    else if (isRelationModule(entry)) blocks.push({ kind: 'relation', entry });
    else add(placed(type, entry, values));
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
  return {
    head: slotValues(type, 'header', values),
    primary: [
      ...blocksOf(
        type,
        [...type.layout.evidence, ...type.layout.body],
        values,
        undeclared(type, values),
      ),
      { kind: 'evidence' },
    ],
    side: blocksOf(type, type.layout.side, values),
  };
}
