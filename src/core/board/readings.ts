import { type IdSource, newId } from './ids.ts';
import {
  type BoardDefinition,
  boardDefaults,
  DONE,
  DROPPED,
  type Part,
  stepDefaults,
} from './model.ts';
import { EMPTY, w } from './template-words.ts';
import { instantiate, type Lang, type Template, TITLE_NAME } from './templates.ts';

// What each preset Otea shipped becomes as boards, once, when a project opens: the migration's
// core. A reading keeps the keys the items' data is stored under as hidden ids (fields, evidence
// modules, choices, and the old states as step ids), so items keep their fields, evidence and
// history. `states` maps every old state, and every state of the board an earlier reading made,
// to the state its items take now. The app applies it (src/app/board-migration.ts).

export type Reading = {
  preset: string;
  // The boards it becomes, in order: the first keeps the collection; `types` are the item types
  // that move to that board (the first board takes every other type).
  boards: readonly { template: Template; types?: readonly string[] }[];
  // Per board: old state → state now.
  states: readonly Readonly<Record<string, string>>[];
  // Old states whose entering reason becomes the note of the round the item starts now (the
  // person's question in Falta información, answered in Completar's next round).
  asked?: readonly string[];
  split?: { parent: number; child: number; always: boolean };
};

const ANY = 'any' as const;
const YOU = 'you' as const;

const TASKS: Template = {
  key: 'preset-tasks',
  hidden: true,
  icon: 'checklist',
  name: w('Tasks', 'Tareas'),
  description: EMPTY,
  board: w('Tasks', 'Tareas'),
  item: w('Task', 'Tarea'),
  about: w(
    'Tasks for any agent. Each one needs a Description before the work starts: complete it first.',
    'Tareas para cualquier agente. Cada una necesita una Descripción antes de empezar: complétala primero.',
  ),
  idle: EMPTY,
  parts: [
    {
      key: 'description',
      kind: 'long',
      name: w('Description', 'Descripción'),
      hint: w(
        'what has to be done, and how to know it is done',
        'qué hay que hacer y cómo saber que está hecho',
      ),
    },
    {
      key: 'priority',
      kind: 'choice',
      name: w('Priority', 'Prioridad'),
      hint: EMPTY,
      options: [w('Low', 'Baja'), w('Medium', 'Media'), w('High', 'Alta')],
      optionKeys: ['low', 'medium', 'high'],
      initial: 'medium',
    },
  ],
  form: [['description', false]],
  steps: [
    {
      key: 'incomplete',
      name: w('Complete', 'Completar'),
      doer: ANY,
      reviewer: 'none',
      hand: [['description', 'always']],
      skip: true,
      drop: true,
    },
    { key: 'todo', name: w('Do it', 'Hacerlo'), doer: ANY, reviewer: YOU, hand: [] },
  ],
  anytime: ['priority'],
  samples: { en: [], es: [] },
};

