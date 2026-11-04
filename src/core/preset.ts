import { parse } from 'yaml';
import { z } from 'zod';
import { OteaError } from './errors.ts';
import { closeNames, iconProblem } from './icons.ts';
import {
  FIELD_MODULES,
  type FieldModule,
  type Layout,
  readLayout,
  SEVERITY_SCALE,
} from './modules.ts';
import { type Labels, labelProblems, labelsSchema, typeLabels } from './preset-labels.ts';
import { type PresetNote, presetNotes } from './preset-notes.ts';
import {
  AUTHORITIES,
  CLOSINGS,
  REQUIREMENTS,
  type State,
  type Transition,
  TURNS,
  type Workflow,
} from './workflow.ts';

export { FIELD_MODULES, type FieldModule, SEVERITY_SCALE } from './modules.ts';
export type { Labels, TypeLabels } from './preset-labels.ts';
export type { PresetNote, PresetNoteCode, PresetPath, PresetSection } from './preset-notes.ts';

export type FieldRequirement = 'create' | 'complete';

export type FieldSpec = {
  module: FieldModule;
  required?: FieldRequirement;
  values?: string[];
  default?: string;
};

// The type of a preset that declares no `types`: every item of it.
export const DEFAULT_TYPE = 'item';

// An item type: the preset's shared fields plus its own, its own workflow or the preset's, how its
// items are laid out, the icon drawn beside them (none when the preset gives it none) and its own
// playbook, read before the preset's. `children` and `root` are set only in a preset that declares a
// hierarchy: the types that may hang under it with parent, and whether it may live with no parent.
// `labels`, its words in the other languages its preset speaks, only when the preset gives them.
export type ItemType = {
  name: string;
  label: string;
  icon?: string;
  fields: Record<string, FieldSpec>;
  workflow: Workflow;
  layout: Layout;
  playbook?: string;
  children?: string[];
  root?: boolean;
  labels?: Labels;
};

// What field rules and workflows are checked against: a type, or a preset read as its only type.
export type Shape = { fields: Record<string, FieldSpec>; workflow: Workflow };

export const VIEW_KINDS = ['list', 'board', 'grid'] as const;

export type ViewKind = (typeof VIEW_KINDS)[number];

// The columns of the grid that every collection can draw, beside its fields.
export const BUILT_IN_COLUMNS = ['id', 'title', 'state', 'type', 'who', 'age'] as const;

// How a collection lists its items. groupBy is turn, state, type or an enum or severity field;
// columns are what the grid shows, in order: built-in columns and one-line fields (enum, severity,
// text), the preset's own or, without them, id, title, the row slot's one-line fields, state, who
// and age.
export type CollectionLayout = { kind: ViewKind; groupBy: string; columns: string[] };

// `icon` is the icon of the collections built from the preset (they may override it): the
// preset's own top-level `icon`, or else the icon of its first root type, when that type has one.
export type Preset = {
  name: string;
  version: number;
  icon?: string;
  playbook?: string;
  fields: Record<string, FieldSpec>;
  workflow: Workflow;
  types: ItemType[];
  view: CollectionLayout;
};

// A preset that reads may still carry notes: what it should look at, never what stops it loading.
// `notes` carry a code and a path to the part they are about; `warnings` are the messages of the
// warning-level ones, as they always read.
export type PresetReading =
  | { ok: true; preset: Preset; warnings: string[]; notes: PresetNote[] }
  | { ok: false; problems: string[] };

// `playbooks`, the texts of the preset's playbooks by path, let the reading check its gates.
export type ReadOptions = { playbooks?: Readonly<Record<string, string>> };

const NAME = /^[a-z0-9][a-z0-9-]*$/;
const KEY = /^[a-z][a-z0-9_]*$/;

const fieldSchema = z.strictObject({
  module: z.string(),
  required: z.enum(['create', 'complete']).optional(),
  values: z.array(z.string()).nonempty().optional(),
  default: z.string().optional(),
});

const fieldsSchema = z.record(z.string().regex(KEY, 'field names must be snake_case'), fieldSchema);

const transitionSchema = z.strictObject({
  from: z.union([z.string(), z.array(z.string()).nonempty()]),
  to: z.string(),
  by: z.enum(AUTHORITIES),
  reason: z.literal('required').optional(),
});

