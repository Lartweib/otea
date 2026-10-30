import { z } from 'zod';
import { type EvidenceKind, evidenceTypeOf } from './evidence.ts';
import type { FieldSpec } from './preset.ts';

export const FIELD_MODULES = ['text', 'markdown', 'enum', 'severity'] as const;

// The severity module's fixed scale, from least to most severe: levels 1 to 4, in that order.
export const SEVERITY_SCALE = ['low', 'medium', 'high', 'critical'] as const;

export type FieldModule = (typeof FIELD_MODULES)[number];

export const EVIDENCE_MODULES = ['images', 'recording', 'diff', 'log'] as const;

export type EvidenceModule = (typeof EVIDENCE_MODULES)[number];

// Reserved modules validate in a layout today; their components come later and draw nothing yet.
export const RESERVED_MODULES = [
  'questions',
  'rounds',
  'relations',
  'children',
  'score',
  'options',
  'diagram',
] as const;

export type ReservedModule = (typeof RESERVED_MODULES)[number];

export type ModuleKind = FieldModule | EvidenceModule | ReservedModule;

export type ModuleFamily = 'field' | 'evidence' | 'reserved';

// Where a type's layout places things: the item detail (header, evidence, body, side), the list row,
// the phone detail and the create form (intake).
export const LAYOUT_SLOTS = [
  'header',
  'evidence',
  'body',
  'side',
  'row',
  'phone',
  'intake',
] as const;

export type LayoutSlot = (typeof LAYOUT_SLOTS)[number];

// One placed module. Field modules name the field they draw; evidence modules say what they accept,
// and carry an id that names them to `otea attach --module` (their module kind unless declared).
export type LayoutEntry = {
  module: ModuleKind;
  id?: string;
  field?: string;
  variant?: string;
  accepts?: string[];
  required?: boolean;
  label?: string;
};

export type Layout = Record<LayoutSlot, LayoutEntry[]>;

// `accepts` is the evidence an evidence module draws: a list of file kinds or extensions.
export type ModuleSpec = {
  family: ModuleFamily;
  slots: readonly LayoutSlot[];
  config: z.ZodType<LayoutEntry>;
  accepts?: readonly EvidenceKind[];
};

const label = z.string().min(1).optional();

const ID = /^[a-z][a-z0-9-]*$/;

const id = z
  .string()
  .regex(ID, 'ids are lowercase letters, digits and dashes, starting with a letter')
  .optional();

const fieldConfig = z.strictObject({ module: z.string(), field: z.string(), label });

function evidenceConfig(variants?: readonly [string, ...string[]]) {
  return z.strictObject({
    module: z.string(),
    id,
    ...(variants ? { variant: z.enum(variants).optional() } : {}),
    accepts: z.array(z.string()).nonempty().optional(),
    required: z.boolean().optional(),
    label,
  });
}

const reservedConfig = z.strictObject({ module: z.string(), label });

const FIELD_SLOTS: readonly LayoutSlot[] = ['header', 'body', 'side', 'row', 'phone', 'intake'];

const EVIDENCE_SLOTS: readonly LayoutSlot[] = ['evidence', 'body', 'side', 'phone'];

function field(): ModuleSpec {
  return { family: 'field', slots: FIELD_SLOTS, config: fieldConfig as z.ZodType<LayoutEntry> };
}

function evidence(
  accepts: readonly EvidenceKind[],
  variants?: readonly [string, ...string[]],
): ModuleSpec {
  const config = evidenceConfig(variants) as z.ZodType<LayoutEntry>;
  return { family: 'evidence', slots: EVIDENCE_SLOTS, config, accepts };
}

function reserved(...slots: LayoutSlot[]): ModuleSpec {
  return { family: 'reserved', slots, config: reservedConfig as z.ZodType<LayoutEntry> };
}

export const MODULE_REGISTRY: Readonly<Record<ModuleKind, ModuleSpec>> = {
  text: field(),
  markdown: field(),
  enum: field(),
  severity: field(),
  images: evidence(['image'], ['single', 'gallery', 'compare']),
  recording: evidence(['video'], ['player', 'frames']),
  diff: evidence(['diff']),
  log: evidence(['log']),
  questions: reserved('body', 'side', 'phone'),
  rounds: reserved('body', 'phone'),
  relations: reserved('body', 'side'),
  children: reserved('body', 'side'),
  score: reserved('header', 'side', 'row'),
  options: reserved('body', 'phone'),
  diagram: reserved('evidence', 'body'),
};

function isModule(name: string): name is ModuleKind {
  return Object.hasOwn(MODULE_REGISTRY, name);
}

export function moduleFamily(kind: ModuleKind): ModuleFamily {
  return MODULE_REGISTRY[kind].family;
}

function fieldEntries(fields: Record<string, FieldSpec>, skipTitle: boolean): LayoutEntry[] {
  return Object.entries(fields)
    .filter(([name]) => !skipTitle || name !== 'title')
    .map(([name, { module }]) => ({ module, field: name }));
}

// The layout of a type that declares none: what the UI drew before layouts existed. The detail shows
// every field in the body (the header already shows the title), so does the row, and the create
// form asks for every field.
export function defaultLayout(fields: Record<string, FieldSpec>): Layout {
  return {
    header: [],
    evidence: [],
    body: fieldEntries(fields, true),
    side: [],
    row: fieldEntries(fields, true),
    phone: [],
    intake: fieldEntries(fields, false),
  };
}

type Reading = { entry?: LayoutEntry; problems: string[] };

// What an `accepts` entry names: an evidence kind (`image`) or an extension (`png`, `.png`).
function acceptedKind(accept: string): EvidenceKind | undefined {
  const known: readonly string[] = ['image', 'video', 'diff', 'log'];
  if (known.includes(accept)) return accept as EvidenceKind;
  const { kind } = evidenceTypeOf(`file.${accept}`);
  return kind === 'file' ? undefined : kind;
}