const BUGS: Template = {
  key: 'preset-bug-triage',
  hidden: true,
  icon: 'bug',
  name: w('Bugs', 'Errores'),
  description: EMPTY,
  board: w('Bugs', 'Errores'),
  item: w('Bug', 'Bug'),
  about: w(
    'Bugs: an agent completes each one, the person sorts it and an agent fixes it, leaving the proof in the note. Nothing is fixed before it is reproduced.',
    'Bugs: un agente completa cada uno, la persona lo clasifica y un agente lo arregla, con la prueba en la nota. Nada se arregla sin reproducirlo primero.',
  ),
  idle: EMPTY,
  parts: [
    {
      key: 'description',
      kind: 'long',
      name: w('Description', 'Descripción'),
      hint: w(
        'what happened, in the words of whoever saw it',
        'qué pasó, en palabras de quien lo vio',
      ),
    },
    {
      key: 'steps',
      kind: 'long',
      name: w('Steps', 'Pasos'),
      hint: w('how to reproduce it, in order', 'cómo reproducirlo, en orden'),
    },
    {
      key: 'expected',
      kind: 'long',
      name: w('Expected', 'Lo esperado'),
      hint: w('what should happen', 'qué tendría que pasar'),
    },
    {
      key: 'actual',
      kind: 'long',
      name: w('Actual', 'Lo que pasa'),
      hint: w('what happens instead', 'qué pasa en cambio'),
    },
    { key: 'environment', kind: 'text', name: w('Environment', 'Entorno'), hint: EMPTY },
    {
      key: 'severity',
      kind: 'level',
      name: w('Severity', 'Severidad'),
      hint: w('how much it hurts', 'cuánto duele'),
      initial: 'medium',
    },
    {
      key: 'category',
      kind: 'choice',
      name: w('Category', 'Categoría'),
      hint: EMPTY,
      options: [
        w('crash', 'cierre inesperado'),
        w('visual', 'visual'),
        w('gameplay', 'jugabilidad'),
        w('physics', 'física'),
        w('audio', 'audio'),
        w('performance', 'rendimiento'),
        w('UI', 'interfaz'),
      ],
      optionKeys: ['crash', 'visual', 'gameplay', 'physics', 'audio', 'performance', 'ui'],
    },
    { key: 'area', kind: 'text', name: w('Area', 'Área'), hint: EMPTY },
  ],
  form: [['description', false]],
  steps: [
    {
      key: 'incomplete',
      name: w('Complete', 'Completar'),
      doer: ANY,
      reviewer: 'none',
      hand: [
        ['description', 'always'],
        ['steps', 'always'],
        ['expected', 'always'],
        ['actual', 'always'],
        ['severity', 'always'],
      ],
      skip: true,
    },
    {
      key: 'reported',
      name: w('Sort', 'Triar'),
      doer: YOU,
      reviewer: 'none',
      hand: [],
      ways: ['incomplete'],
    },
    {
      key: 'accepted',
      name: w('Fix', 'Arreglar'),
      doer: ANY,
      reviewer: YOU,
      hand: [],
      ways: ['reported'],
      note: w('the test you ran and what you saw', 'la prueba que hiciste y qué viste'),
    },
  ],
  anytime: ['environment', 'category', 'area'],
  motives: [
    ['rejected', w('Rejected', 'Rechazado')],
    ['duplicate', w('Duplicate', 'Duplicado')],
    ['wont_fix', w("Won't fix", 'No se arreglará')],
  ],
  dropBy: 'page',
  list: { as: 'table', group: 'severity' },
  row: ['severity', 'category', 'area'],
  samples: { en: [], es: [] },
};

const REVIEW: Template = {
  key: 'preset-review',
  hidden: true,
  icon: 'compare',
  name: w('Review', 'Revisiones'),
  description: EMPTY,
  board: w('Review', 'Revisiones'),
  item: w('Piece', 'Pieza'),
  about: w(
    'Pieces reviewed by rounds: each handoff carries the note of what changed in that round.',
    'Piezas revisadas por rondas: cada entrega lleva la nota de qué cambió en esa ronda.',
  ),
  idle: EMPTY,
  parts: [
    { key: 'brief', kind: 'long', name: w('Brief', 'Encargo'), hint: EMPTY },
    { key: 'target', kind: 'text', name: w('Target', 'Objetivo'), hint: EMPTY },
    {
      key: 'recording',
      kind: 'video',
      name: w('Recording', 'Grabación'),
      hint: EMPTY,
      show: 'player',
    },
    { key: 'images', kind: 'images', name: w('Images', 'Imágenes'), hint: EMPTY, show: 'gallery' },
  ],
  form: [
    ['brief', false],
    ['target', false],
  ],
  steps: [
    {
      key: 'queued',
      name: w('Do it', 'Hacerlo'),
      doer: ANY,
      reviewer: YOU,
      hand: [
        ['recording', 'no'],
        ['images', 'no'],
      ],
      note: w('what changed in this round', 'qué cambió en esta ronda'),
    },
  ],
  anytime: [],
  row: ['target'],
  samples: { en: [], es: [] },
};