const workflowSchema = z.strictObject({
  initial: z.string(),
  incomplete: z.string().optional(),
  states: z.record(
    z.string().regex(KEY, 'state names must be snake_case'),
    z.strictObject({
      turn: z.enum(TURNS),
      closes: z.enum(CLOSINGS).optional(),
      // One requirement, or a list of them: requires: [children_closed, blockers_closed].
      requires: z
        .union([z.enum(REQUIREMENTS), z.array(z.enum(REQUIREMENTS)).nonempty()])
        .optional(),
      // Deprecated: the former name of requires, read with the same meaning.
      close_requires: z.enum(REQUIREMENTS).optional(),
    }),
  ),
  transitions: z.array(transitionSchema),
  gates: z
    .record(
      z.string().regex(KEY, 'gate actions must be snake_case'),
      z.array(z.string()).nonempty(),
    )
    .optional(),
});

// Layouts are read by the module registry, which reports their problems by slot and position.
const layoutSchema = z.unknown();

const typeSchema = z.strictObject({
  label: z.string().min(1),
  icon: z.string().optional(),
  fields: fieldsSchema.optional(),
  workflow: workflowSchema.optional(),
  layout: layoutSchema.optional(),
  playbook: z.string().optional(),
  children: z.array(z.string()).optional(),
  root: z.boolean().optional(),
});

const presetSchema = z.strictObject({
  preset: z.string().regex(NAME, 'must be lowercase letters, digits and dashes'),
  preset_version: z.int().positive(),
  playbook: z.string().optional(),
  fields: fieldsSchema,
  workflow: workflowSchema,
  types: z.record(z.string().regex(KEY, 'type names must be snake_case'), typeSchema).optional(),
  // The layout of the implicit type, in a preset without types.
  layout: layoutSchema.optional(),
  // The preset's icon, given to its collections; in a preset without types, also the implicit
  // type's.
  icon: z.string().optional(),
  view: z
    .strictObject({
      kind: z.enum(VIEW_KINDS).optional(),
      group_by: z.string().optional(),
      columns: z.array(z.string()).nonempty().optional(),
    })
    .optional(),
  labels: labelsSchema.optional(),
});

type RawPreset = z.infer<typeof presetSchema>;
type RawField = z.infer<typeof fieldSchema>;
type RawFields = Record<string, RawField>;
type RawWorkflow = z.infer<typeof workflowSchema>;
type RawTypes = Record<string, z.infer<typeof typeSchema>>;

function isModule(module: string): module is FieldModule {
  return (FIELD_MODULES as readonly string[]).includes(module);
}

function fieldProblems(at: string, field: RawField): string[] {
  const problems: string[] = [];
  if (!isModule(field.module)) {
    problems.push(
      `${at}.module: unknown module "${field.module}" (official: ${FIELD_MODULES.join(', ')})`,
    );
  }
  if (field.module === 'enum' && !field.values) {
    problems.push(`${at}.values: required by the enum module`);
  }
  if (field.module !== 'enum' && field.values) {
    problems.push(`${at}.values: only the enum module takes values`);
  }
  const values = valuesOf(field);
  if (values && field.default !== undefined && !values.includes(field.default)) {
    problems.push(`${at}.default: "${field.default}" is not one of ${values.join(', ')}`);
  }
  return problems;
}

function fieldsProblems(at: string, fields: RawFields): string[] {
  return Object.entries(fields).flatMap(([name, field]) => fieldProblems(`${at}.${name}`, field));
}

// The values a field may take: an enum's own, or the severity scale.
function valuesOf(field: RawField): string[] | undefined {
  return field.module === 'severity' ? [...SEVERITY_SCALE] : field.values;
}

function titleProblems(title: RawField | undefined): string[] {
  if (!title) return ['fields.title: missing; every preset needs a title field'];
  const problems: string[] = [];
  if (title.module !== 'text') problems.push('fields.title: must use the text module');
  if (title.required !== 'create') problems.push('fields.title: must be required: create');
  return problems;
}

function expand(workflow: RawWorkflow): Transition[] {
  return workflow.transitions.flatMap(({ from, to, by, reason }) =>
    [from]
      .flat()
      .map((source) => ({ from: source, to, by, reasonRequired: reason === 'required' })),
  );
}

