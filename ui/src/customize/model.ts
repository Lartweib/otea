import type { LayoutEntry } from '../../../src/core/modules.ts';
import type { Preset } from '../../../src/core/preset.ts';
import { fieldLabel } from '../intake.ts';
import { type RawPreset, rawOf, setIn } from '../studio/draft.ts';
import { fieldPath, layoutPath, removeField } from '../studio/layout-edit.ts';

// The builder's document: the type's layout as the person sees it, zones of things. Pure: the page
// draws it, drag and menus change it, and `yamlOf` writes it back through the Studio's YAML edits.

export const ZONES = ['header', 'body', 'side', 'row', 'intake'] as const;
export type Zone = (typeof ZONES)[number];
const DETAIL = ['header', 'body', 'side'] as const;

export type Kind = 'short' | 'long' | 'choice' | 'level' | 'files' | 'link';
export type Need = 'no' | 'complete' | 'create';

export type Thing = {
  id: string;
  name: string;
  kind: Kind;
  need: Need;
  // The layout entry as the YAML writes it, for a thing that is a module and not a field.
  entry?: unknown;
  options?: string[];
};

export type Doc = { things: Record<string, Thing>; zones: Record<Zone, string[]> };

const MODULE_KIND: Record<string, Kind> = {
  text: 'short',
  markdown: 'long',
  enum: 'choice',
  severity: 'level',
};
const KIND_MODULE: Record<string, string> = {
  short: 'text',
  long: 'markdown',
  choice: 'enum',
  level: 'severity',
};
export const KIND_WORD: Record<Kind, string> = {
  short: 'Short text',
  long: 'Long text',
  choice: 'Choice',
  level: 'Level',
  files: 'Files',
  link: 'Links',
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// The name a typed name becomes in the file. The person never sees it, except in the file.
export function keyOf(name: string): string {
  const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (
    plain
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'field'
  );
}

const refOf = (entry: LayoutEntry) => entry.field ?? entry.id ?? entry.module;

const written = (entry: LayoutEntry): unknown =>
  entry.field !== undefined && entry.label === undefined
    ? entry.field
    : Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined));

export function docOf(preset: Preset, type: string): Doc {
  const shape = preset.types.find(({ name }) => name === type);
  const doc: Doc = { things: {}, zones: { header: [], body: [], side: [], row: [], intake: [] } };
  if (!shape) return doc;
  for (const [id, spec] of Object.entries(shape.fields)) {
    doc.things[id] = {
      id,
      name: fieldLabel(id),
      kind: MODULE_KIND[spec.module] ?? 'short',
      need: spec.required ?? 'no',
      ...(spec.values ? { options: [...spec.values] } : {}),
    };
  }
  for (const zone of ZONES) {
    for (const entry of shape.layout[zone]) {
      const ref = refOf(entry);
      if (entry.field === undefined && !doc.things[ref]) {
        const link = entry.module === 'relations' || entry.module === 'children';
        doc.things[ref] = {
          id: ref,
          name: fieldLabel(ref),
          kind: link ? 'link' : 'files',
          need: 'no',
          entry: written(entry),
        };
      }
      if (doc.things[ref]) doc.zones[zone].push(ref);
    }
  }
  return doc;
}

export const homeOf = (doc: Doc, id: string): Zone | undefined =>
  DETAIL.find((zone) => doc.zones[zone].includes(id));

const WORD: Record<Zone, string> = {
  header: 'Under the title',
  body: 'Brief',
  side: 'Details',
  row: 'the List row',
  intake: 'the New item form',
};
export const zoneWord = (zone: Zone) => WORD[zone];

// Why a thing cannot land in a zone, or nothing when it can: small values go anywhere, long text
// and files need room.
export function refusal(kind: Kind, zone: Zone | 'panel'): string | undefined {
  if (zone === 'panel') return undefined;
  if (zone === 'intake')
    return kind === 'files' || kind === 'link' ? 'The form only asks for fields' : undefined;
  if (zone === 'row') {
    if (kind === 'long') return 'Long text does not fit in a row';
    return kind === 'files' || kind === 'link' ? 'A row only shows small values' : undefined;
  }
  if (kind === 'files') return zone === 'body' ? undefined : 'Files need room: they go in Brief';
  if (kind === 'long' && zone !== 'body') return 'Long text needs room: it goes in Brief';
  return undefined;
}

