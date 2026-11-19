import type { Role } from './analysis.ts';
import { type IdSource, newId } from './ids.ts';
import {
  BOARD_SCHEMA,
  type BoardDefinition,
  boardDefaults,
  DONE,
  type Doer,
  type Drop,
  EVIDENCE_SHOWS,
  isEvidenceKind,
  LEVELS,
  type ListView,
  MOTIVE,
  type PartKind,
  type Requirement,
  type Reviewer,
  ROUNDS,
  SAME,
  STEP,
  type Step,
  stepDefaults,
  type Wait,
  type Zone,
} from './model.ts';

// Ready-made boards named after a job, as data in both languages. Using one copies it with fresh
// ids: nothing stays linked to the template. Instructions mention parts and steps as `@{key}`,
// which a copy turns into `@[id]`.

import { EMPTY, type Lang, TITLE_NAME, type Words, w } from './template-words.ts';
import { CATALOGUE_TEMPLATES } from './templates-catalogue.ts';
import { COVERAGE_TEMPLATES, TEMPLATE_SETS } from './templates-coverage.ts';
import { FLOW_TEMPLATES } from './templates-flows.ts';

export { LANGS, type Lang, TITLE_NAME } from './template-words.ts';

// `options` may carry their own keys (`optionKeys`, in order), which a copy that keeps keys (a
// preset's reading) takes as choice ids. `initial` is a level key, yes or no, or an option's key or
// position (`0`, `1`…). `guard` names step keys and the repository field's key.
type TemplatePart = {
  key: string;
  kind: PartKind;
  name: Words;
  hint: Words;
  options?: readonly Words[];
  optionKeys?: readonly string[];
  show?: string;
  initial?: string;
  guard?: { push: readonly string[]; repo?: string; base?: string };
};

// A conditional requirement: the part (by key) and the value that makes it required, read as
// `initial` is (an option's key or position, a level key, yes or no).
type TemplateWhen = readonly [part: string, value: string];

// `ways` holds later steps (or DONE) and earlier ones, which the doer may take the item back to.
// `back` is where a send-back lands (an earlier step's key), the step itself when left out.
type TemplateStep = {
  key: string;
  name: Words;
  doer: Doer;
  reviewer: Reviewer;
  hand: readonly (readonly [key: string, req: Requirement, fresh?: boolean, when?: TemplateWhen])[];
  ways?: readonly string[];
  back?: string;
  take?: Words;
  before?: Words;
  review?: Words;
  note?: Words;
  waits?: readonly Wait[];
  skip?: boolean;
  drop?: boolean;
  // The step's lead (model.ts Lead): the way (a step key or DONE) it takes while a part holds a value.
  lead?: readonly [to: string, when: TemplateWhen];
};

// `hidden`: one board of a set, or a preset's reading; never listed on its own. `retired`: a board
// the catalogue replaced; never listed, still made by its key for the projects and tests made with it. `layout` places a
// part (by key), the rounds or the parts; the rest go to their kind's default zone. `row` lists
// part keys; `list.group` a part key, STEP or MOTIVE. `split`: its items divide into parts on the
// same board.
export type Template = {
  key: string;
  icon: string;
  name: Words;
  description: Words;
  board: Words;
  item: Words;
  about: Words;
  idle: Words;
  parts: readonly TemplatePart[];
  form: readonly (readonly [key: string, required: boolean])[];
  steps: readonly TemplateStep[];
  anytime: readonly string[];
  samples: Readonly<Record<Lang, readonly string[]>>;
  hidden?: boolean;
  retired?: boolean;
  motives?: readonly (readonly [key: string, name: Words])[];
  dropBy?: Drop['by'];
  list?: { as: ListView['as']; group?: string };
  row?: readonly string[];
  layout?: Readonly<Record<string, Zone>>;
  split?: { always: boolean };
  // Which of its parts plays each analysis role (core/board/analysis.ts), by part key.
  analysis?: Readonly<Partial<Record<Role, string>>>;
};

