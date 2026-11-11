import { type IdSource, newId } from './ids.ts';
import {
  BOARD_SCHEMA,
  type BoardDefinition,
  DONE,
  type Doer,
  EVIDENCE_SHOWS,
  isEvidenceKind,
  type PartKind,
  type Requirement,
  type Reviewer,
  SAME,
  type Step,
  type Zone,
} from './model.ts';

// Ready-made boards named after a job, as data in both languages. Using one copies it with fresh
// ids: nothing stays linked to the template. Instructions mention parts and steps as `@{key}`,
// which a copy turns into `@[id]`.

export type Lang = 'en' | 'es';

export const LANGS: readonly Lang[] = ['en', 'es'];

type Words = Readonly<Record<Lang, string>>;

type TemplatePart = {
  key: string;
  kind: PartKind;
  name: Words;
  hint: Words;
  options?: readonly Words[];
  show?: string;
};

type TemplateStep = {
  key: string;
  name: Words;
  doer: Doer;
  reviewer: Reviewer;
  hand: readonly (readonly [key: string, req: Requirement, fresh?: boolean])[];
  ways?: readonly string[];
  take?: Words;
  before?: Words;
};

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
};

const w = (en: string, es: string): Words => ({ en, es });
const EMPTY = w('', '');

export const TITLE_NAME: Words = w('Title', 'Título');