function transitionProblems(at: string, workflow: RawWorkflow): string[] {
  const { states } = workflow;
  const problems: string[] = [];
  const seen = new Set<string>();
  workflow.transitions.forEach(({ from, to, by }, index) => {
    const where = `${at}.transitions.${index}`;
    for (const source of [from].flat()) {
      if (!(source in states)) problems.push(`${where}.from: unknown state "${source}"`);
      const key = JSON.stringify([source, to, by]);
      if (seen.has(key))
        problems.push(`${where}: duplicate transition "${source}" -> "${to}" by ${by}`);
      seen.add(key);
      if (source === to) problems.push(`${where}: "${source}" -> "${to}" does not change state`);
      // Agents never approve their own work: only a human may close an item as done.
      if (by === 'agent' && states[to]?.closes === 'done') {
        problems.push(
          `${where}: an agent cannot close an item as done ("${source}" -> "${to}"); use human or human-ui`,
        );
      }
    }
    if (!(to in states)) problems.push(`${where}.to: unknown state "${to}"`);
  });
  return problems;
}

function reachable(entries: string[], transitions: Transition[]): Set<string> {
  const reached = new Set(entries);
  const pending = [...entries];
  for (let state = pending.pop(); state !== undefined; state = pending.pop()) {
    for (const { from, to } of transitions) {
      if (from === state && !reached.has(to)) {
        reached.add(to);
        pending.push(to);
      }
    }
  }
  return reached;
}

function stateProblems(at: string, workflow: RawWorkflow, transitions: Transition[]): string[] {
  const { initial, incomplete, states } = workflow;
  const problems: string[] = [];
  if (!(initial in states)) problems.push(`${at}.initial: unknown state "${initial}"`);
  if (incomplete !== undefined && !(incomplete in states)) {
    problems.push(`${at}.incomplete: unknown state "${incomplete}"`);
  }
  if (incomplete === initial) problems.push(`${at}.incomplete: must differ from initial`);
  const entries = [initial, incomplete ?? initial].filter((entry) => entry in states);
  const reached = reachable(entries, transitions);
  for (const [name, { turn, closes, requires, close_requires }] of Object.entries(states)) {
    const where = `${at}.states.${name}`;
    const leaves = transitions.some(({ from }) => from === name);
    if (entries.length > 0 && !reached.has(name)) {
      problems.push(`${where}: not reachable from the initial or incomplete state`);
    }
    if (turn === 'none' && leaves)
      problems.push(`${where}: has turn none but outgoing transitions`);
    if (turn !== 'none' && !leaves) {
      problems.push(`${where}: has turn ${turn} but no outgoing transitions`);
    }
    if (turn === 'none' && closes === undefined) {
      problems.push(`${where}.closes: required on a state with turn none (done or discarded)`);
    }
    if (turn !== 'none' && closes !== undefined) {
      problems.push(`${where}.closes: only a state with turn none closes`);
    }
    if (requires !== undefined && close_requires !== undefined) {
      problems.push(`${where}: declares both requires and close_requires; keep requires`);
    }
    if (Array.isArray(requires)) {
      requires.forEach((requirement, index) => {
        if (requires.indexOf(requirement) !== index) {
          problems.push(`${where}.requires[${index}]: "${requirement}" is listed twice`);
        }
      });
    }
  }
  return problems;
}

// close_requires still reads, as requires, but each use is reported until it is renamed.
function workflowWarnings(at: string, workflow: RawWorkflow, type?: string): PresetNote[] {
  return Object.entries(workflow.states)
    .filter(([, state]) => state.close_requires !== undefined && state.requires === undefined)
    .map(([name, state]) => ({
      code: 'deprecated_key',
      level: 'warning',
      message: `${at}.states.${name}.close_requires: deprecated; write requires: ${state.close_requires}`,
      path: { section: 'states', ...(type ? { type } : {}), state: name },
    }));
}

function presetWarnings(raw: RawPreset): PresetNote[] {
  const typed = Object.entries(raw.types ?? {}).flatMap(([name, { workflow }]) =>
    workflow ? workflowWarnings(`types.${name}.workflow`, workflow, name) : [],
  );
  return [...workflowWarnings('workflow', raw.workflow), ...typed];
}

// Each gate lists states of its workflow, each once.
function gateProblems(at: string, workflow: RawWorkflow): string[] {
  return Object.entries(workflow.gates ?? {}).flatMap(([action, states]) =>
    states.flatMap((state, index) => {
      const where = `${at}.gates.${action}[${index}]`;
      if (!(state in workflow.states)) return [`${where}: unknown state "${state}"`];
      if (states.indexOf(state) !== index) return [`${where}: "${state}" is listed twice`];
      return [];
    }),
  );
}