// Every single-board template: the catalogue first (what Studio offers), then the first Studio's
// boards and the old presets' readings, kept hidden for the projects made with them, then the
// boards that only come in a set (hidden).
export const TEMPLATES: readonly Template[] = [
  ...CATALOGUE_TEMPLATES,
  {
    key: 'bugs',
    retired: true,
    icon: 'bug',
    name: w('Fix bugs', 'Arreglar bugs'),
    description: w(
      'One agent refines each bug, another fixes it, and you approve each step.',
      'Un agente refina cada bug, otro lo arregla y tú apruebas cada paso.',
    ),
    board: w('Bugs', 'Bugs'),
    item: w('Bug', 'Bug'),
    about: w(
      'Bugs in the game. Reproduce before touching anything and leave the proof on video.',
      'Bugs del juego. Reproduce antes de tocar nada y deja la prueba en vídeo.',
    ),
    idle: w(
      'Look in the log of the latest build for errors without a bug and create one for each.',
      'Busca en el log de la última build errores que no tengan bug y crea uno por cada uno.',
    ),
    parts: [
      {
        key: 'what',
        kind: 'long',
        name: w('What happens', 'Qué pasa'),
        hint: w('what you see and what you expected', 'qué ves y qué esperabas ver'),
      },
      {
        key: 'repro',
        kind: 'check',
        name: w('Steps to reproduce', 'Pasos para reproducirlo'),
        hint: w('each step, in order', 'cada paso, en orden'),
        options: [
          w('Open the game', 'Abrir la partida'),
          w('Go to the place', 'Ir al lugar'),
          w('Do the action', 'Hacer la acción'),
        ],
      },
      {
        key: 'severity',
        kind: 'level',
        name: w('Severity', 'Gravedad'),
        hint: w('how much it hurts whoever plays', 'cuánto le duele a quien juega'),
      },
      {
        key: 'area',
        kind: 'choice',
        name: w('Area', 'Área'),
        hint: w('where the problem is', 'dónde está el problema'),
        options: [
          w('Game', 'Juego'),
          w('Interface', 'Interfaz'),
          w('Audio', 'Audio'),
          w('Render', 'Render'),
        ],
      },
      {
        key: 'cause',
        kind: 'long',
        name: w('Likely cause', 'Causa probable'),
        hint: w(
          'what causes it, in two or three sentences',
          'qué lo provoca, en dos o tres frases',
        ),
      },
      {
        key: 'code',
        kind: 'code',
        name: w('Code changes', 'Cambios de código'),
        hint: w('the diff of the fix', 'el diff del arreglo'),
      },
      {
        key: 'video',
        kind: 'video',
        name: w('Video of the fix', 'Vídeo del arreglo'),
        hint: w('the same action, fixed', 'la misma acción, ya arreglada'),
        show: 'strip',
      },
    ],
    form: [
      ['what', true],
      ['repro', false],
    ],
    steps: [
      {
        key: 'refine',
        name: w('Refine', 'Refinar'),
        doer: 'any',
        reviewer: 'you',
        hand: [
          ['cause', 'always'],
          ['severity', 'always'],
        ],
        ways: [DONE],
        take: w(
          'Reproduce the bug following @{repro} before looking for the cause.',
          'Reproduce el bug siguiendo @{repro} antes de buscar la causa.',
        ),
        before: w(
          'Write the @{cause} in plain words and pick the @{severity}.',
          'Escribe la @{cause} en lenguaje llano y elige la @{severity}.',
        ),
      },
      {
        key: 'fix',
        name: w('Fix', 'Arreglar'),
        doer: 'any',
        reviewer: 'you',
        hand: [
          ['code', 'always'],
          ['video', 'always', true],
        ],
        take: w(
          'Start from the @{cause} approved in @{refine}.',
          'Parte de la @{cause} aprobada en @{refine}.',
        ),
        before: w(
          'Record a new @{video} with the same action as @{repro}.',
          'Graba un @{video} nuevo con la misma acción de @{repro}.',
        ),
      },
    ],
    anytime: ['area'],
    samples: {
      en: [
        'Wolves do not cross the rope bridge',
        'The fog flickers on load',
        'Footsteps sound twice in the lighthouse',
        'Pollen over the pause menu',
      ],
      es: [
        'Los lobos no cruzan el puente de cuerda',
        'La niebla parpadea al cargar',
        'Los pasos suenan dos veces en el faro',
        'Polen sobre el menú de pausa',
      ],
    },
  },
  {
    key: 'blog',
    retired: true,
    icon: 'book',
    name: w('Write for the blog', 'Escribir para el blog'),
    description: w(
      'An agent proposes the outline and writes; you decide what gets published.',
      'Un agente propone el esquema y escribe; tú decides qué se publica.',
    ),
    board: w('Journal', 'Diario'),
    item: w('Post', 'Entrada'),
    about: w(
      'The development journal. Warm tone, no jargon, one idea per post.',
      'El diario de desarrollo. Tono cercano, sin jerga, una idea por entrada.',
    ),
    idle: EMPTY,
    parts: [
      {
        key: 'idea',
        kind: 'long',
        name: w('Idea', 'Idea'),
        hint: w('what it is about, in one sentence', 'de qué trata, en una frase'),
      },
      {
        key: 'outline',
        kind: 'long',
        name: w('Outline', 'Esquema'),
        hint: w('the parts, in order', 'las partes, en orden'),
      },
      {
        key: 'text',
        kind: 'long',
        name: w('Text', 'Texto'),
        hint: w('the whole post', 'la entrada completa'),
      },
      {
        key: 'cover',
        kind: 'images',
        name: w('Cover image', 'Imagen de portada'),
        hint: w('an image that stands for it', 'una imagen que la represente'),
        show: 'one',
      },
      {
        key: 'section',
        kind: 'choice',
        name: w('Section', 'Sección'),
        hint: EMPTY,
        options: [w('Tech', 'Técnica'), w('Art', 'Arte'), w('Community', 'Comunidad')],
      },
    ],
    form: [['idea', true]],
    steps: [
      {
        key: 'outlining',
        name: w('Outlining', 'Esquematizar'),
        doer: 'any',
        reviewer: 'you',
        hand: [['outline', 'always']],
        take: w(
          'Propose an @{outline} from the @{idea}.',
          'Propón un @{outline} a partir de la @{idea}.',
        ),
      },
      {
        key: 'drafting',
        name: w('Drafting', 'Redactar'),
        doer: 'any',
        reviewer: 'you',
        hand: [
          ['text', 'always'],
          ['cover', 'no'],
        ],
        take: w(
          'Write the @{text} following the approved @{outline}.',
          'Escribe el @{text} siguiendo el @{outline} aprobado.',
        ),
        before: w(
          'Read the text out loud once before handing it off.',
          'Lee el texto en voz alta una vez antes de entregarlo.',
        ),
      },
      {
        key: 'publishing',
        name: w('Publishing', 'Publicación'),
        doer: 'you',
        reviewer: 'none',
        hand: [],
      },
    ],
    anytime: ['section'],
    samples: {
      en: ['The bridge the wolves fear', 'How we paint the fog', 'A week with the beta'],
      es: ['El puente que temen los lobos', 'Cómo pintamos la niebla', 'Una semana con la beta'],
    },
  },
  {
    key: 'tasks',
    retired: true,
    icon: 'checklist',
    name: w('Simple tasks', 'Tareas simples'),
    description: w(
      'One step: an agent does it and you review it.',
      'Un solo paso: un agente lo hace y tú lo revisas.',
    ),
    board: w('Tasks', 'Tareas'),
    item: w('Task', 'Tarea'),
    about: EMPTY,
    idle: EMPTY,
    parts: [
      {
        key: 'todo',
        kind: 'long',
        name: w('What to do', 'Qué hay que hacer'),
        hint: w('what an agent needs to start', 'lo que necesita un agente para empezar'),
      },
      {
        key: 'did',
        kind: 'long',
        name: w('What I did', 'Qué hice'),
        hint: w('what changed and how to check it', 'lo que cambió y cómo comprobarlo'),
      },
      { key: 'priority', kind: 'level', name: w('Priority', 'Prioridad'), hint: EMPTY },
    ],
    form: [['todo', false]],
    steps: [
      {
        key: 'doit',
        name: w('Do it', 'Hacerlo'),
        doer: 'any',
        reviewer: 'you',
        hand: [['did', 'always']],
        before: w('Say in @{did} how to check it.', 'Cuenta en @{did} cómo comprobarlo.'),
      },
    ],
    anytime: ['priority'],
    samples: {
      en: ['Write the controls guide', 'Review the forest palette', 'Close the dock map'],
      es: [
        'Escribir la guía de controles',
        'Revisar la paleta del bosque',
        'Cerrar el mapa del muelle',
      ],
    },
  },
  ...COVERAGE_TEMPLATES,
  ...FLOW_TEMPLATES,
];

