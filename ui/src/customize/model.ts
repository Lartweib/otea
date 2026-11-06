import type { LayoutEntry } from '../../../src/core/modules.ts';
import type { Preset } from '../../../src/core/preset.ts';
import { t } from '../i18n/i18n.ts';
import { fieldLabel } from '../intake.ts';
import type { IconName } from '../kit/Icon.tsx';
import { type RawPreset, rawOf, setIn } from '../studio/draft.ts';
import { fieldPath, layoutPath, removeField } from '../studio/layout-edit.ts';

// The builder's document: the type's layout as the person sees it, zones of things. Pure: the page
// draws it, drag and menus change it, and `yamlOf` writes it back through the Studio's YAML edits.

export const ZONES = ['header', 'side', 'row', 'intake'] as const;
export type Zone = (typeof ZONES)[number];

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

// A box of the detail's main column: a titled run of things. Two consecutive half boxes sit side by
// side.
export type Section = { id: string; title: string; width: 'full' | 'half'; entries: string[] };

// `boxed` is whether the file must be written with sections. It starts true only for a preset that
// already has them, and any change to the boxes themselves sets it. Until then Brief and Structure
// are only how the person sees body, evidence, side and relations, and the file keeps its shape.
export type Doc = {
  things: Record<string, Thing>;
  zones: Record<Zone, string[]>;
  sections: Section[];
  boxed: boolean;
};

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

const isLink = (entry: LayoutEntry) => entry.module === 'relations' || entry.module === 'children';

// The modules a person can put in a box, in the order the panel offers them. Each is created with
// its own id the first time it is placed, and is offered again once it is hidden.
export const BLOCKS: readonly { module: string; icon: IconName }[] = [
  { module: 'images', icon: 'image' },
  { module: 'recording', icon: 'video' },
  { module: 'diff', icon: 'code' },
  { module: 'log', icon: 'log' },
  { module: 'diagram', icon: 'diagram' },
  { module: 'relations', icon: 'link' },
  { module: 'children', icon: 'branch' },
];

export const blockOf = (thing: Thing | undefined): string | undefined =>
  thing && (thing.kind === 'files' || thing.kind === 'link')
    ? (thing.entry as { module?: string } | undefined)?.module
    : undefined;

const blockName = (module: string): string | undefined =>
  BLOCKS.some((each) => each.module === module) ? t(`customize.block.${module}`) : undefined;

function readDoc(preset: Preset, type: string): Doc {
  const shape = preset.types.find(({ name }) => name === type);
  const doc: Doc = {
    things: {},
    zones: { header: [], side: [], row: [], intake: [] },
    sections: [],
    boxed: false,
  };
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
  const refs = (entries: readonly LayoutEntry[]): string[] =>
    entries.flatMap((entry) => {
      const ref = refOf(entry);
      if (entry.field === undefined && !doc.things[ref]) {
        doc.things[ref] = {
          id: ref,
          name: blockName(entry.module) ?? fieldLabel(ref),
          kind: isLink(entry) ? 'link' : 'files',
          need: 'no',
          entry: written(entry),
        };
      }
      return doc.things[ref] ? [ref] : [];
    });
  const { layout } = shape;
  doc.zones.header = refs(layout.header);
  doc.zones.row = refs(layout.row);
  doc.zones.intake = refs(layout.intake);
  if (layout.sections) {
    doc.boxed = true;
    doc.sections = layout.sections.map((section, at) => ({
      id: `s${at}`,
      title: section.title,
      width: section.width ?? 'full',
      entries: refs(section.entries),
    }));
    doc.zones.side = refs(layout.side);
    return doc;
  }
  // No sections: Brief is the evidence and the body, Structure the relations of the body and the
  // side. The file keeps its own shape until a box changes.
  const brief = [...refs(layout.evidence), ...refs(layout.body.filter((e) => !isLink(e)))];
  const structure = refs([...layout.body, ...layout.side].filter(isLink));
  doc.zones.side = refs(layout.side.filter((e) => !isLink(e)));
  doc.sections = [{ id: 'brief', title: 'Brief', width: 'full', entries: brief }];
  if (structure.length > 0)
    doc.sections.push({ id: 'structure', title: 'Structure', width: 'full', entries: structure });
  return doc;
}