function workflowProblems(at: string, workflow: RawWorkflow): string[] {
  const transitions = expand(workflow);
  return [
    ...transitionProblems(at, workflow),
    ...stateProblems(at, workflow, transitions),
    ...gateProblems(at, workflow),
  ];
}

// A field required to complete needs an incomplete state to start in. `of` names the type when the
// workflow is the preset's but the field is the type's own.
function incompleteProblems(
  at: string,
  workflow: RawWorkflow,
  fields: RawFields,
  of = '',
): string[] {
  if (workflow.incomplete !== undefined) return [];
  return Object.entries(fields)
    .filter(([, field]) => field.required === 'complete')
    .map(([name]) => `${at}.incomplete: missing, but field "${name}"${of} is required: complete`);
}

function toField(field: RawField): FieldSpec {
  const spec: FieldSpec = { module: field.module as FieldModule };
  if (field.required) spec.required = field.required;
  const values = valuesOf(field);
  if (values) spec.values = [...values];
  if (field.default !== undefined) spec.default = field.default;
  return spec;
}

function toFields(fields: RawFields): Record<string, FieldSpec> {
  return Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, toField(field)]));
}

function toWorkflow(name: string, raw: RawWorkflow): Workflow {
  const states = Object.entries(raw.states).map(([state, declared]) => {
    const { turn, closes } = declared;
    const spec: State = { name: state, turn };
    if (closes !== undefined) spec.closes = closes;
    const requires = declared.requires ?? declared.close_requires;
    if (typeof requires === 'string') spec.requires = [requires];
    else if (requires !== undefined) spec.requires = [...requires];
    return spec;
  });
  const workflow: Workflow = { name, initial: raw.initial, states, transitions: expand(raw) };
  if (raw.incomplete !== undefined) workflow.incomplete = raw.incomplete;
  if (raw.gates !== undefined) workflow.gates = raw.gates;
  return workflow;
}

type TypeReading = { types: ItemType[]; problems: string[] };

// A preset declares a hierarchy once one of its types lists children.
function declaresHierarchy(types: RawTypes): boolean {
  return Object.values(types).some(({ children }) => children !== undefined);
}

function childProblems(types: RawTypes): string[] {
  const names = Object.keys(types);
  return Object.entries(types).flatMap(([name, { children = [] }]) =>
    children.flatMap((child, index) => {
      const at = `types.${name}.children[${index}]`;
      if (!names.includes(child))
        return [`${at}: unknown type "${child}" (types: ${names.join(', ')})`];
      if (children.indexOf(child) !== index) return [`${at}: "${child}" is listed twice`];
      return [];
    }),
  );
}

// Each loop once, from the first type it passes through in the order the preset declares them: a
// walk from a type goes only through the types declared after it, back to where it started.
function loopProblems(types: RawTypes): string[] {
  const names = Object.keys(types);
  const childrenOf = (name: string) =>
    (types[name]?.children ?? []).filter((child) => names.includes(child));
  const problems: string[] = [];
  names.forEach((start, first) => {
    const walk = (path: string[]) => {
      for (const child of new Set(childrenOf(path.at(-1) ?? start))) {
        if (child === start) {
          problems.push(`types.${start}.children: loop ${[...path, start].join(' -> ')}`);
        } else if (names.indexOf(child) > first && !path.includes(child)) {
          walk([...path, child]);
        }
      }
    };
    walk([start]);
  });
  return problems;
}

// A type that may not stand alone needs a type to hang under.
function rootProblems(types: RawTypes): string[] {
  return Object.entries(types)
    .filter(([, { root }]) => root === false)
    .filter(([name]) => !Object.values(types).some(({ children }) => children?.includes(name)))
    .map(([name]) => `types.${name}.root: false, but no type lists ${name} in its children`);
}

function hierarchyProblems(types: RawTypes): string[] {
  return [...childProblems(types), ...loopProblems(types), ...rootProblems(types)];
}

function iconProblems(at: string, icon: string | undefined): string[] {
  const problem = icon === undefined ? undefined : iconProblem(at, icon);
  return problem ? [problem] : [];
}