export function requireTemplate(key: string): Template {
  const template = TEMPLATES.find((candidate) => candidate.key === key);
  if (!template) throw new Error(`No template "${key}"`);
  return template;
}

// Where a part shows by default: evidence, long texts and checklists in the main column, the rest
// at the side.
export function defaultZone(kind: PartKind): Zone {
  return isEvidenceKind(kind) || kind === 'long' || kind === 'check' ? 'main' : 'side';
}

// A board name where a command takes it: quoted when it has a space.
const asArg = (name: string) => (/\s/.test(name) ? `"${name}"` : name);

// `keep`: the template's keys become the ids (a preset's reading keeps the keys its items' data is
// stored under); otherwise every id is fresh, so nothing stays linked to the template.
// `boards`: the names of the boards a set makes with it, by template key. A text names a board as
// #{key} (#{key:arg} where a command takes it): this board's own name, the set's name for that
// board, or else the template's.
export function instantiate(
  template: Template,
  lang: Lang,
  names: { name?: string; item?: string },
  ids: IdSource = newId,
  options: { keep?: boolean; boards?: Readonly<Record<string, string>> } = {},
): BoardDefinition {
  const keep = options.keep === true;
  const boardName = (key: string) => {
    if (key === template.key) return names.name?.trim() || template.board[lang];
    return options.boards?.[key] ?? requireTemplate(key).board[lang];
  };
  const named = (text: string) =>
    text.replace(/#\{([a-z_-]+)(:arg)?\}/g, (_, key: string, arg?: string) =>
      arg ? asArg(boardName(key)) : boardName(key),
    );
  const refs = new Map<string, string>();
  const choices = new Map<string, string[]>();
  const parts: BoardDefinition['parts'] = {};
  for (const part of template.parts) {
    const id = keep ? part.key : ids(isEvidenceKind(part.kind) ? 'e' : 'f');
    refs.set(part.key, id);
    const show = part.show ?? EVIDENCE_SHOWS[part.kind as keyof typeof EVIDENCE_SHOWS]?.[0];
    const options = (part.options ?? []).map((option, index) => ({
      id: keep ? (part.optionKeys?.[index] ?? `v${index + 1}`) : ids('c'),
      name: option[lang],
    }));
    choices.set(
      part.key,
      options.map((choice) => choice.id),
    );
    parts[id] = {
      id,
      name: part.name[lang],
      kind: part.kind,
      hint: named(part.hint[lang]),
      options,
      ...(show === undefined ? {} : { show }),
    };
  }
  for (const step of template.steps) refs.set(step.key, keep ? step.key : ids('s'));
  const ref = (key: string) => refs.get(key) ?? key;
  // A value as a choice part stores it (its option's id); a level, yes or no as written.
  const storedValue = (key: string, value: string) => {
    const part = template.parts.find((candidate) => candidate.key === key);
    if (part?.kind !== 'choice') return value;
    const at = part.optionKeys?.indexOf(value) ?? -1;
    const position = /^\d+$/.test(value) ? Number(value) : at;
    return choices.get(key)?.[position] ?? value;
  };
  for (const part of template.parts) {
    const made = parts[ref(part.key)];
    if (!made) continue;
    if (part.initial !== undefined) made.initial = storedValue(part.key, part.initial);
    if (part.guard)
      made.guard = {
        push: part.guard.push.map(ref),
        ...(part.guard.repo === undefined ? {} : { repo: ref(part.guard.repo) }),
        ...(part.guard.base === undefined ? {} : { base: part.guard.base }),
      };
  }
  const words = (text: Words | undefined) =>
    named(text?.[lang] ?? '').replace(/@\{([a-z_]+)\}/g, (_, key: string) => `@[${ref(key)}]`);
  const steps: Step[] = template.steps.map((step) => ({
    id: ref(step.key),
    name: step.name[lang],
    doer: step.doer,
    reviewer: step.reviewer,
    hand: step.hand.map(([key, req, fresh, when]) => ({
      ref: ref(key),
      req,
      ...(when ? { when: { part: ref(when[0]), value: storedValue(when[0], when[1]) } } : {}),
      fresh: fresh ?? false,
    })),
    ways: (step.ways ?? []).map((way) => (way === DONE ? DONE : ref(way))),
    back: step.back === undefined ? SAME : ref(step.back),
    instructions: {
      take: words(step.take),
      before: words(step.before),
      review: words(step.review),
    },
    ...stepDefaults(),
    note: step.note ? { req: 'always', hint: step.note[lang] } : { req: 'no', hint: '' },
    waits: [...(step.waits ?? [])],
    skipWhenReady: step.skip === true,
    doerMayDrop: step.drop === true,
    ...(step.lead
      ? {
          lead: {
            to: step.lead[0] === DONE ? DONE : ref(step.lead[0]),
            when: {
              part: ref(step.lead[1][0]),
              value: storedValue(step.lead[1][0], step.lead[1][1]),
            },
          },
        }
      : {}),
  }));
  const layout: Record<string, Zone> = Object.fromEntries(
    Object.values(parts).map((p) => [p.id, defaultZone(p.kind)]),
  );
  // A board where someone reviews shows the rounds in the main column, first.
  const reviewed = steps.some(({ reviewer }) => reviewer !== 'none');
  const placed: Record<string, Zone> = reviewed ? { [ROUNDS]: 'main' } : {};
  for (const [key, zone] of Object.entries(template.layout ?? {})) placed[ref(key)] = zone;
  const ordered = {
    ...placed,
    ...Object.fromEntries(Object.entries(layout).filter(([id]) => !(id in placed))),
  };
  const row = template.row
    ? template.row.map(ref)
    : Object.values(parts)
        .filter(({ kind }) => kind === 'level' || kind === 'choice')
        .slice(0, 2)
        .map(({ id }) => id);
  const group = template.list?.group;
  const motives = (template.motives ?? []).map(([key, name]) => ({
    id: keep ? key : ids('c'),
    name: name[lang],
  }));
  return {
    ...boardDefaults(),
    drop: { by: template.dropBy ?? 'anyone', motives },
    list: {
      as: template.list?.as ?? 'list',
      ...(group === undefined
        ? {}
        : { group: group === STEP || group === MOTIVE ? group : ref(group) }),
    },
    schema: BOARD_SCHEMA,
    name: names.name?.trim() || template.board[lang],
    item: names.item?.trim() || template.item[lang],
    icon: template.icon,
    title: TITLE_NAME[lang],
    parts,
    form: template.form.map(([key, required]) => ({ ref: ref(key), required })),
    steps,
    anytime: template.anytime.map(ref),
    layout: ordered,
    row,
    about: words(template.about),
    idle: words(template.idle),
    cap: { on: false, n: 3 },
    samples: [...template.samples[lang]],
    ...(template.split ? { split: { board: SAME, always: template.split.always } } : {}),
    ...(template.analysis
      ? {
          analysis: Object.fromEntries(
            Object.entries(template.analysis).map(([role, key]) => [role, ref(key)]),
          ),
        }
      : {}),
    template: template.key,
  };
}

