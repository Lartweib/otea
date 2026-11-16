import { EMPTY, w } from './template-words.ts';
import type { Template, TemplateSet } from './templates.ts';
import { FLOW_SETS } from './templates-flows.ts';

// The templates that say what the old presets said: sorting bugs (bug-triage), reviewing by rounds
// (review) and decisions (architecture); and the board that only comes in a set: the Tareas that
// wait for what blocks them (Producto). Templates use any agent where the mock named one: agents are per project.

export const COVERAGE_TEMPLATES: readonly Template[] = [
  {
    key: 'triage',
    retired: true,
    icon: 'bug',
    name: w('Sort bugs', 'Clasificar errores'),
    description: w(
      'An agent completes each bug, you sort it and another agent fixes it with its proof.',
      'Un agente completa cada bug, tú lo clasificas y otro agente lo arregla con su prueba.',
    ),
    board: w('Bugs', 'Errores'),
    item: w('Bug', 'Bug'),
    about: w(
      'Bugs reported by users or testers. Nothing is fixed before it is reproduced.',
      'Errores que reportan usuarios o testers. Nada se arregla sin reproducirlo primero.',
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
        kind: 'long',
        name: w('Steps', 'Pasos'),
        hint: w('how to reproduce it, step by step', 'cómo reproducirlo, paso a paso'),
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
        hint: w('how much it affects whoever uses it', 'cuánto afecta a quien lo usa'),
        initial: 'medium',
      },
      {
        key: 'category',
        kind: 'choice',
        name: w('Category', 'Categoría'),
        hint: w('what kind of failure it is', 'qué clase de fallo es'),
        options: [
          w('Functionality', 'Funcionamiento'),
          w('Interface', 'Interfaz'),
          w('Performance', 'Rendimiento'),
        ],
      },
      {
        key: 'area',
        kind: 'text',
        name: w('Area', 'Área'),
        hint: w('the screen or part where it happens', 'la pantalla o parte donde pasa'),
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
        'Login does nothing on the second try',
        'Saving a draft loses the last paragraph',
        'The list takes ten seconds to load',
        'Dates show in the wrong time zone',
      ],
      es: [
        'El inicio de sesión no hace nada al segundo intento',
        'Guardar un borrador pierde el último párrafo',
        'La lista tarda diez segundos en cargar',
        'Las fechas salen con la zona horaria equivocada',
      ],
    },
  },
  {
    key: 'review',
    retired: true,
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

// Templates that make several boards at once: the validated flows (templates-flows.ts).
export const TEMPLATE_SETS: readonly TemplateSet[] = [...FLOW_SETS];
