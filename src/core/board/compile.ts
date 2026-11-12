import { OteaError } from '../errors.ts';
import type { LayoutEntry } from '../modules.ts';
import { type Preset, readPreset } from '../preset.ts';
import { backTarget, backWaysOf, stateOf, waysOf } from './engine.ts';
import {
  type BoardDefinition,
  DONE,
  DROPPED,
  type EvidenceKind,
  guardedBranch,
  INITIAL_KINDS,
  isAgent,
  isEvidenceKind,
  LEVELS,
  MOTIVE,
  PARTS,
  type Part,
  partOf,
  ROUNDS,
  STEP,
  type Step,
  stepById,
  TITLE,
  usedRefs,
  type Zone,
} from './model.ts';
import { defaultZone, LANGS, type Lang } from './templates.ts';

// A published board version compiled into the preset the rest of Otea already reads (items, moves,
// leases, lanes, the item page): one type, `item`; a workflow state per step phase (stateOf); a
// field per field part and an evidence module per evidence part, all keyed by their hidden ids.
// The step engine stays the authority on handoffs; the compiled workflow only lets through the
// moves the engine can make, so no older path (otea move) can walk around it.

export const BOARD_TYPE = 'item';

const FIELD_MODULE: Readonly<Record<string, 'text' | 'markdown' | 'enum' | 'severity'>> = {
  text: 'text',
  long: 'markdown',
  check: 'text',
  choice: 'enum',
  multi: 'text',
  level: 'severity',
  number: 'text',
  date: 'text',
  yesno: 'enum',
  url: 'text',
  branch: 'text',
};

// Evidence kinds and the module that draws them; audio and other files are offered by files.
const EVIDENCE_MODULE: Readonly<Partial<Record<EvidenceKind, string>>> = {
  images: 'images',
  video: 'recording',
  code: 'diff',
  log: 'log',
  diagram: 'diagram',
  audio: 'files',
  file: 'files',
};

const VARIANT: Readonly<Record<string, string>> = {
  gallery: 'gallery',
  one: 'single',
  ba: 'compare',
  strip: 'frames',
  player: 'player',
};

const WORDS: Readonly<Record<Lang, Record<string, string>>> = {
  en: {
    done: 'Done',
    dropped: 'Dropped',
    yes: 'Yes',
    no: 'No',
    low: 'low',
    medium: 'medium',
    high: 'high',
    critical: 'critical',
  },
  es: {
    done: 'Hecho',
    dropped: 'Descartado',
    yes: 'Sí',
    no: 'No',
    low: 'baja',
    medium: 'media',
    high: 'alta',
    critical: 'crítica',
  },
};

type RawField = {
  module: string;
  required?: 'create';
  values?: string[];
  default?: string;
  label: string;
};

function fieldOf(part: Part, required: boolean): RawField {
  let module = FIELD_MODULE[part.kind] ?? 'text';
  const values =
    part.kind === 'yesno'
      ? ['yes', 'no']
      : part.kind === 'choice'
        ? part.options.map(({ id }) => id)
        : undefined;
  if (module === 'enum' && (values ?? []).length === 0) module = 'text';
  return {
    module,
    ...(required ? { required: 'create' as const } : {}),
    ...(module === 'enum' && values ? { values } : {}),
    ...(part.initial !== undefined &&
    INITIAL_KINDS.includes(part.kind as never) &&
    module !== 'text'
      ? { default: part.initial }
      : {}),
    label: part.name,
  };
}

function entryOf(part: Part): LayoutEntry | undefined {
  if (!isEvidenceKind(part.kind)) {
    const module = FIELD_MODULE[part.kind] ?? 'text';
    const enumless = module === 'enum' && part.kind === 'choice' && part.options.length === 0;
    return {
      module: (enumless ? 'text' : module) as LayoutEntry['module'],
      field: part.id,
      label: part.name,
    };
  }
  const module = EVIDENCE_MODULE[part.kind];
  if (!module) return undefined;
  const variant = part.show ? VARIANT[part.show] : undefined;
  return {
    module: module as LayoutEntry['module'],
    id: part.id,
    ...(variant ? { variant } : {}),
    label: part.name,
  };
}

type Phase = { state: string; turn: 'human' | 'agent'; label: (lang: Lang) => string };

function phasesOf(step: Step): Phase[] {
  const doing: Phase = {
    state: stateOf({ step: step.id, phase: 'doing' }),
    turn: step.doer === 'you' ? 'human' : 'agent',
    label: () => step.name,
  };
  if (step.reviewer === 'none') return [doing];
  const review: Phase = {
    state: stateOf({ step: step.id, phase: 'review' }),
    turn: step.reviewer === 'you' ? 'human' : 'agent',
    // A board is its steps: a review reads as the step it reviews, whose turn says who acts.
    label: () => step.name,
  };
  if (!isAgent(step.reviewer)) return [doing, review];
  const yours: Phase = {
    state: stateOf({ step: step.id, phase: 'yours' }),
    turn: 'human',
    label: () => step.name,
  };
  return [doing, review, yours];
}