const ARCHITECTURE: Template = {
  key: 'preset-architecture',
  hidden: true,
  icon: 'diagram',
  name: w('Architecture', 'Arquitectura'),
  description: EMPTY,
  board: w('Architecture', 'Arquitectura'),
  item: w('Decision', 'Decisión'),
  about: w(
    'Architecture decisions, each with its options side by side. When a decision replaces an accepted one, link them with relates and say there that it replaces DEC-n.',
    'Decisiones de arquitectura, cada una con sus opciones lado a lado. Si una decisión reemplaza a otra aceptada, enlázalas con relates y di ahí que reemplaza a DEC-n.',
  ),
  idle: EMPTY,
  parts: [
    { key: 'context', kind: 'long', name: w('Context', 'Contexto'), hint: EMPTY },
    {
      key: 'options',
      kind: 'long',
      name: w('Options', 'Opciones'),
      hint: w(
        'each one starts with a heading ### A · Name',
        'cada una empieza con un título ### A · Nombre',
      ),
      show: 'options',
    },
    { key: 'decision', kind: 'long', name: w('Decision', 'Decisión'), hint: EMPTY },
    { key: 'consequences', kind: 'long', name: w('Consequences', 'Consecuencias'), hint: EMPTY },
    { key: 'area', kind: 'text', name: w('Area', 'Área'), hint: EMPTY },
    { key: 'diagram', kind: 'diagram', name: w('Diagram', 'Diagrama'), hint: EMPTY },
  ],
  form: [['context', false]],
  steps: [
    {
      key: 'drafting',
      name: w('Draft', 'Redactar'),
      doer: ANY,
      reviewer: YOU,
      hand: [
        ['options', 'always'],
        ['decision', 'always'],
        ['consequences', 'always'],
        ['diagram', 'no'],
      ],
    },
  ],
  anytime: ['area'],
  row: ['area'],
  samples: { en: [], es: [] },
};

const CHANGES: Template = {
  key: 'preset-change',
  hidden: true,
  icon: 'layers',
  name: w('Changes', 'Cambios'),
  description: EMPTY,
  board: w('Changes', 'Cambios'),
  item: w('Change', 'Cambio'),
  about: w(
    'Changes that touch several repositories. Each one divides into a Repo task per repository; it is handed off once all of them are finished.',
    'Cambios que tocan varios repositorios. Cada uno se divide en una Tarea de repo por repositorio; se entrega cuando todas terminaron.',
  ),
  idle: EMPTY,
  parts: [
    { key: 'description', kind: 'long', name: w('Description', 'Descripción'), hint: EMPTY },
    { key: 'plan', kind: 'long', name: w('Plan', 'Plan'), hint: EMPTY },
  ],
  form: [['description', false]],
  steps: [
    {
      key: 'analysing',
      name: w('Analyse', 'Analizar'),
      doer: ANY,
      reviewer: YOU,
      hand: [['plan', 'always']],
    },
    {
      key: 'executing',
      name: w('Execute', 'Ejecutar'),
      doer: ANY,
      reviewer: YOU,
      hand: [],
      waits: ['parts'],
    },
  ],
  anytime: [],
  layout: { parts: 'main' },
  samples: { en: [], es: [] },
};

const REPO_TASKS: Template = {
  key: 'preset-repo-tasks',
  hidden: true,
  icon: 'git-branch',
  name: w('Repo tasks', 'Tareas de repo'),
  description: EMPTY,
  board: w('Repo tasks', 'Tareas de repo'),
  item: w('Repo task', 'Tarea de repo'),
  about: w(
    'One task per repository, always part of a Change. Push only to its branch, only while Implement is being done.',
    'Una tarea por repositorio, siempre parte de un Cambio. Sube solo a su rama, y solo mientras se hace Implementar.',
  ),
  idle: EMPTY,
  parts: [
    { key: 'repo', kind: 'text', name: w('Repo', 'Repo'), hint: EMPTY },
    {
      key: 'branch',
      kind: 'branch',
      name: w('Branch', 'Rama'),
      hint: EMPTY,
      guard: { push: ['implementing'], repo: 'repo' },
    },
    { key: 'pr', kind: 'url', name: w('PR', 'PR'), hint: EMPTY },
    { key: 'description', kind: 'long', name: w('Description', 'Descripción'), hint: EMPTY },
  ],
  form: [
    ['repo', true],
    ['branch', true],
    ['description', false],
  ],
  steps: [
    { key: 'proposed', name: w('Proposal', 'Propuesta'), doer: YOU, reviewer: 'none', hand: [] },
    {
      key: 'implementing',
      name: w('Implement', 'Implementar'),
      doer: ANY,
      reviewer: YOU,
      hand: [],
      ways: ['proposed'],
    },
  ],
  anytime: ['pr'],
  row: ['repo'],
  samples: { en: [], es: [] },
};