// A template that makes several boards: `boards` are single-board template keys, in order;
// `split` joins two of them with "se divide en" (by position).
export type TemplateSet = {
  key: string;
  icon: string;
  name: Words;
  description: Words;
  boards: readonly string[];
  split?: { parent: number; child: number; always: boolean };
};

export { TEMPLATE_SETS };

export function requireSet(key: string): TemplateSet {
  const set = TEMPLATE_SETS.find((candidate) => candidate.key === key);
  if (!set) throw new Error(`No template set "${key}"`);
  return set;
}

export function isSetKey(key: string): boolean {
  return TEMPLATE_SETS.some((set) => set.key === key);
}

// Copies every board of a set. `boards` gives each one its hidden board id (what a split names)
// and the names the person typed; the parent of a split divides into its child by that id.
export function instantiateSet(
  set: TemplateSet,
  lang: Lang,
  boards: readonly { id: string; name?: string; item?: string }[],
  ids: IdSource = newId,
): BoardDefinition[] {
  const names = Object.fromEntries(
    set.boards.map((key, index) => [
      key,
      boards[index]?.name?.trim() || requireTemplate(key).board[lang],
    ]),
  );
  const defs = set.boards.map((key, index) => {
    const { name, item } = boards[index] ?? {};
    return instantiate(
      requireTemplate(key),
      lang,
      { ...(name ? { name } : {}), ...(item ? { item } : {}) },
      ids,
      { boards: names },
    );
  });
  const split = set.split;
  const parent = split ? defs[split.parent] : undefined;
  const child = split ? boards[split.child] : undefined;
  if (split && parent && child) parent.split = { board: child.id, always: split.always };
  defs.forEach((def, index) => {
    def.template = set.key;
    def.madeWith = boards.filter((_, other) => other !== index).map(({ id }) => id);
  });
  return defs;
}