type RawTransition = {
  from: string;
  to: string;
  by: 'agent' | 'human' | 'human-ui';
  reason?: 'required';
};

// Only the person says Hecho, and only on the item page: an agent cannot relay it.
function closingByYou(transition: RawTransition): RawTransition {
  return transition.by === 'human' && transition.to === DONE
    ? { ...transition, by: 'human-ui' }
    : transition;
}

function transitionsOf(def: BoardDefinition): RawTransition[] {
  const out: RawTransition[] = [];
  const target = (way: string) => (way === DONE ? DONE : stateOf({ step: way, phase: 'doing' }));
  for (const step of def.steps) {
    const doing = stateOf({ step: step.id, phase: 'doing' });
    const doer = step.doer === 'you' ? 'human' : 'agent';
    const ways = waysOf(def, step.id).map(target);
    const back = stateOf({ step: backTarget(def, step.id), phase: 'doing' });
    // A handoff that carries the round's note says it as the move's reason.
    const note = step.note.req === 'always' ? { reason: 'required' as const } : {};
    for (const earlier of backWaysOf(def, step.id))
      out.push({ from: doing, to: target(earlier), by: doer, reason: 'required' });
    if (step.reviewer === 'none') {
      for (const to of ways) out.push({ from: doing, to, by: doer, ...note });
      continue;
    }
    const review = stateOf({ step: step.id, phase: 'review' });
    const reviewer = step.reviewer === 'you' ? 'human' : 'agent';
    out.push({ from: doing, to: review, by: doer, ...note });
    const yours = stateOf({ step: step.id, phase: 'yours' });
    if (isAgent(step.reviewer)) out.push({ from: doing, to: yours, by: 'agent', ...note });
    for (const to of ways) out.push({ from: review, to, by: reviewer });
    out.push({ from: review, to: back, by: reviewer, reason: 'required' });
    if (isAgent(step.reviewer)) {
      for (const to of ways) out.push({ from: yours, to, by: 'human' });
      out.push({ from: yours, to: back, by: 'human', reason: 'required' });
    }
  }
  return out.map(closingByYou);
}

// The published list: a list or a table (grid) whose columns are the list row, grouped by a field,
// or by the step (state) when it groups by Paso or Motivo.
function viewOf(def: BoardDefinition, row: readonly LayoutEntry[]) {
  const group = def.list.group;
  const byState = group === STEP || group === MOTIVE;
  const groupBy = group === undefined ? undefined : byState ? 'state' : group;
  const fields = row.flatMap(({ field }) => (field && field !== groupBy ? [field] : []));
  return {
    kind: def.list.as === 'table' ? 'grid' : 'list',
    ...(groupBy ? { group_by: groupBy } : {}),
    ...(def.list.as === 'table'
      ? { columns: ['id', 'title', ...fields, 'state', 'who', 'age'] }
      : {}),
  };
}

function zoneOf(def: BoardDefinition, part: Part): Zone {
  return def.layout[part.id] ?? defaultZone(part.kind);
}