// The type's layout, plus every block it does not use yet, unplaced and ready to be dragged in.
export function docOf(preset: Preset, type: string): Doc {
  const doc = readDoc(preset, type);
  if (!preset.types.some(({ name }) => name === type)) return doc;
  const present = new Set(Object.values(doc.things).map((thing) => blockOf(thing)));
  for (const { module } of BLOCKS) {
    if (present.has(module)) continue;
    let id = module;
    for (let n = 2; doc.things[id]; n += 1) id = `${module}-${n}`;
    const link = module === 'relations' || module === 'children';
    doc.things[id] = {
      id,
      name: blockName(module) ?? id,
      kind: link ? 'link' : 'files',
      need: 'no',
      entry: link ? { module } : { module, id },
    };
  }
  return doc;
}

export type Home = { zone: 'header' | 'side' } | { section: number };

export function homeOf(doc: Doc, id: string): Home | undefined {
  for (const zone of ['header', 'side'] as const) if (doc.zones[zone].includes(id)) return { zone };
  const section = doc.sections.findIndex((box) => box.entries.includes(id));
  return section >= 0 ? { section } : undefined;
}

const homeKey = (doc: Doc, home: Home | undefined): string =>
  !home ? '' : 'zone' in home ? home.zone : (doc.sections[home.section]?.id ?? '');

export function homeWord(doc: Doc, home: Home): string {
  return 'zone' in home ? zoneWord(home.zone) : (doc.sections[home.section]?.title ?? 'a box');
}

const WORD: Record<Zone | 'section', string> = {
  header: 'Under the title',
  section: 'a box',
  side: 'Details',
  row: 'the List row',
  intake: 'the New item form',
};
export const zoneWord = (zone: Zone | 'section') => WORD[zone];

// Why a thing cannot land in a zone, or nothing when it can: small values go anywhere, long text,
// files and links need a box.
export function refusal(kind: Kind, zone: Zone | 'section' | 'panel'): string | undefined {
  if (zone === 'panel' || zone === 'section') return undefined;
  if (zone === 'intake')
    return kind === 'files' || kind === 'link' ? 'The form only asks for fields' : undefined;
  if (zone === 'row') {
    if (kind === 'long') return 'Long text does not fit in a row';
    return kind === 'files' || kind === 'link' ? 'A row only shows small values' : undefined;
  }
  if (kind === 'files') return 'Files need room: they go in a box';
  if (kind === 'link') return 'Links to other items go in a box';
  if (kind === 'long') return 'Long text needs room: it goes in a box';
  return undefined;
}

// Where to put a thing: a zone, a box (by its position) or back on the panel.
export type Drop = { zone: Zone | 'section' | 'panel'; index: number; section?: number };

function drop(list: string[], id: string) {
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1);
}

const leaveDetail = (doc: Doc, id: string) => {
  drop(doc.zones.header, id);
  drop(doc.zones.side, id);
  for (const box of doc.sections) drop(box.entries, id);
};