export type Drop = { zone: Zone | 'panel'; index: number };

function drop(list: string[], id: string) {
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1);
}

// Moves a thing to a place, or hides it on the panel. Within the detail it leaves its other places
// (the form, the row) alone.
export function move(doc: Doc, id: string, to: Drop): { doc: Doc; refused?: string } {
  const thing = doc.things[id];
  if (!thing) return { doc };
  const why = refusal(thing.kind, to.zone);
  if (why) return { doc, refused: why };
  const next = clone(doc);
  if (to.zone === 'panel') {
    for (const zone of DETAIL) drop(next.zones[zone], id);
    return { doc: next };
  }
  if (to.zone === 'header' || to.zone === 'body' || to.zone === 'side') {
    for (const zone of DETAIL) drop(next.zones[zone], id);
  } else drop(next.zones[to.zone], id);
  const list = next.zones[to.zone];
  list.splice(Math.max(0, Math.min(to.index, list.length)), 0, id);
  return { doc: next };
}

// Shows a field in a zone it is not in (the menu's Also in), or stops showing it there.
export function setAlso(doc: Doc, id: string, zone: 'row' | 'intake', on: boolean): Doc {
  const next = clone(doc);
  const list = next.zones[zone];
  if (on && !list.includes(id)) list.push(id);
  if (!on) drop(list, id);
  return next;
}

export function patchThing(doc: Doc, id: string, patch: Partial<Thing>): Doc {
  const next = clone(doc);
  if (next.things[id]) Object.assign(next.things[id], patch);
  return next;
}

export function addField(
  doc: Doc,
  name: string,
  kind: Kind,
  zone: Zone = 'body',
): { doc: Doc; id: string } {
  const next = clone(doc);
  const base = keyOf(name);
  let id = base;
  let n = 2;
  while (next.things[id]) id = `${base}_${n++}`;
  next.things[id] = { id, name: name.trim(), kind, need: 'no' };
  next.zones[zone].push(id);
  return { doc: next, id };
}

export function deleteField(doc: Doc, id: string): Doc {
  const next = clone(doc);
  delete next.things[id];
  for (const zone of ZONES) drop(next.zones[zone], id);
  return next;
}

export const unplaced = (doc: Doc): Thing[] =>
  Object.values(doc.things).filter(
    (thing) => !ZONES.some((zone) => doc.zones[zone].includes(thing.id)),
  );

// ---- undo and redo
export type History = { doc: Doc; base: Doc; past: Doc[]; future: Doc[] };
export const start = (doc: Doc): History => ({ doc, base: doc, past: [], future: [] });
export function commit(h: History, doc: Doc): History {
  if (JSON.stringify(doc) === JSON.stringify(h.doc)) return h;
  return { ...h, doc, past: [...h.past, h.doc], future: [] };
}
export function undo(h: History): History {
  const prev = h.past[h.past.length - 1];
  return prev ? { ...h, doc: prev, past: h.past.slice(0, -1), future: [h.doc, ...h.future] } : h;
}
export function redo(h: History): History {
  const [next, ...rest] = h.future;
  return next ? { ...h, doc: next, past: [...h.past, h.doc], future: rest } : h;
}
export const changed = (h: History) => JSON.stringify(h.doc) !== JSON.stringify(h.base);

// ---- the changes in plain words
export type Change = { text: string; kind: 'new' | 'move' | 'hidden' | 'gone' | 'other' };