// Compiles a version of a board: `id` names the preset (the board's hidden id), `version` its
// version. Throws when the board cannot be published: problemsOf says why in words first.
export function compileBoard(id: string, version: number, def: BoardDefinition): Preset {
  const first = def.steps[0];
  if (!first) throw new OteaError('invalid_preset', `Board ${def.name} has no steps`);
  const used = usedRefs(def);
  // Layout order: the parts Acomodar placed, in its order, then the rest in board order.
  const ordered = [
    ...Object.keys(def.layout),
    ...Object.keys(def.parts).filter((ref) => !(ref in def.layout)),
  ]
    .filter((ref) => used.has(ref))
    .map((ref) => def.parts[ref])
    .filter((part): part is Part => part !== undefined);
  const required = new Set(def.form.filter((entry) => entry.required).map(({ ref }) => ref));

  const fields: Record<string, RawField> = {
    title: { module: 'text', required: 'create', label: def.title },
  };
  for (const part of ordered) {
    if (!isEvidenceKind(part.kind)) fields[part.id] = fieldOf(part, required.has(part.id));
  }

  const phases = def.steps.flatMap(phasesOf);
  const states: Record<string, { turn: string; closes?: string }> = {};
  for (const phase of phases) states[phase.state] = { turn: phase.turn };
  states[DONE] = { turn: 'none', closes: 'done' };
  // Plain Descartado stays besides the motives: it holds what was discarded before them.
  const drops = [
    DROPPED,
    ...def.drop.motives.map(({ id: motive }) => stateOf({ closed: DROPPED, motive })),
  ];
  for (const state of drops) states[state] = { turn: 'none', closes: 'discarded' };
  const dropper = def.drop.by === 'page' ? ('human-ui' as const) : ('human' as const);
  const agentDrops = def.steps.flatMap((step) =>
    step.doerMayDrop && step.doer !== 'you'
      ? drops.map((to) => ({
          from: stateOf({ step: step.id, phase: 'doing' }),
          to,
          by: 'agent' as const,
          reason: 'required' as const,
        }))
      : [],
  );
  const transitions: RawTransition[] = [
    ...transitionsOf(def),
    ...phases.flatMap(({ state }) =>
      drops.map((to) => ({ from: state, to, by: dropper, reason: 'required' as const })),
    ),
    ...agentDrops,
  ];
  const branch = guardedBranch(def);
  const pushes = (branch?.guard.push ?? [])
    .filter((stepId) => stepById(def, stepId))
    .map((stepId) => stateOf({ step: stepId, phase: 'doing' }));
  const gates = branch
    ? { ...(pushes.length > 0 ? { push: pushes } : {}), merge: [DONE] }
    : undefined;

  // The rounds and the parts take a place only where Acomodar put them (the parts only on a board
  // that divides), first in their column: on top they read in the main column, hidden nowhere.
  const places: Record<string, LayoutEntry> = {
    [ROUNDS]: { module: 'rounds' },
    ...(def.split ? { [PARTS]: { module: 'children' } } : {}),
  };
  const placed = (wanted: Zone) =>
    Object.entries(def.layout).flatMap(([ref, at]) => {
      const entry = places[ref];
      const column = at === 'top' ? 'main' : at;
      return entry && column === wanted ? [entry] : [];
    });
  const zone = (wanted: Zone) =>
    ordered.filter((part) => zoneOf(def, part) === wanted).flatMap((part) => entryOf(part) ?? []);
  const fieldEntries = (entries: LayoutEntry[]) => entries.filter((entry) => entry.field);
  const evidenceEntries = (entries: LayoutEntry[]) => entries.filter((entry) => entry.id);
  const top = zone('top');
  const layout = {
    header: fieldEntries(top),
    evidence: [],
    body: [...placed('main'), ...evidenceEntries(top), ...zone('main')],
    side: [...placed('side'), ...zone('side'), { module: 'relations' }],
    // A column of a part nothing uses any more has no field to read.
    row: def.row.flatMap((ref) => {
      if (!used.has(ref)) return [];
      const part = partOf(def, ref);
      const entry = part && ref !== TITLE ? entryOf(part) : undefined;
      return entry?.field ? [entry] : [];
    }),
    // Hidden evidence still needs a module to be attached to; the phone slot carries it until the
    // phone layout is designed.
    phone: evidenceEntries(zone('hidden')),
    intake: [
      { module: 'text', field: TITLE, label: def.title },
      ...def.form.flatMap(({ ref }) => {
        const part = def.parts[ref];
        const entry = part ? entryOf(part) : undefined;
        return entry?.field ? [entry] : [];
      }),
    ],
  };

  const labels = Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      {
        name: def.name,
        types: { [BOARD_TYPE]: def.item },
        states: {
          ...Object.fromEntries(phases.map((phase) => [phase.state, phase.label(lang)])),
          [DONE]: WORDS[lang].done,
          [DROPPED]: WORDS[lang].dropped,
          // A discard with a motive reads as its motive (Duplicado).
          ...Object.fromEntries(
            def.drop.motives.map(({ id: motive, name }) => [
              stateOf({ closed: DROPPED, motive }),
              name,
            ]),
          ),
        },
        fields: Object.fromEntries(
          Object.entries(fields).map(([key, field]) => [key, field.label]),
        ),
        values: Object.fromEntries(
          ordered
            .filter((part) => fields[part.id]?.module === 'enum' || part.kind === 'level')
            .filter((part) => fields[part.id] !== undefined)
            .map((part) => [
              part.id,
              part.kind === 'yesno'
                ? { yes: WORDS[lang].yes, no: WORDS[lang].no }
                : part.kind === 'level'
                  ? Object.fromEntries(LEVELS.map((level) => [level, WORDS[lang][level] ?? level]))
                  : Object.fromEntries(part.options.map((choice) => [choice.id, choice.name])),
            ]),
        ),
      },
    ]),
  );

  const raw = {
    preset: id,
    preset_version: version,
    icon: def.icon,
    fields,
    workflow: {
      initial: stateOf({ step: first.id, phase: 'doing' }),
      states,
      transitions,
      ...(gates ? { gates } : {}),
    },
    types: { [BOARD_TYPE]: { label: def.item, icon: def.icon, layout } },
    view: viewOf(def, layout.row),
    labels,
  };
  const reading = readPreset(JSON.stringify(raw));
  if (!reading.ok)
    throw new OteaError(
      'invalid_preset',
      `Board ${def.name} does not compile: ${reading.problems.join('; ')}`,
    );
  return reading.preset;
}