const same = (...states: string[]) => Object.fromEntries(states.map((state) => [state, state]));

export const READINGS: readonly Reading[] = [
  {
    preset: 'tasks',
    boards: [{ template: TASKS }],
    states: [
      {
        ...same('incomplete', 'todo', 'todo__review', DONE, DROPPED),
        in_progress: 'todo',
        review: 'todo__review',
        discarded: DROPPED,
      },
    ],
  },
  {
    preset: 'bug-triage',
    boards: [{ template: BUGS }],
    states: [
      {
        ...same('incomplete', 'reported', 'accepted', 'accepted__review', DONE, DROPPED),
        needs_info: 'incomplete',
        fixing: 'accepted',
        verify: 'accepted__review',
        fixed: DONE,
        rejected: 'dropped__rejected',
        duplicate: 'dropped__duplicate',
        wont_fix: 'dropped__wont_fix',
      },
    ],
    asked: ['needs_info'],
  },
  {
    preset: 'review',
    boards: [{ template: REVIEW }],
    states: [
      {
        ...same('queued', 'queued__review', DONE, DROPPED),
        in_progress: 'queued',
        review: 'queued__review',
        approved: DONE,
      },
    ],
  },
  {
    preset: 'architecture',
    boards: [{ template: ARCHITECTURE }],
    states: [
      {
        ...same('drafting', 'drafting__review', DONE, DROPPED),
        review: 'drafting__review',
        revising: 'drafting',
        accepted: DONE,
        rejected: DROPPED,
      },
    ],
  },
  {
    preset: 'change',
    boards: [{ template: CHANGES }, { template: REPO_TASKS, types: ['repo_task'] }],
    states: [
      {
        ...same('analysing', 'analysing__review', 'executing', 'executing__review', DONE, DROPPED),
        plan_review: 'analysing__review',
        verify: 'executing__review',
        discarded: DROPPED,
      },
      {
        ...same('proposed', 'implementing', 'implementing__review', DONE, DROPPED),
        ready: 'implementing',
        pr_review: 'implementing__review',
        revising: 'implementing',
        approved: DONE,
      },
    ],
    split: { parent: 0, child: 1, always: true },
  },
];

export function readingOf(preset: string): Reading | undefined {
  return READINGS.find((reading) => reading.preset === preset);
}

// The boards a collection reads as, keys kept: the first named after the collection, the others
// after their template (or as the caller names them). `boardIds` are the boards' hidden ids, in
// order, for the split to name.
export function readBoards(
  reading: Reading,
  lang: Lang,
  names: readonly (string | undefined)[],
  boardIds: readonly string[],
): BoardDefinition[] {
  const defs = reading.boards.map(({ template }, index) => {
    const name = names[index];
    const def = instantiate(template, lang, name ? { name } : {}, newId, { keep: true });
    def.template = template.key;
    def.samples = [];
    return def;
  });
  const split = reading.split;
  const parent = split ? defs[split.parent] : undefined;
  const child = split ? boardIds[split.child] : undefined;
  if (split && parent && child) parent.split = { board: child, always: split.always };
  return defs;
}

// Where an item of the collection goes: which board (by position), in which state, and whether
// the reason it entered its old state becomes the note of the round it starts now. `migratedFrom`
// is the preset state an earlier reading moved it out of (its last migrate event's `from`), which
// recovers a discard's motive the earlier reading lost.
export function routeItem(
  reading: Reading,
  item: { type: string; state: string; migratedFrom?: string },
): { board: number; state: string; note: boolean } {
  const typed = reading.boards.findIndex(({ types }) => types?.includes(item.type));
  const board = typed >= 0 ? typed : 0;
  const states = reading.states[board] ?? {};
  let state = states[item.state];
  if (state === DROPPED && item.migratedFrom !== undefined) {
    const before = states[item.migratedFrom];
    if (before?.startsWith(`${DROPPED}__`)) state = before;
  }
  const first = reading.boards[board]?.template.steps[0]?.key ?? DONE;
  return {
    board,
    state: state ?? first,
    note: reading.asked?.includes(item.state) === true,
  };
}

