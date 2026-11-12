import { playbookSection } from '../hint.ts';
import type { LayoutEntry } from '../modules.ts';
import type { ItemType, Preset } from '../preset.ts';
import { stateOf } from './engine.ts';
import {
  BOARD_SCHEMA,
  type BoardDefinition,
  boardDefaults,
  DONE,
  DROPPED,
  type EvidenceKind,
  type FieldKind,
  type Part,
  SAME,
  type Step,
  stepDefaults,
  type Zone,
} from './model.ts';
import { defaultZone, type Lang, TITLE_NAME } from './templates.ts';

// Today's boards are collections on a preset (a state machine in preset.yaml). This reads one as a
// board, once, when a project opens: the states become steps on the lanes, keeping their keys as
// hidden ids, and fields and evidence keep theirs, so items keep their data. `states` maps every old
// state to the state its items take. It is a best reading, not a perfect one: a move the steps
// cannot say (an agent sending work back) is dropped.

// `values` maps, for each choice field whose values were not ids, every old value to its choice id.
export type PresetReadingAsBoard = {
  definition: BoardDefinition;
  states: Record<string, string>;
  values: Record<string, Record<string, string>>;
};

// A choice id for each enum value: the value itself when it already is one (`low`), else the value
// lowercased with every other character a dash (`P1` is p1, `won't fix` won-t-fix), led by a v when
// it does not start with a letter (`1` is v1), and numbered when two would meet.
function choiceIds(values: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const value of values) {
    let base = value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!/^[a-z]/.test(base)) base = `v${base}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    out.set(value, id);
  }
  return out;
}

const FIELD_KIND: Readonly<Record<string, FieldKind>> = {
  text: 'text',
  markdown: 'long',
  enum: 'choice',
  severity: 'level',
};

const EVIDENCE_KIND: Readonly<Record<string, EvidenceKind>> = {
  images: 'images',
  recording: 'video',
  diff: 'code',
  log: 'log',
  diagram: 'diagram',
};

const SHOW: Readonly<Record<string, string>> = {
  gallery: 'gallery',
  single: 'one',
  compare: 'ba',
  frames: 'strip',
  player: 'player',
};

function humanize(key: string): string {
  const words = key.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function mainType(preset: Preset): ItemType {
  const type = preset.types.find(({ root }) => root !== false) ?? preset.types[0];
  if (!type) throw new Error(`Preset ${preset.name} has no type`);
  return type;
}

function layoutEntries(type: ItemType): Array<[LayoutEntry, Zone]> {
  const { layout } = type;
  const sections = (layout.sections ?? []).flatMap(({ entries }) => entries);
  return [
    ...layout.header.map((entry): [LayoutEntry, Zone] => [entry, 'top']),
    ...[...layout.evidence, ...layout.body, ...sections].map((entry): [LayoutEntry, Zone] => [
      entry,
      'main',
    ]),
    ...layout.side.map((entry): [LayoutEntry, Zone] => [entry, 'side']),
  ];
}

export function boardFromPreset(
  preset: Preset,
  options: { name: string; lang: Lang; playbook?: string | null },
): PresetReadingAsBoard {
  const type = mainType(preset);
  const { workflow } = type;
  const words = type.labels?.[options.lang];
  const label = (state: string) => words?.states[state] ?? humanize(state);

  const parts: Record<string, Part> = {};
  const layout: Record<string, Zone> = {};
  const values: Record<string, Record<string, string>> = {};
  for (const [key, spec] of Object.entries(type.fields)) {
    if (key === 'title') continue;
    const kind = FIELD_KIND[spec.module] ?? 'text';
    const valueWords = words?.values?.[key] ?? {};
    const ids = choiceIds(kind === 'choice' ? (spec.values ?? []) : []);
    const renamed = [...ids].filter(([value, id]) => value !== id);
    if (renamed.length > 0) values[key] = Object.fromEntries(renamed);
    parts[key] = {
      id: key,
      name: words?.fields[key] ?? spec.label ?? humanize(key),
      kind,
      hint: '',
      options: [...ids].map(([value, id]) => ({ id, name: valueWords[value] ?? value })),
    };
  }
  const evidence: string[] = [];
  const required: string[] = [];
  for (const [entry, zone] of layoutEntries(type)) {
    if (entry.field && parts[entry.field] && !(entry.field in layout)) layout[entry.field] = zone;
    const kind = EVIDENCE_KIND[entry.module];
    if (!kind) continue;
    const id = entry.id ?? entry.module;
    if (parts[id]) continue;
    const show = entry.variant ? SHOW[entry.variant] : undefined;
    parts[id] = {
      id,
      name: entry.label ?? humanize(id),
      kind,
      hint: '',
      options: [],
      ...(show ? { show } : {}),
    };
    layout[id] = zone === 'top' ? 'main' : zone;
    evidence.push(id);
    if (entry.required) required.push(id);
  }
  for (const part of Object.values(parts)) {
    if (!(part.id in layout)) layout[part.id] = defaultZone(part.kind);
  }

  // The states in order, open ones only, as steps.
  const states: Record<string, string> = {};
  const steps: Step[] = [];
  const stepOfState = new Map<string, Step>();
  const reachable = (from: Step, to: string, by?: string) =>
    workflow.transitions.some(
      (t) => stepOfState.get(t.from) === from && t.to === to && (by === undefined || t.by === by),
    );
  for (const state of workflow.states) {
    if (state.turn === 'none' || state.name === workflow.incomplete) continue;
    const current = steps.at(-1);
    if (state.turn === 'agent') {
      // Work a review sends back that returns to the same review: that step's next round.
      const reviewState = current ? stateOf({ step: current.id, phase: 'review' }) : '';
      const oldReview = [...stepOfState.entries()].find(
        ([old, s]) => s === current && states[old] === reviewState,
      )?.[0];
      if (
        current &&
        oldReview !== undefined &&
        workflow.transitions.some(
          (t) => t.from === oldReview && t.to === state.name && t.reasonRequired,
        ) &&
        workflow.transitions.some((t) => t.from === state.name && t.to === oldReview)
      ) {
        stepOfState.set(state.name, current);
        states[state.name] = current.id;
        continue;
      }
      if (
        current &&
        current.doer === 'any' &&
        current.reviewer === 'none' &&
        reachable(current, state.name)
      ) {
        stepOfState.set(state.name, current);
        current.name = label(state.name);
        states[state.name] = current.id;
        continue;
      }
    } else if (
      current &&
      current.doer === 'any' &&
      current.reviewer === 'none' &&
      reachable(current, state.name, 'agent')
    ) {
      current.reviewer = 'you';
      stepOfState.set(state.name, current);
      states[state.name] = stateOf({ step: current.id, phase: 'review' });
      continue;
    }
    const step: Step = {
      id: state.name,
      name: label(state.name),
      doer: state.turn === 'agent' ? 'any' : 'you',
      reviewer: 'none',
      hand: [],
      ways: [],
      back: SAME,
      instructions: { take: '', before: '', review: '' },
      ...stepDefaults(),
    };
    steps.push(step);
    stepOfState.set(state.name, step);
    states[state.name] = step.id;
  }
  const first = steps[0];
  for (const state of workflow.states) {
    if (state.turn === 'none') states[state.name] = state.closes === 'done' ? DONE : DROPPED;
  }
  if (workflow.incomplete && first) states[workflow.incomplete] = first.id;

  // Ways forward, and where a review sends work back.
  steps.forEach((step, index) => {
    for (const transition of workflow.transitions) {
      if (stepOfState.get(transition.from) !== step) continue;
      const closed = workflow.states.find(({ name }) => name === transition.to);
      if (closed?.closes === 'done') {
        if (index < steps.length - 1 && !step.ways.includes(DONE)) step.ways.push(DONE);
        continue;
      }
      const to = stepOfState.get(transition.to);
      if (!to || to === step) continue;
      const at = steps.indexOf(to);
      const isReview = states[transition.from]?.endsWith('__review');
      if (at > index + 1 && !step.ways.includes(to.id)) step.ways.push(to.id);
      else if (at < index && isReview && transition.reasonRequired) step.back = to.id;
    }
  });

  // Only a person closes an item as done: an agent step that would, gets your review.
  for (const step of steps) {
    if (step.doer !== 'you' && step.reviewer === 'none') {
      const last = steps.at(-1) === step;
      if (last || step.ways.includes(DONE)) step.reviewer = 'you';
    }
  }

  // Evidence is handed off at the last reviewed step (required where the layout said so); fields
  // asked at creation are the form, and the rest can be filled at any time.
  const target = [...steps].reverse().find(({ reviewer }) => reviewer !== 'none') ?? steps.at(-1);
  if (target) {
    target.hand = evidence.map((ref) => ({
      ref,
      req: required.includes(ref) ? ('always' as const) : ('no' as const),
      fresh: false,
    }));
  }
  const intake = new Set(type.layout.intake.flatMap(({ field }) => (field ? [field] : [])));
  const form = Object.entries(type.fields)
    .filter(([key, spec]) => key !== 'title' && (spec.required !== undefined || intake.has(key)))
    .map(([key, spec]) => ({ ref: key, required: spec.required === 'create' }));
  const onForm = new Set(form.map(({ ref }) => ref));
  const anytime = Object.keys(parts).filter((key) => !onForm.has(key) && !evidence.includes(key));
  const row = type.layout.row.flatMap(({ field }) => (field && parts[field] ? [field] : []));

  // The playbook agents read on the preset is what they read on the board: the whole of it as the
  // board's text, and the section of each state a step stands for as that step's instructions.
  const playbook = options.playbook?.trim() ?? '';
  if (playbook !== '') {
    for (const step of steps) {
      const sections = [...stepOfState]
        .filter(([, owner]) => owner === step)
        .flatMap(([state]) => playbookSection(playbook, state) ?? []);
      step.instructions.take = [...new Set(sections)].join('\n\n');
    }
  }

  return {
    definition: {
      ...boardDefaults(),
      schema: BOARD_SCHEMA,
      name: options.name,
      item: words?.label ?? type.label,
      icon: type.icon ?? preset.icon ?? 'layers',
      title: words?.fields.title ?? type.fields.title?.label ?? TITLE_NAME[options.lang],
      parts,
      form,
      steps,
      anytime,
      layout,
      row,
      about: playbook,
      idle: '',
      cap: { on: false, n: 3 },
      samples: [],
      template: preset.name,
    },
    states,
    values,
  };
}