// A template as the home lists it: its words and a copy to draw its small route from; a set also
// carries every board it makes (`boards`), each with its own copy, and how they join.
export type TemplateView = {
  key: string;
  icon: string;
  name: string;
  description: string;
  definition: BoardDefinition;
  boards?: { name: string; item: string; definition: BoardDefinition }[];
  split?: { parent: number; child: number; always: boolean };
};

export function templateView(template: Template, lang: Lang): TemplateView {
  return {
    key: template.key,
    icon: template.icon,
    name: template.name[lang],
    description: template.description[lang],
    definition: instantiate(template, lang, {}),
  };
}

export function setView(set: TemplateSet, lang: Lang): TemplateView {
  const placeholders = set.boards.map((_, index) => ({ id: `bset${index}` }));
  const defs = instantiateSet(set, lang, placeholders);
  const [first] = defs;
  if (!first) throw new Error(`Template set "${set.key}" has no boards`);
  return {
    key: set.key,
    icon: set.icon,
    name: set.name[lang],
    description: set.description[lang],
    definition: first,
    boards: defs.map((definition) => ({
      name: definition.name,
      item: definition.item,
      definition,
    })),
    ...(set.split ? { split: set.split } : {}),
  };
}

const listed = ({ hidden, retired }: Template) => !hidden && !retired;