// Moves a thing to a place, or hides it on the panel. Within the detail it leaves its other places
// (the form, the row) alone. `index` is where it lands once it has left its old place.
export function move(doc: Doc, id: string, to: Drop): { doc: Doc; refused?: string } {
  const thing = doc.things[id];
  if (!thing) return { doc };
  const why = refusal(thing.kind, to.zone);
  if (why) return { doc, refused: why };
  const next = clone(doc);
  const box = to.zone === 'section' ? next.sections[to.section ?? 0] : undefined;
  if (to.zone === 'section' && !box) return { doc };
  const was = homeOf(doc, id);
  if (to.zone === 'panel' || to.zone === 'section' || to.zone === 'header' || to.zone === 'side')
    leaveDetail(next, id);
  else drop(next.zones[to.zone], id);
  if (to.zone !== 'panel') {
    const list = box ? box.entries : next.zones[to.zone as Zone];
    list.splice(Math.max(0, Math.min(to.index, list.length)), 0, id);
  }
  if (!next.boxed) {
    const deep = (at: number | undefined) => at !== undefined && at >= 1;
    const kinds = (next.sections[0]?.entries ?? []).map((each) => next.things[each]?.kind);
    // The file keeps evidence apart from the body, so files after a field need sections.
    const interleaved =
      kinds.findIndex((k) => k !== 'files') >= 0 &&
      kinds.lastIndexOf('files') > kinds.findIndex((k) => k !== 'files');
    if (
      thing.kind === 'link' ||
      deep(was && 'section' in was ? was.section : undefined) ||
      deep(to.zone === 'section' ? (to.section ?? 0) : undefined) ||
      interleaved
    )
      next.boxed = true;
  }
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
  zone: Zone | 'section' = 'section',
  section = 0,
): { doc: Doc; id: string } {
  const next = clone(doc);
  const base = keyOf(name);
  let id = base;
  let n = 2;
  while (next.things[id]) id = `${base}_${n++}`;
  next.things[id] = { id, name: name.trim(), kind, need: 'no' };
  const list = zone === 'section' ? next.sections[section]?.entries : next.zones[zone];
  list?.push(id);
  return { doc: next, id };
}

export function deleteField(doc: Doc, id: string): Doc {
  const next = clone(doc);
  delete next.things[id];
  leaveDetail(next, id);
  drop(next.zones.row, id);
  drop(next.zones.intake, id);
  return next;
}

export const unplaced = (doc: Doc): Thing[] =>
  Object.values(doc.things).filter(
    (thing) =>
      blockOf(thing) === undefined &&
      !ZONES.some((zone) => doc.zones[zone].includes(thing.id)) &&
      !doc.sections.some((box) => box.entries.includes(thing.id)),
  );

// A view of the type the builder shows: the detail, the List row or the New item form.
export type Facet = 'detail' | 'row' | 'intake';

export const shown = (doc: Doc, id: string, facet: Facet): boolean =>
  facet === 'detail' ? homeOf(doc, id) !== undefined : doc.zones[facet].includes(id);

// Takes a thing out of the view being edited and out of no other.
export function hide(doc: Doc, id: string, facet: Facet): { doc: Doc; refused?: string } {
  const thing = doc.things[id];
  if (!thing) return { doc };
  if (facet === 'intake' && thing.need === 'create')
    return { doc, refused: `${thing.name} is needed to create, so the form must ask for it` };
  const next = clone(doc);
  if (facet === 'detail') leaveDetail(next, id);
  else drop(next.zones[facet], id);
  return { doc: next };
}

// ---- boxes
// The rows the boxes draw in: two consecutive half boxes share one, the first of them leading.
export function boxRows(sections: readonly Section[]): number[][] {
  const rows: number[][] = [];
  let open: number[] | undefined;
  sections.forEach((box, at) => {
    if (box.width === 'half' && open && open.length === 1) {
      open.push(at);
      open = undefined;
      return;
    }
    const row = [at];
    rows.push(row);
    open = box.width === 'half' ? row : undefined;
  });
  return rows;
}

// A half box with nothing beside it takes the whole width.
function heal(sections: Section[]) {
  for (const row of boxRows(sections)) {
    const only = row.length === 1 ? sections[row[0] as number] : undefined;
    if (only?.width === 'half') only.width = 'full';
  }
}

const boxedClone = (doc: Doc): Doc => ({ ...clone(doc), boxed: true });

export function addBox(doc: Doc, title: string): { doc: Doc; index: number } {
  const next = boxedClone(doc);
  let n = next.sections.length + 1;
  while (next.sections.some((box) => box.id === `b${n}`)) n += 1;
  next.sections.push({ id: `b${n}`, title: title.trim() || 'New box', width: 'full', entries: [] });
  return { doc: next, index: next.sections.length - 1 };
}

