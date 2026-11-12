import { EMPTY, w } from './template-words.ts';
import type { Template, TemplateSet } from './templates.ts';

// The templates that say what the old presets said: sorting bugs (bug-triage), reviewing by rounds
// (review) and decisions (architecture); and the boards that only come in a set: Cambios and its
// Tareas de repo (Cambios en varios repos), and the Tareas that wait for what blocks them
// (Producto). Templates use any agent where the mock named one: agents are per project.

export const COVERAGE_TEMPLATES: readonly Template[] = [
  {
    key: 'triage',
    icon: 'bug',
    name: w('Sort bugs', 'Clasificar errores'),
    description: w(
      'An agent completes each bug, you sort it and another agent fixes it with its proof.',
      'Un agente completa cada bug, tú lo clasificas y otro agente lo arregla con su prueba.',
    ),
    board: w('Bugs', 'Errores'),
    item: w('Bug', 'Bug'),
    about: w(
      'Bugs that come in from the beta. Nothing is fixed before it is reproduced.',
      'Bugs que llegan de la beta. Nada se arregla sin reproducirlo primero.',
    ),
    idle: EMPTY,
    parts: [
      {
        key: 'desc',
        kind: 'long',
        name: w('Description', 'Descripción'),
        hint: w(
          'what happened, in the words of whoever saw it',
          'qué pasó, en palabras de quien lo vio',
        ),
      },
      {
        key: 'repro',
        kind: 'check',
        name: w('Steps', 'Pasos'),
        hint: w('how to reproduce it, in order', 'cómo reproducirlo, en orden'),
        options: [
          w('Open the game', 'Abrir la partida'),
          w('Go to the place', 'Ir al lugar'),
          w('Do the action', 'Hacer la acción'),
        ],
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
      {
        key: 'severity',
        kind: 'level',
        name: w('Severity', 'Severidad'),
        hint: w('how much it hurts whoever plays', 'cuánto le duele a quien juega'),
        initial: 'medium',
      },
      {
        key: 'category',
        kind: 'choice',
        name: w('Category', 'Categoría'),
        hint: w('what kind of failure it is', 'qué clase de fallo es'),
        options: [
          w('Gameplay', 'Juego'),
          w('Interface', 'Interfaz'),
          w('Performance', 'Rendimiento'),
        ],
      },
      {
        key: 'area',
        kind: 'choice',
        name: w('Area', 'Área'),
        hint: w('where it is', 'dónde está'),
        options: [w('Forest', 'Bosque'), w('Dock', 'Muelle'), w('Lighthouse', 'Faro')],
      },
      {
        key: 'code',
        kind: 'code',
        name: w('Code changes', 'Cambios de código'),
        hint: w('the diff of the fix', 'el diff del arreglo'),
      },
      {
        key: 'proof',
        kind: 'video',
        name: w('Proof', 'Prueba'),
        hint: w('the same action, fixed', 'la misma acción, ya arreglada'),
        show: 'strip',
      },
    ],
    form: [['desc', true]],
    steps: [
      {
        key: 'fill',
        name: w('Complete', 'Completar'),
        doer: 'any',
        reviewer: 'none',
        hand: [
          ['repro', 'always'],
          ['expected', 'always'],
          ['actual', 'always'],
          ['severity', 'always'],
        ],
        skip: true,
        take: w(
          'Ask in the report thread for what is missing; do not guess the @{repro}.',
          'Pregunta en el hilo del reporte lo que falte; no adivines los @{repro}.',
        ),
      },
      {
        key: 'sort',
        name: w('Sort', 'Triar'),
        doer: 'you',
        reviewer: 'none',
        hand: [['category', 'always']],
        ways: ['fill'],
      },
      {
        key: 'fix',
        name: w('Fix', 'Arreglar'),
        doer: 'any',
        reviewer: 'you',
        hand: [
          ['code', 'always'],
          ['proof', 'always', true],
        ],
        ways: ['sort'],
        note: w('the test you ran and what you saw', 'la prueba que hiciste y qué viste'),
        take: w(
          'Reproduce the bug with the @{repro} before touching the code.',
          'Reproduce el bug con los @{repro} antes de tocar el código.',
        ),
        before: w(
          'Record the @{proof} with the same action as the @{repro}.',
          'Graba la @{proof} con la misma acción de los @{repro}.',
        ),
      },
    ],
    anytime: ['area'],
    motives: [
      ['rejected', w('Rejected', 'Rechazado')],
      ['duplicate', w('Duplicate', 'Duplicado')],
      ['wont_fix', w("Won't fix", 'No se arreglará')],
    ],
    dropBy: 'page',
    list: { as: 'table', group: 'severity' },
    row: ['severity', 'category'],
    samples: {
      en: [
        'The lighthouse does not light up at dusk',
        'The boat goes through the dock',
        'Menus lag when the map opens',
        'The wolf stays on the bridge',
      ],
      es: [
        'El faro no se enciende al anochecer',
        'La barca atraviesa el muelle',
        'Los menús tardan al abrir el mapa',
        'El lobo se queda en el puente',
      ],
    },
  },
  {
    key: 'review',
    icon: 'compare',
    name: w('Review by rounds', 'Revisar por rondas'),
    description: w(
      'An agent hands in each round with a note of what changed; you compare rounds and approve.',
      'Un agente entrega cada ronda con una nota de qué cambió; tú comparas rondas y apruebas.',
    ),
    board: w('Reviews', 'Revisiones'),
    item: w('Piece', 'Pieza'),
    about: w(
      'Pieces that go through several rounds until they are right.',
      'Piezas que pasan por varias rondas hasta quedar bien.',
    ),
    idle: EMPTY,
    parts: [
      {
        key: 'brief',
        kind: 'long',
        name: w('Brief', 'Encargo'),
        hint: w('what has to be done', 'qué hay que hacer'),
      },
      {
        key: 'target',
        kind: 'text',
        name: w('Target', 'Objetivo'),
        hint: w('what it is for', 'para qué sirve'),
      },
      {
        key: 'take',
        kind: 'video',
        name: w('Recording', 'Grabación'),
        hint: w('a take of this round', 'una toma de esta ronda'),
        show: 'player',
      },
      {
        key: 'shots',
        kind: 'images',
        name: w('Images', 'Imágenes'),
        hint: w('screenshots or frames', 'capturas o fotogramas'),
        show: 'gallery',
      },
    ],
    form: [
      ['brief', true],
      ['target', false],
    ],
    steps: [
      {
        key: 'doit',
        name: w('Do it', 'Hacerlo'),
        doer: 'any',
        reviewer: 'you',
        hand: [
          ['take', 'no'],
          ['shots', 'no'],
        ],
        note: w('what changed in this round', 'qué cambió en esta ronda'),
        take: w(
          'Read the notes of the last round before you start.',
          'Lee las notas de la ronda anterior antes de empezar.',
        ),
      },
    ],
    anytime: [],
    samples: {
      en: ['Lighthouse intro', 'Dock loading screen', 'Pause menu'],
      es: ['Intro del faro', 'Pantalla de carga del muelle', 'Menú de pausa'],
    },
  },
  {
    key: 'decisions',
    icon: 'diagram',
    name: w('Decisions', 'Decisiones'),
    description: w(
      'An agent drafts each decision with its options side by side; you choose.',
      'Un agente redacta cada decisión con sus opciones lado a lado; tú eliges.',
    ),
    board: w('Architecture', 'Arquitectura'),
    item: w('Decision', 'Decisión'),
    about: w(
      'Technical decisions of the game. When one replaces another, link them with relates and say there that it replaces it.',
      'Decisiones técnicas del juego. Si una reemplaza a otra, enlázalas con relates y dilo ahí.',
    ),
    idle: EMPTY,
    parts: [
      {
        key: 'context',
        kind: 'long',
        name: w('Context', 'Contexto'),
        hint: w(
          'what is going on and why a decision is needed',
          'qué pasa y por qué hay que decidir',
        ),
      },
      {
        key: 'options',
        kind: 'long',
        name: w('Options', 'Opciones'),
        hint: w('each one with its own ### title', 'cada una con su título ###'),
        show: 'options',
      },
      {
        key: 'decision',
        kind: 'long',
        name: w('Decision', 'Decisión'),
        hint: w('which one and why', 'cuál y por qué'),
      },
      {
        key: 'consequences',
        kind: 'long',
        name: w('Consequences', 'Consecuencias'),
        hint: w('what changes from now on', 'qué cambia a partir de ahora'),
      },
      {
        key: 'diagram',
        kind: 'diagram',
        name: w('Diagram', 'Diagrama'),
        hint: w('how the parts fit', 'cómo encajan las partes'),
      },
    ],
    form: [['context', true]],
    steps: [
      {
        key: 'draft',
        name: w('Draft', 'Redactar'),
        doer: 'any',
        reviewer: 'you',
        hand: [
          ['options', 'always'],
          ['decision', 'always'],
          ['consequences', 'always'],
          ['diagram', 'no'],
        ],
        take: w(
          'Write at least two @{options} before you propose the @{decision}.',
          'Escribe al menos dos @{options} antes de proponer la @{decision}.',
        ),
      },
    ],
    anytime: [],
    samples: {
      en: ['Save games in the cloud', 'Physics engine for the wolves'],
      es: ['Guardar partidas en la nube', 'Motor de físicas para los lobos'],
    },
  },
  {
    key: 'changes',
    hidden: true,
    icon: 'layers',
    name: w('Changes', 'Cambios'),
    description: w(
      'An agent analyses the change and carries it out repository by repository.',
      'Un agente analiza el cambio y lo ejecuta repo por repo.',
    ),
    board: w('Changes', 'Cambios'),
    item: w('Change', 'Cambio'),
    about: w(
      'Changes that touch more than one repository. Each repository is a Repo task.',
      'Cambios que tocan más de un repositorio. Cada repo es una Tarea de repo.',
    ),
    idle: EMPTY,
    parts: [
      {
        key: 'what',
        kind: 'long',
        name: w('What changes', 'Qué cambia'),
        hint: w('the change, in your words', 'el cambio, en tus palabras'),
      },
      {
        key: 'plan',
        kind: 'long',
        name: w('Plan', 'Plan'),
        hint: w(
          'what is touched in each repository, in order',
          'qué se toca en cada repo, en orden',
        ),
      },
      {
        key: 'checked',
        kind: 'long',
        name: w('How it was checked', 'Cómo se comprobó'),
        hint: w('what you tried with everything together', 'qué probaste con todo junto'),
      },
    ],
    form: [['what', true]],
    steps: [
      {
        key: 'analyse',
        name: w('Analyse', 'Analizar'),
        doer: 'any',
        reviewer: 'you',
        hand: [['plan', 'always']],
        take: w(
          'Read the code of each repository it touches before you propose the @{plan}.',
          'Lee el código de cada repo afectado antes de proponer el @{plan}.',
        ),
      },
      {
        key: 'execute',
        name: w('Execute', 'Ejecutar'),
        doer: 'any',
        reviewer: 'you',
        hand: [['checked', 'always']],
        waits: ['parts'],
        take: w(
          'Follow the approved @{plan}: one Repo task for each repository that changes.',
          'Sigue el @{plan} aprobado: una Tarea de repo por cada repo que cambie.',
        ),
        before: w(
          'Try everything together and tell it in @{checked}.',
          'Prueba todo junto y cuéntalo en @{checked}.',
        ),
      },
    ],
    anytime: [],
    layout: { parts: 'main' },
    samples: {
      en: ['Save games in the cloud', 'Full-screen map'],
      es: ['Guardar partidas en la nube', 'Mapa en pantalla completa'],
    },
  },
  {
    key: 'repotasks',
    hidden: true,
    icon: 'git-branch',
    name: w('Repo tasks', 'Tareas de repo'),
    description: w(
      'Each repository, its branch: you approve the proposal and an agent carries it out.',
      'Cada repo, su rama: tú apruebas la propuesta y un agente la implementa.',
    ),
    board: w('Repo tasks', 'Tareas de repo'),
    item: w('Repo task', 'Tarea de repo'),
    about: w(
      'One task per repository. It pushes only to its branch.',
      'Una tarea por repositorio. Sube solo a su rama.',
    ),
    idle: EMPTY,
    parts: [
      {
        key: 'repo',
        kind: 'text',
        name: w('Repo', 'Repo'),
        hint: w('the folder of the repository, e.g. api', 'la carpeta del repositorio, p. ej. api'),
      },
      {
        key: 'branch',
        kind: 'branch',
        name: w('Branch', 'Rama'),
        hint: w('the branch the work goes on', 'la rama donde se trabaja'),
        guard: { push: ['implement'], repo: 'repo' },
      },
      {
        key: 'proposal',
        kind: 'long',
        name: w('What it proposes', 'Qué propone'),
        hint: w('what changes in this repository', 'qué cambia en este repo'),
      },
      {
        key: 'code',
        kind: 'code',
        name: w('Code changes', 'Cambios de código'),
        hint: w('the diff', 'el diff'),
      },
      {
        key: 'pr',
        kind: 'url',
        name: w('PR', 'PR'),
        hint: w('the link to the review', 'el enlace a la revisión'),
      },
    ],
    form: [
      ['repo', true],
      ['branch', true],
    ],
    steps: [
      {
        key: 'propose',
        name: w('Proposal', 'Propuesta'),
        doer: 'you',
        reviewer: 'none',
        hand: [['proposal', 'always']],
      },
      {
        key: 'implement',
        name: w('Implement', 'Implementar'),
        doer: 'any',
        reviewer: 'you',
        hand: [['code', 'always']],
        ways: ['propose'],
        take: w(
          'Implement @{proposal} on the @{branch}, without touching main.',
          'Implementa @{proposal} en la @{branch}, sin tocar main.',
        ),
        before: w('Leave the link in @{pr}.', 'Deja el enlace en @{pr}.'),
      },
    ],
    anytime: ['pr'],
    row: ['repo'],
    samples: {
      en: ['Save API', 'Cloud button in the menu', 'Saves table schema'],
      es: ['API de guardado', 'Botón de nube en el menú', 'Esquema de la tabla de partidas'],
    },
  },
  {
    key: 'blocked-tasks',
    hidden: true,
    icon: 'checklist',
    name: w('Tasks', 'Tareas'),
    description: w(
      'One step, which waits until nothing holds it back.',
      'Un solo paso, que espera a que nada lo frene.',
    ),
    board: w('Tasks', 'Tareas'),
    item: w('Task', 'Tarea'),
    about: w(
      'Tasks of the game. When a bug holds one back, it waits until the bug is fixed.',
      'Tareas del juego. Si un error la frena, espera a que se arregle.',
    ),
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
      {
        key: 'priority',
        kind: 'level',
        name: w('Priority', 'Prioridad'),
        hint: EMPTY,
        initial: 'medium',
      },
    ],
    form: [['todo', false]],
    steps: [
      {
        key: 'doit',
        name: w('Do it', 'Hacerlo'),
        doer: 'any',
        reviewer: 'you',
        hand: [['did', 'always']],
        waits: ['blockers'],
        drop: true,
        before: w('Say in @{did} how to check it.', 'Cuenta en @{did} cómo comprobarlo.'),
      },
    ],
    anytime: ['priority'],
    samples: {
      en: ['Close the dock map', 'Write the controls guide', 'Review the forest palette'],
      es: [
        'Cerrar el mapa del muelle',
        'Escribir la guía de controles',
        'Revisar la paleta del bosque',
      ],
    },
  },
];

// Templates that make several boards at once. Cambios en varios repos joins its two boards with
// "se divide en"; Producto's two boards stay apart, and a bug holds a task back with a link.
export const TEMPLATE_SETS: readonly TemplateSet[] = [
  {
    key: 'repos',
    icon: 'layers',
    name: w('Changes across repositories', 'Cambios en varios repos'),
    description: w(
      'Each Change divides into one Repo task per repository, and Otea protects the branch of each one.',
      'Cada Cambio se divide en una Tarea de repo por repositorio, y Otea protege la rama de cada una.',
    ),
    boards: ['changes', 'repotasks'],
    split: { parent: 0, child: 1, always: true },
  },
  {
    key: 'product',
    icon: 'checklist',
    name: w('Product', 'Producto'),
    description: w(
      'Tasks and bugs on two boards: an unfinished bug can hold a task back.',
      'Tareas y errores en dos tableros: un error sin terminar puede frenar una tarea.',
    ),
    boards: ['blocked-tasks', 'triage'],
  },
];