// What Studio's home offers, in order: every template that is not only part of a set, then the
// sets.
export function listedTemplates(lang: Lang): TemplateView[] {
  return [
    ...TEMPLATES.filter(listed).map((template) => templateView(template, lang)),
    ...TEMPLATE_SETS.map((set) => setView(set, lang)),
  ];
}

// The keys of what Studio's home offers, in its order: the one catalog the CLI takes and lists.
export const LISTED_KEYS: readonly string[] = [
  ...TEMPLATES.filter(listed).map(({ key }) => key),
  ...TEMPLATE_SETS.map(({ key }) => key),
];

export function isListedKey(key: string): boolean {
  return LISTED_KEYS.includes(key);
}

const BLANK = {
  item: w('Item', 'Ítem'),
  step: w('Do it', 'Hacerlo'),
};

// A blank board that already works: one step, any agent does it and you review it.
export function blankBoard(
  lang: Lang,
  names: { name: string; item?: string },
  ids: IdSource = newId,
): BoardDefinition {
  return {
    ...boardDefaults(),
    schema: BOARD_SCHEMA,
    name: names.name.trim(),
    item: names.item?.trim() || BLANK.item[lang],
    icon: 'layers',
    title: TITLE_NAME[lang],
    parts: {},
    form: [],
    steps: [
      {
        id: ids('s'),
        name: BLANK.step[lang],
        doer: 'any',
        reviewer: 'you',
        hand: [],
        ways: [],
        back: SAME,
        instructions: { take: '', before: '', review: '' },
        ...stepDefaults(),
      },
    ],
    anytime: [],
    layout: { [ROUNDS]: 'main' },
    row: [],
    about: '',
    idle: '',
    cap: { on: false, n: 3 },
    samples: [],
  };
}