export function renameBox(doc: Doc, index: number, title: string): Doc {
  const box = doc.sections[index];
  if (!box || !title.trim() || title.trim() === box.title) return doc;
  const next = boxedClone(doc);
  (next.sections[index] as Section).title = title.trim();
  return next;
}

// `to` is where the box lands once it has left its place. It takes the whole width.
export function moveBox(doc: Doc, from: number, to: number): Doc {
  if (from === to || !doc.sections[from]) return doc;
  const next = boxedClone(doc);
  const [box] = next.sections.splice(from, 1) as [Section];
  box.width = 'full';
  heal(next.sections);
  next.sections.splice(Math.max(0, Math.min(to, next.sections.length)), 0, box);
  heal(next.sections);
  return next;
}

export function removeBox(doc: Doc, index: number): Doc {
  if (!doc.sections[index]) return doc;
  const next = boxedClone(doc);
  next.sections.splice(index, 1);
  heal(next.sections);
  return next;
}

// Lifts a box out of where it is and sets it down right after `target`, both half width.
export function dropBeside(doc: Doc, from: number, target: number): { doc: Doc; refused?: string } {
  if (from === target || !doc.sections[from] || !doc.sections[target]) return { doc };
  const next = boxedClone(doc);
  const [box] = next.sections.splice(from, 1) as [Section];
  const other = next.sections[target > from ? target - 1 : target] as Section;
  heal(next.sections);
  const row = boxRows(next.sections).find((each) => each.includes(next.sections.indexOf(other)));
  if (!row || row.length > 1) return { doc, refused: `${other.title} already has a box beside it` };
  box.width = 'half';
  other.width = 'half';
  next.sections.splice(next.sections.indexOf(other) + 1, 0, box);
  return { doc: next };
}

// Beside the previous box, or on a row of its own again.
export function setBeside(doc: Doc, index: number, on: boolean): { doc: Doc; refused?: string } {
  const box = doc.sections[index];
  if (!box) return { doc };
  if (!on) {
    if (box.width === 'full') return { doc };
    const next = boxedClone(doc);
    (next.sections[index] as Section).width = 'full';
    heal(next.sections);
    return { doc: next };
  }
  if (index === 0) return { doc, refused: 'The first box has nothing before it to sit beside' };
  return dropBeside(doc, index, index - 1);
}

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
    const there = to ? homeWord(doc, to) : undefined;
    if (!was) say(`New field ${now.name}${there ? ` in ${there}` : ''}`, 'new');
    else if (homeKey(base, from) !== homeKey(doc, to)) {
      if (from && to) say(`${now.name} moved from ${homeWord(base, from)} to ${there}`, 'move');
      else if (to) say(`${now.name} now shows in ${there}`, 'new');
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
  for (const box of doc.sections) {
    const old = base.sections.find(({ id }) => id === box.id);
    if (!old) say(`New box ${box.title}`, 'new');
    else {
      if (old.title !== box.title) say(`Box ${old.title} is now called ${box.title}`);
      if (shuffled(old.entries, box.entries)) say(`Order changed in ${box.title}`, 'move');
    }
  }
  for (const old of base.sections)
    if (!doc.sections.some(({ id }) => id === old.id)) say(`Box ${old.title} removed`, 'gone');
  const same = (a: Section[], b: Section[]) =>
    shuffled(
      a.map(({ id }) => id),
      b.map(({ id }) => id),
    );
  if (same(base.sections, doc.sections)) say('Boxes in a new order', 'move');
  const pairs = (d: Doc) =>
    boxRows(d.sections)
      .filter((row) => row.length === 2)
      .map((row) => row.map((at) => d.sections[at]?.id).join('+'));
  const paired = pairs(base);
  for (const row of boxRows(doc.sections)) {
    if (row.length !== 2) continue;
    const [a, b] = row.map((at) => doc.sections[at]) as [Section, Section];
    if (!paired.includes(`${a.id}+${b.id}`))
      say(`${a.title} and ${b.title} now sit side by side`, 'move');
  }
  for (const row of boxRows(base.sections)) {
    if (row.length !== 2) continue;
    const [a, b] = row.map((at) => base.sections[at]) as [Section, Section];
    if (!pairs(doc).includes(`${a.id}+${b.id}`)) {
      for (const each of [a, b]) {
        const now = doc.sections.find(({ id }) => id === each.id);
        if (now?.width === 'full') say(`${now.title} takes the whole width again`, 'move');
      }
    }
  }
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
      if (!base.zones[zone].includes(id) && doc.things[id])
        say(`${more} ${doc.things[id].name}`, 'new');
    for (const id of base.zones[zone])
      if (!doc.zones[zone].includes(id) && base.things[id])
        say(`${less} ${base.things[id].name}`, 'hidden');
  }
  return out;
}