function acceptsProblems(entry: LayoutEntry, spec: ModuleSpec, at: string): string[] {
  const family = spec.accepts ?? [];
  return (entry.accepts ?? []).flatMap((accept) => {
    const kind = acceptedKind(accept);
    if (kind === undefined)
      return [`${at}.accepts: "${accept}" is not a known file kind or extension`];
    if (family.includes(kind)) return [];
    return [
      `${at}.accepts: "${accept}" is a ${kind} file; the ${entry.module} module accepts ${family.join(', ')}`,
    ];
  });
}

// Evidence modules always carry their id, and their accepts in lowercase without the dot.
function normalized(entry: LayoutEntry, family: ModuleFamily): LayoutEntry {
  if (family !== 'evidence') return entry;
  const { module, id = module, ...rest } = entry;
  const accepts = entry.accepts?.map((accept) => accept.toLowerCase().replace(/^\./, ''));
  return { module, id, ...rest, ...(accepts ? { accepts } : {}) };
}

function readModule(
  value: Record<string, unknown>,
  fields: Record<string, FieldSpec>,
  at: string,
): Reading {
  const { module } = value;
  if (typeof module !== 'string' || !isModule(module)) {
    return { problems: [`${at}.module: unknown module "${String(module)}"`] };
  }
  const spec = MODULE_REGISTRY[module];
  const result = spec.config.safeParse(value);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${[at, ...issue.path.map(String)].join('.')}: ${issue.message}`,
    );
    return { problems };
  }
  const entry = normalized(result.data, spec.family);
  if (spec.family === 'field') {
    const name = entry.field ?? '';
    const declared = fields[name];
    if (!declared) return { problems: [`${at}.field: unknown field "${name}"`] };
    if (declared.module !== module) {
      return {
        problems: [
          `${at}.module: field "${name}" uses the ${declared.module} module, not ${module}`,
        ],
      };
    }
  }
  return { entry, problems: acceptsProblems(entry, spec, at) };
}

function readEntry(value: unknown, fields: Record<string, FieldSpec>, at: string): Reading {
  if (typeof value === 'string') {
    const declared = fields[value];
    if (!declared) return { problems: [`${at}: unknown field "${value}"`] };
    return { entry: { module: declared.module, field: value }, problems: [] };
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return readModule(value as Record<string, unknown>, fields, at);
  }
  return { problems: [`${at}: must be a field name or { module: <kind>, ... }`] };
}

// Where each evidence module id is first placed, across the slots of a layout.
type Ids = Map<string, string>;

function idProblems(entry: LayoutEntry, ids: Ids, where: string, place: string): string[] {
  if (entry.id === undefined) return [];
  const first = ids.get(entry.id);
  if (first === undefined) {
    ids.set(entry.id, place);
    return [];
  }
  return [
    `${where}.id: "${entry.id}" already names ${first}; give each ${entry.module} module its own id`,
  ];
}

function readSlot(
  slot: LayoutSlot,
  value: unknown,
  fields: Record<string, FieldSpec>,
  at: string,
  ids: Ids,
): { entries: LayoutEntry[]; problems: string[] } {
  if (!Array.isArray(value)) return { entries: [], problems: [`${at}.${slot}: must be a list`] };
  const entries: LayoutEntry[] = [];
  const problems: string[] = [];
  const placed = new Set<string>();
  value.forEach((item: unknown, index) => {
    const where = `${at}.${slot}[${index}]`;
    const { entry, problems: found } = readEntry(item, fields, where);
    problems.push(...found);
    if (!entry) return;
    const { slots } = MODULE_REGISTRY[entry.module];
    if (!slots.includes(slot)) {
      problems.push(
        `${where}: the ${entry.module} module cannot sit in ${slot} (slots: ${slots.join(', ')})`,
      );
    }
    problems.push(...idProblems(entry, ids, where, `${slot}[${index}]`));
    if (entry.field !== undefined) {
      if (placed.has(entry.field))
        problems.push(`${where}: field "${entry.field}" is already in ${slot}`);
      placed.add(entry.field);
    }
    entries.push(entry);
  });
  return { entries, problems };
}

function intakeProblems(
  intake: LayoutEntry[],
  fields: Record<string, FieldSpec>,
  at: string,
): string[] {
  const asked = new Set(intake.map(({ field }) => field));
  return Object.entries(fields)
    .filter(([name, { required }]) => required === 'create' && !asked.has(name))
    .map(([name]) => `${at}.intake: missing field "${name}", required to create`);
}

// Reads a type's `layout`: every slot it declares, in order, and the default for the slots it leaves
// out. `at` is the layout's path in the preset, for the problems found.
export function readLayout(
  raw: unknown,
  fields: Record<string, FieldSpec>,
  at: string,
): { layout: Layout; problems: string[] } {
  const layout = defaultLayout(fields);
  if (raw === undefined) return { layout, problems: [] };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { layout, problems: [`${at}: must be a map of slots`] };
  }
  const problems: string[] = [];
  const ids: Ids = new Map();
  for (const [slot, value] of Object.entries(raw)) {
    if (!(LAYOUT_SLOTS as readonly string[]).includes(slot)) {
      problems.push(`${at}.${slot}: unknown slot (slots: ${LAYOUT_SLOTS.join(', ')})`);
      continue;
    }
    const read = readSlot(slot as LayoutSlot, value, fields, at, ids);
    layout[slot as LayoutSlot] = read.entries;
    problems.push(...read.problems);
  }
  if ('intake' in raw) problems.push(...intakeProblems(layout.intake, fields, at));
  return { layout, problems };
}