const REQUESTS: Template = {
  key: 'requests',
  icon: 'inbox',
  name: w('Requests', 'Pedidos'),
  description: w('Loose requests for any agent.', 'Encargos sueltos para cualquier agente.'),
  board: w('Requests', 'Pedidos'),
  item: w('Request', 'Pedido'),
  about: w(
    'Loose requests for any agent. Every project comes with it.',
    'Encargos sueltos para cualquier agente. Viene con cada proyecto.',
  ),
  idle: EMPTY,
  parts: [
    {
      key: 'need',
      kind: 'long',
      name: w('What you need', 'Qué necesitas'),
      hint: w('the request, in your words', 'el encargo, en tus palabras'),
    },
    {
      key: 'did',
      kind: 'long',
      name: w('What I did', 'Qué hice'),
      hint: w('what was done and how to check it', 'lo que hizo y cómo comprobarlo'),
    },
  ],
  form: [['need', true]],
  steps: [
    {
      key: 'doit',
      name: BLANK.step,
      doer: 'any',
      reviewer: 'you',
      hand: [['did', 'always']],
      // A Request has no branch: a code change done here would close as Done with nothing merged,
      // while the gate keeps it out of the base (P8-R2-6).
      take: w(
        'Do what @{need} asks. A change to code that one of the project\'s boards lands (a board whose branch Otea protects) is not done here: a Request has no branch, so it would close as Done with nothing merged. Create it on that board instead (otea create --collection "<board>"), and hand this one off saying where it went.',
        'Haz lo que pide @{need}. Un cambio de código que integra uno de los tableros del proyecto (uno cuya rama protege Otea) no se hace aquí: un Pedido no tiene rama, así que quedaría Hecho sin fusionar nada. Créalo en ese tablero (otea create --collection "<tablero>") y entrega este diciendo adónde fue.',
      ),
    },
  ],
  anytime: [],
  samples: {
    en: ['Sort the dock textures', 'Upload build 0.12 to the beta'],
    es: ['Ordenar las texturas del muelle', 'Subir la build 0.12 a la beta'],
  },
};

// The language a board was made in, read from what it calls the title.
export function boardLang(def: BoardDefinition): Lang {
  return def.title === TITLE_NAME.es ? 'es' : 'en';
}

// The project's built-in board for loose requests (Pedidos); an agent's board draft arrives on one.
export function requestsBoard(lang: Lang, ids: IdSource = newId): BoardDefinition {
  const def = instantiate(REQUESTS, lang, {}, ids);
  delete def.template;
  return def;
}