// ---- back to the file
const entryOf = (doc: Doc, id: string): unknown => doc.things[id]?.entry ?? id;

// A relation the file keeps in a slot of its own while the boxes are only a view of it goes back
// where it was.
function withLinks(original: readonly LayoutEntry[], entries: unknown[]): unknown[] {
  const result = [...entries];
  original.forEach((entry, at) => {
    if (isLink(entry)) result.splice(Math.min(at, result.length), 0, written(entry));
  });
  return result;
}

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
    if (!was) {
      // A language that labels the preset labels every field: the new one starts with its typed name.
      const labels = (rawOf(next) as { labels?: Record<string, { fields?: object }> }).labels ?? {};
      for (const language of Object.keys(labels))
        next = setIn(next, ['labels', language, 'fields', id], thing.name);
    }
  }
  const layout = preset?.types.find(({ name }) => name === type)?.layout;
  const at = (slot: string) => [...layoutPath(rawOf(next), type), slot];
  const differ = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  const migrating = doc.boxed && !base.boxed;
  if (doc.boxed) {
    if (migrating) {
      // A preset with no layout of its own has no body or evidence to remove.
      const raw = rawOf(next);
      const own = layoutPath(raw, type).reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[String(key)],
        raw,
      ) as Record<string, unknown> | undefined;
      for (const slot of ['body', 'evidence'])
        if (own && slot in own) next = setIn(next, at(slot), undefined);
    }
    if (migrating || differ(base.sections, doc.sections)) {
      const sections = doc.sections.map((box) => ({
        title: box.title,
        ...(box.width === 'half' ? { width: 'half' } : {}),
        entries: box.entries.map((id) => entryOf(doc, id)),
      }));
      next = setIn(next, at('sections'), sections);
    }
  } else {
    // Only fields moved within Brief: the file keeps its body and evidence.
    const ids = (d: Doc, files: boolean) =>
      (d.sections[0]?.entries ?? []).filter((id) => (d.things[id]?.kind === 'files') === files);
    if (differ(ids(base, false), ids(doc, false)))
      next = setIn(
        next,
        at('body'),
        withLinks(
          layout?.body ?? [],
          ids(doc, false).map((id) => entryOf(doc, id)),
        ),
      );
    if (differ(ids(base, true), ids(doc, true)))
      next = setIn(
        next,
        at('evidence'),
        ids(doc, true).map((id) => entryOf(doc, id)),
      );
  }
  for (const zone of ZONES) {
    const sideHadLinks = zone === 'side' && migrating && (layout?.side ?? []).some(isLink);
    if (!differ(base.zones[zone], doc.zones[zone]) && !sideHadLinks) continue;
    const entries = doc.zones[zone].map((id) => entryOf(doc, id));
    const kept = zone === 'side' && !doc.boxed ? withLinks(layout?.side ?? [], entries) : entries;
    next = setIn(next, at(zone), kept);
  }
  return next;
}