export function changesOf(base: Doc, doc: Doc): Change[] {
  const out: Change[] = [];
  const say = (text: string, kind: Change['kind'] = 'other') => out.push({ text, kind });
  const ids = [
    ...Object.keys(doc.things),
    ...Object.keys(base.things).filter((id) => !doc.things[id]),
  ];
  for (const id of ids) {
    const was = base.things[id];
    const now = doc.things[id];
    if (!now && was) {
      const module = was.kind === 'files' || was.kind === 'link';
      say(
        module ? `${was.name} removed from the detail` : `Field ${was.name} deleted`,
        module ? 'hidden' : 'gone',
      );
      continue;
    }
    if (!now) continue;
    const from = was ? homeOf(base, id) : undefined;
    const to = homeOf(doc, id);
    if (!was) say(`New field ${now.name}${to ? ` in ${zoneWord(to)}` : ''}`, 'new');
    else if (from !== to) {
      if (from && to) say(`${now.name} moved from ${zoneWord(from)} to ${zoneWord(to)}`, 'move');
      else if (to) say(`${now.name} now shows in ${zoneWord(to)}`, 'new');
      else say(`${now.name} hidden from the detail`, 'hidden');
    }
    if (was && was.name !== now.name) say(`${was.name} is now called ${now.name}`);
    if (was && JSON.stringify(was.options ?? null) !== JSON.stringify(now.options ?? null))
      say(`${now.name} options changed`);
    if (was && was.kind !== now.kind)
      say(`${now.name} is now a ${KIND_WORD[now.kind]}. Check its saved values: some may not fit.`);
    if (was && was.need !== now.need)
      say(
        now.need === 'no'
          ? `${now.name} is no longer needed`
          : `${now.name} is now needed ${now.need === 'create' ? 'to create' : 'to start work'}`,
      );
  }
  const common = (a: string[], b: string[]) => a.filter((x) => b.includes(x));
  const shuffled = (a: string[], b: string[]) => common(a, b).join() !== common(b, a).join();
  for (const zone of ZONES) {
    if (shuffled(base.zones[zone], doc.zones[zone]))
      say(`Order changed in ${zoneWord(zone)}`, 'move');
  }
  for (const zone of ['intake', 'row'] as const) {
    const [more, less] =
      zone === 'intake'
        ? ['New item form now asks for', 'New item form no longer asks for']
        : ['List row now shows', 'List row no longer shows'];
    for (const id of doc.zones[zone])
      if (!base.zones[zone].includes(id) && doc.things[id]) say(`${more} ${doc.things[id].name}`, 'new');
    for (const id of base.zones[zone])
      if (!doc.zones[zone].includes(id) && base.things[id])
        say(`${less} ${base.things[id].name}`, 'hidden');
  }
  return out;
}

// ---- back to the file
export function yamlOf(
  yaml: string,
  preset: Preset | undefined,
  type: string,
  base: Doc,
  doc: Doc,
): string {
  let next = yaml;
  for (const id of Object.keys(base.things)) {
    if (!doc.things[id]) next = removeField(next, preset, type, id);
  }
  for (const [id, thing] of Object.entries(doc.things)) {
    const was = base.things[id];
    if (thing.entry !== undefined) continue;
    if (was && JSON.stringify(was) === JSON.stringify(thing)) continue;
    const raw: RawPreset = rawOf(next);
    const at = fieldPath(raw, type, id);
    const current = at[0] === 'fields' ? raw.fields?.[id] : raw.types?.[type]?.fields?.[id];
    const spec: Record<string, unknown> = { ...(current ?? {}) };
    spec.module = KIND_MODULE[thing.kind] ?? 'text';
    if (thing.need === 'no') delete spec.required;
    else spec.required = thing.need;
    if (thing.kind === 'choice')
      spec.values = thing.options ?? (spec.values as string[] | undefined) ?? ['one', 'two'];
    else delete spec.values;
    if (thing.name !== fieldLabel(id)) spec.label = thing.name;
    else delete spec.label;
    next = setIn(next, at, spec);
  }
  for (const zone of ZONES) {
    if (JSON.stringify(base.zones[zone]) === JSON.stringify(doc.zones[zone])) continue;
    const entries = doc.zones[zone].map((id) => doc.things[id]?.entry ?? id);
    next = setIn(next, [...layoutPath(rawOf(next), type), zone], entries);
  }
  return next;
}