function implicitType(raw: RawPreset, fields: Record<string, FieldSpec>, workflow: Workflow) {
  const { layout, problems } = readLayout(raw.layout, fields, 'layout');
  const type: ItemType = { name: DEFAULT_TYPE, label: 'Item', fields, workflow, layout };
  if (raw.icon !== undefined) type.icon = raw.icon;
  return { types: [type], problems: [...problems, ...iconProblems('icon', raw.icon)] };
}

function readTypes(raw: RawPreset, fields: Record<string, FieldSpec>, workflow: Workflow) {
  const reading: TypeReading = { types: [], problems: [] };
  const declared = Object.entries(raw.types ?? {});
  if (declared.length === 0) reading.problems.push('types: declare at least one type');
  if (raw.layout !== undefined) {
    reading.problems.push('layout: declare the layout of each type under types.<type>.layout');
  }
  reading.problems.push(...iconProblems('icon', raw.icon));
  const hierarchy = declaresHierarchy(raw.types ?? {});
  reading.problems.push(...hierarchyProblems(raw.types ?? {}));
  for (const [name, type] of declared) {
    const at = `types.${name}`;
    const own = type.fields ?? {};
    for (const field of Object.keys(own)) {
      if (field in raw.fields)
        reading.problems.push(`${at}.fields.${field}: already declared by the preset`);
    }
    reading.problems.push(...fieldsProblems(`${at}.fields`, own));
    if (type.workflow) {
      reading.problems.push(...workflowProblems(`${at}.workflow`, type.workflow));
      reading.problems.push(
        ...incompleteProblems(`${at}.workflow`, type.workflow, { ...raw.fields, ...own }),
      );
    } else {
      reading.problems.push(
        ...incompleteProblems('workflow', raw.workflow, own, ` of type ${name}`),
      );
    }
    const typeFields = { ...fields, ...toFields(own) };
    const { layout, problems } = readLayout(type.layout, typeFields, `${at}.layout`);
    reading.problems.push(...problems, ...iconProblems(`${at}.icon`, type.icon));
    const read: ItemType = {
      name,
      label: type.label,
      fields: typeFields,
      workflow: type.workflow ? toWorkflow(`${raw.preset}:${name}`, type.workflow) : workflow,
      layout,
    };
    if (type.icon !== undefined) read.icon = type.icon;
    if (type.playbook !== undefined) read.playbook = type.playbook;
    if (hierarchy) {
      read.children = [...new Set(type.children ?? [])];
      read.root = type.root ?? true;
    }
    reading.types.push(read);
  }
  return reading;
}

const GROUPS = ['turn', 'state', 'type'];

// A column holds one line: a field of these modules can be one.
const ONE_LINE: readonly string[] = ['enum', 'severity', 'text'];

function moduleOf(types: ItemType[], name: string): FieldModule | undefined {
  return types.map((type) => type.fields[name]?.module).find((module) => module !== undefined);
}

// A grouping is turn, state, type, or a one-line field every type has (an enum, a severity, or
// free text, whose values come from the items); never the title, which every item has its own.
function groupProblems(groupBy: string, types: ItemType[]): string[] {
  if (GROUPS.includes(groupBy)) return [];
  if (groupBy === 'title') return ['view.group_by: title cannot group (every item has its own)'];
  if (types.every((type) => type.fields[groupBy])) {
    const module = types
      .map((type) => type.fields[groupBy]?.module ?? '')
      .find((name) => !ONE_LINE.includes(name));
    if (module === undefined) return [];
    return [
      `view.group_by: ${groupBy} is ${module}; only one-line fields group (enum, severity, text)`,
    ];
  }
  return [`view.group_by: "${groupBy}" is not turn, state, type or a one-line field of every type`];
}

// Without columns of its own, the grid shows the row slot's one-line fields between title and state.
function defaultColumns(types: ItemType[]): string[] {
  const row = types.flatMap((type) =>
    type.layout.row.flatMap(({ field }) =>
      field !== undefined && ONE_LINE.includes(type.fields[field]?.module ?? '') ? [field] : [],
    ),
  );
  return ['id', 'title', ...new Set(row), 'state', 'who', 'age'];
}