// Whether a board an earlier reading made (version 1, published by Otea, from a shipped preset)
// may be read again: the person never published it themselves.
export function rereadable(board: {
  liveVersion: number | null;
  publishedBy: string | null;
  template?: string;
}): boolean {
  return (
    board.liveVersion === 1 &&
    board.publishedBy === 'otea' &&
    board.template !== undefined &&
    readingOf(board.template) !== undefined
  );
}

// The words of a closed state that read as Hecho when a collection on an unknown preset is read.
const DONE_WORDS = ['done', 'fixed', 'approved', 'accepted', 'completed', 'closed', 'merged'];

const EVIDENCE_KIND: Readonly<Record<string, Part['kind']>> = {
  images: 'images',
  recording: 'video',
  diff: 'code',
  log: 'log',
  diagram: 'diagram',
  files: 'file',
};

// A collection on a preset Otea never shipped reads as a board of one step, Hacerlo (any agent,
// you review), with every field its items carry at any time and every evidence module they hold
// as optional evidence; open items go there, closed ones to Hecho or Descartado by their state.
// `branch`: the field a preset's git gates matched on, kept as the protected branch (pushed while
// the step is done, merged at Hecho), its repository read from `repo` when the items carry one.
export function genericBoard(
  name: string,
  lang: Lang,
  fields: readonly string[],
  evidence: readonly { id: string; module: string }[],
  ids: IdSource = newId,
  branch?: { field: string; repo?: string },
): BoardDefinition {
  const parts: BoardDefinition['parts'] = {};
  const humanize = (key: string) => {
    const words = key.replaceAll(/[_-]/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  };
  for (const key of fields) {
    if (key === 'title') continue;
    parts[key] = { id: key, name: humanize(key), kind: 'long', hint: '', options: [] };
  }
  for (const { id, module } of evidence) {
    if (parts[id]) continue;
    parts[id] = {
      id,
      name: humanize(id),
      kind: EVIDENCE_KIND[module] ?? 'file',
      hint: '',
      options: [],
    };
  }
  const evidenceIds = evidence.map(({ id }) => id).filter((id) => parts[id]);
  const step = ids('s');
  if (branch) {
    const repo = branch.repo !== undefined && parts[branch.repo] ? branch.repo : undefined;
    parts[branch.field] = {
      id: branch.field,
      name: humanize(branch.field),
      kind: 'branch',
      hint: '',
      options: [],
      guard: { push: [step], ...(repo === undefined ? {} : { repo }) },
    };
  }
  return {
    ...boardDefaults(),
    schema: 2,
    name,
    item: lang === 'es' ? 'Ítem' : 'Item',
    icon: 'layers',
    title: TITLE_NAME[lang],
    parts,
    form: [],
    steps: [
      {
        id: step,
        name: lang === 'es' ? 'Hacerlo' : 'Do it',
        doer: 'any',
        reviewer: 'you',
        hand: evidenceIds.map((ref) => ({ ref, req: 'no' as const, fresh: false })),
        ways: [],
        back: 'same',
        instructions: { take: '', before: '', review: '' },
        ...stepDefaults(),
      },
    ],
    anytime: Object.keys(parts).filter((id) => !evidenceIds.includes(id)),
    layout: { rounds: 'main' },
    row: [],
    about: '',
    idle: '',
    cap: { on: false, n: 3 },
    samples: [],
  };
}

// Where an item on a generic board goes: open items to its one step, closed ones by their state.
export function genericState(def: BoardDefinition, item: { state: string; open: boolean }): string {
  if (item.open) return def.steps[0]?.id ?? DONE;
  return DONE_WORDS.includes(item.state) ? DONE : DROPPED;
}