export const TEMPLATES: readonly Template[] = [
  {
    key: 'bugs',
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
    key: 'assets',
    icon: 'paw',
    name: w('Game assets', 'Recursos de juego'),
    description: w(
      'From concept to animation in the engine, with images and video every round.',
      'Del concepto a la animación en el motor, con imágenes y vídeo en cada ronda.',
    ),
    board: w('Creatures', 'Criaturas'),
    item: w('Creature', 'Criatura'),
    about: w(
      'Every creature, from sketch to scene. Style rules: clear silhouettes from afar.',
      'Cada criatura, del boceto a la escena. El estilo manda: siluetas claras de lejos.',
    ),
    idle: EMPTY,
    parts: [
      {
        key: 'desc',
        kind: 'long',
        name: w('Description', 'Descripción'),
        hint: w('what it looks like and how it moves', 'cómo es y cómo se mueve'),
      },
      {
        key: 'refs',
        kind: 'images',
        name: w('References', 'Referencias'),
        hint: w('photos or drawings that help', 'fotos o dibujos que ayuden'),
        show: 'gallery',
      },
      {
        key: 'biome',
        kind: 'choice',
        name: w('Biome', 'Bioma'),
        hint: w('where it lives', 'dónde vive'),
        options: [w('Swamp', 'Pantano'), w('Forest', 'Bosque'), w('Dock', 'Muelle')],
      },
      {
        key: 'art',
        kind: 'images',
        name: w('Concept art', 'Arte conceptual'),
        hint: w('3 or 4 views: front, side and a pose', '3 o 4 vistas: frente, perfil y una pose'),
        show: 'gallery',
      },
      {
        key: 'anim',
        kind: 'video',
        name: w('Animation', 'Animación'),
        hint: w(
          'a 3 to 5 s idle and walk loop, recorded in the engine',
          'un bucle de 3 a 5 s de reposo y paso, grabado en el motor',
        ),
        show: 'strip',
      },
      {
        key: 'code',
        kind: 'code',
        name: w('Code changes', 'Cambios de código'),
        hint: w('what you touched in the engine', 'lo que tocaste en el motor'),
      },
    ],
    form: [
      ['desc', true],
      ['refs', false],
    ],
    steps: [
      {
        key: 'concept',
        name: w('Concept', 'Concepto'),
        doer: 'any',
        reviewer: 'you',
        hand: [['art', 'always', true]],
        ways: [DONE],
        take: w(
          'Paint from the @{desc}; follow the style of the @{refs} when there are any.',
          'Pinta a partir de la @{desc}; sigue el estilo de las @{refs} cuando las haya.',
        ),
        before: w('Attach 3 or 4 views as @{art}.', 'Adjunta 3 o 4 vistas como @{art}.'),
      },
      {
        key: 'animate',
        name: w('Animate', 'Animar'),
        doer: 'any',
        reviewer: 'you',
        hand: [
          ['anim', 'always', true],
          ['code', 'no'],
        ],
        take: w(
          'Set it up in the engine from the approved @{art}.',
          'Móntala en el motor a partir del @{art} aprobado.',
        ),
        before: w(
          'Record a new idle and walk @{anim}.',
          'Graba una @{anim} nueva de reposo y paso.',
        ),
      },
    ],
    anytime: ['biome'],
    samples: {
      en: ['Mossy turtle', 'Swamp heron', 'Ash fox', 'Lighthouse moth'],
      es: ['Tortuga musgosa', 'Garza del pantano', 'Zorro de ceniza', 'Polilla de faro'],
    },
  },
  {
    key: 'blog',
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
  {
    key: 'research',
    icon: 'beaker',
    name: w('Research', 'Investigar'),
    description: w(
      'An agent researches, another sums it up with sources, and you decide.',
      'Un agente investiga, otro resume con fuentes, y tú decides.',
    ),
    board: w('Questions', 'Preguntas'),
    item: w('Question', 'Pregunta'),
    about: w(
      'Open questions of the project. Always cite the source.',
      'Preguntas abiertas del proyecto. Cita siempre la fuente.',
    ),
    idle: EMPTY,
    parts: [
      {
        key: 'question',
        kind: 'long',
        name: w('Question', 'Pregunta'),
        hint: w('what we want to know', 'lo que queremos saber'),
      },
      {
        key: 'findings',
        kind: 'long',
        name: w('Findings', 'Hallazgos'),
        hint: w('what you found, unfiltered', 'lo que encontraste, sin filtrar'),
      },
      {
        key: 'sources',
        kind: 'url',
        name: w('Sources', 'Fuentes'),
        hint: w('where each fact comes from', 'de dónde sale cada dato'),
      },
      {
        key: 'summary',
        kind: 'long',
        name: w('Summary', 'Resumen'),
        hint: w('the answer in five lines', 'la respuesta en cinco líneas'),
      },
    ],
    form: [['question', true]],
    steps: [
      {
        key: 'dig',
        name: w('Research', 'Investigar'),
        doer: 'any',
        reviewer: 'none',
        hand: [
          ['findings', 'always'],
          ['sources', 'always'],
        ],
        take: w(
          'Look in the engine documentation first.',
          'Busca primero en la documentación del motor.',
        ),
      },
      {
        key: 'sum',
        name: w('Sum up', 'Resumir'),
        doer: 'any',
        reviewer: 'you',
        hand: [['summary', 'always']],
        take: w(
          'Sum up the @{findings} citing the @{sources}.',
          'Resume los @{findings} citando las @{sources}.',
        ),
      },
    ],
    anytime: [],
    samples: {
      en: ['Which physics engine handles 200 wolves?', 'How big is a saved game?'],
      es: ['¿Qué motor de físicas aguanta 200 lobos?', '¿Cuánto pesa una partida guardada?'],
    },
  },
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

export function instantiate(
  template: Template,
  lang: Lang,
  names: { name?: string; item?: string },
  ids: IdSource = newId,
): BoardDefinition {
  const refs = new Map<string, string>();
  const parts: BoardDefinition['parts'] = {};
  for (const part of template.parts) {
    const id = ids(isEvidenceKind(part.kind) ? 'e' : 'f');
    refs.set(part.key, id);
    const show = part.show ?? EVIDENCE_SHOWS[part.kind as keyof typeof EVIDENCE_SHOWS]?.[0];
    parts[id] = {
      id,
      name: part.name[lang],
      kind: part.kind,
      hint: part.hint[lang],
      options: (part.options ?? []).map((option) => ({ id: ids('c'), name: option[lang] })),
      ...(show === undefined ? {} : { show }),
    };
  }
  for (const step of template.steps) refs.set(step.key, ids('s'));
  const ref = (key: string) => refs.get(key) ?? key;
  const words = (text: Words | undefined) =>
    (text?.[lang] ?? '').replace(/@\{([a-z]+)\}/g, (_, key: string) => `@[${ref(key)}]`);
  const steps: Step[] = template.steps.map((step) => ({
    id: ref(step.key),
    name: step.name[lang],
    doer: step.doer,
    reviewer: step.reviewer,
    hand: step.hand.map(([key, req, fresh]) => ({ ref: ref(key), req, fresh: fresh ?? false })),
    ways: (step.ways ?? []).map((way) => (way === DONE ? DONE : ref(way))),
    back: SAME,
    instructions: { take: words(step.take), before: words(step.before), review: '' },
  }));
  const layout = Object.fromEntries(Object.values(parts).map((p) => [p.id, defaultZone(p.kind)]));
  const row = Object.values(parts)
    .filter(({ kind }) => kind === 'level' || kind === 'choice')
    .slice(0, 2)
    .map(({ id }) => id);
  return {
    schema: BOARD_SCHEMA,
    name: names.name?.trim() || template.board[lang],
    item: names.item?.trim() || template.item[lang],
    icon: template.icon,
    title: TITLE_NAME[lang],
    parts,
    form: template.form.map(([key, required]) => ({ ref: ref(key), required })),
    steps,
    anytime: template.anytime.map(ref),
    layout,
    row,
    about: words(template.about),
    idle: words(template.idle),
    cap: { on: false, n: 3 },
    samples: [...template.samples[lang]],
    template: template.key,
  };
}

// A template as the home lists it: its words and a copy to draw its small route from.
export type TemplateView = {
  key: string;
  icon: string;
  name: string;
  description: string;
  definition: BoardDefinition;
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
      },
    ],
    anytime: [],
    layout: {},
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
    { key: 'doit', name: BLANK.step, doer: 'any', reviewer: 'you', hand: [['did', 'always']] },
  ],
  anytime: [],
  samples: {
    en: ['Sort the dock textures', 'Upload build 0.12 to the beta'],
    es: ['Ordenar las texturas del muelle', 'Subir la build 0.12 a la beta'],
  },
};

// The project's built-in board for loose requests (Pedidos); an agent's board draft arrives on one.
export function requestsBoard(lang: Lang, ids: IdSource = newId): BoardDefinition {
  const def = instantiate(REQUESTS, lang, {}, ids);
  delete def.template;
  return def;
}