function columnProblems(columns: string[], types: ItemType[]): string[] {
  const fields = [...new Set(types.flatMap((type) => Object.keys(type.fields)))];
  const known: readonly string[] = BUILT_IN_COLUMNS;
  const problems = columns.flatMap((column, index) => {
    const at = `view.columns[${index}]`;
    if (columns.indexOf(column) !== index) return [`${at}: "${column}" is listed twice`];
    if (known.includes(column)) return [];
    const module = moduleOf(types, column);
    if (module === undefined) {
      const close = closeNames(column, [...known, ...fields]);
      const hint = close.length > 0 ? ` (did you mean ${close.join(', ')}?)` : '';
      return [`${at}: unknown column "${column}"${hint}`];
    }
    if (!ONE_LINE.includes(module))
      return [`${at}: ${column} is ${module}; a column holds one line`];
    return [];
  });
  if (!columns.includes('title')) problems.push('view.columns: title is always shown; list it');
  return problems;
}

function readView(raw: RawPreset, types: ItemType[]) {
  const declared = raw.view?.columns;
  const view: CollectionLayout = {
    kind: raw.view?.kind ?? 'list',
    groupBy: raw.view?.group_by ?? 'turn',
    columns: declared ?? defaultColumns(types),
  };
  const problems = [
    ...groupProblems(view.groupBy, types),
    ...(declared ? columnProblems(declared, types) : []),
  ];
  return { view, problems };
}

function parseYaml(text: string): { ok: true; value: unknown } | { ok: false; problem: string } {
  try {
    return { ok: true, value: parse(text) };
  } catch (error) {
    return { ok: false, problem: `invalid YAML: ${(error as Error).message.split('\n')[0]}` };
  }
}

export function readPreset(text: string, options: ReadOptions = {}): PresetReading {
  const yaml = parseYaml(text);
  if (!yaml.ok) return { ok: false, problems: [yaml.problem] };
  const result = presetSchema.safeParse(yaml.value);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, problems };
  }
  const raw = result.data;
  const fields = toFields(raw.fields);
  const workflow = toWorkflow(raw.preset, raw.workflow);
  const typed =
    raw.types === undefined
      ? implicitType(raw, fields, workflow)
      : readTypes(raw, fields, workflow);
  const { view, problems: viewProblems } = readView(raw, typed.types);
  for (const type of typed.types) {
    const labels = typeLabels(raw.labels, type);
    if (labels) type.labels = labels;
  }
  const problems = [
    ...titleProblems(raw.fields.title),
    ...fieldsProblems('fields', raw.fields),
    ...workflowProblems('workflow', raw.workflow),
    ...incompleteProblems('workflow', raw.workflow, raw.fields),
    ...typed.problems,
    ...viewProblems,
    ...labelProblems(raw.labels, typed.types, raw.types === undefined),
  ];
  if (problems.length > 0) return { ok: false, problems: [...new Set(problems)] };
  const preset: Preset = {
    name: raw.preset,
    version: raw.preset_version,
    fields,
    workflow,
    types: typed.types,
    view,
  };
  const icon = raw.icon ?? typed.types.find(({ root }) => root !== false)?.icon;
  if (icon !== undefined) preset.icon = icon;
  if (raw.playbook !== undefined) preset.playbook = raw.playbook;
  const notes = [...presetWarnings(raw), ...presetNotes(preset, options.playbooks)];
  const warnings = notes.filter(({ level }) => level === 'warning').map(({ message }) => message);
  return { ok: true, preset, warnings, notes };
}

export function parsePreset(text: string): Preset {
  const reading = readPreset(text);
  if (reading.ok) return reading.preset;
  throw new OteaError('invalid_preset', `Invalid preset: ${reading.problems.join('; ')}`);
}

function typeNames(preset: Preset): string {
  return preset.types.map(({ name }) => name).join(', ');
}

export function typeOf(preset: Preset, name: string): ItemType {
  const type = preset.types.find((candidate) => candidate.name === name);
  if (type) return type;
  throw new OteaError(
    'invalid_type',
    `Unknown type "${name}" in preset ${preset.name} (types: ${typeNames(preset)})`,
  );
}

// The type a new item takes: the one given, or the preset's only type.
export function typeFor(preset: Preset, name: string | undefined): ItemType {
  if (name !== undefined) return typeOf(preset, name);
  const [only, ...others] = preset.types;
  if (only && others.length === 0) return only;
  throw new OteaError(
    'invalid_type',
    `Preset ${preset.name} has several types; give one of: ${typeNames(preset)}`,
  );
}
