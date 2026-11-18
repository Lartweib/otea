import { DONE, MOTIVE, STEP } from './model.ts';
import { EMPTY, w } from './template-words.ts';
import type { Template } from './templates.ts';
import { CHANGES } from './templates-flows.ts';

// The starter catalogue: generic boards named by what they manage, each a base a person adapts to
// their own fields and steps: bugs, changes, research, decisions, content, visual design and
// experiments (the two sets, ideas to tasks and deliveries with PRs, live in templates-flows).
// Keys are kept as the ids the boards were designed with.

const BUG_REPORTS: Template = {
  key: 'bug-reports',
  icon: 'bug',
  name: w('Bugs', 'Errores'),
  description: w(
    'Bugs, whether you find them or the people who use what you make report them. Nothing is fixed before it is reproduced, and every fix comes with its proof.',
    'Errores, los encuentres tú o los reporte la gente que usa lo que haces. Nada se arregla antes de reproducirlo, y cada arreglo llega con su prueba.',
  ),
  board: w('Bugs', 'Errores'),
  item: w('Bug', 'Error'),
  about: w(
    'Bugs, whether you find them or the people who use what you make report them. Nothing is fixed before it is reproduced, and every fix comes with its proof.',
    'Errores, los encuentres tú o los reporte la gente que usa lo que haces. Nada se arregla antes de reproducirlo, y cada arreglo llega con su prueba.',
  ),
  idle: w(
    'Nothing here for you. Wait with otea wait --turn agent --unclaimed; do not invent work.',
    'No hay nada para ti aquí. Espera con otea wait --turn agent --unclaimed; no inventes trabajo.',
  ),
  parts: [
    {
      key: 'fsaid',
      kind: 'long',
      name: w('What they reported', 'Lo que reportaron'),
      hint: w(
        'the report as the person who hit it wrote it, unedited',
        'el reporte tal como lo escribió quien se encontró el error, sin editar',
      ),
    },
    {
      key: 'fsource',
      kind: 'url',
      name: w('Where it was reported', 'Dónde se reportó'),
      hint: w(
        'link to the issue, ticket, review or message',
        'enlace al issue, ticket, reseña o mensaje',
      ),
    },
    {
      key: 'fenv',
      kind: 'text',
      name: w('Where it happens', 'Dónde pasa'),
      hint: w(
        'version, platform, browser or device',
        'versión, plataforma, navegador o dispositivo',
      ),
    },
    {
      key: 'fkind',
      kind: 'choice',
      name: w('Kind', 'Clase de fallo'),
      hint: w(
        'what kind of failure; decides the proof the fix needs',
        'qué clase de fallo es; decide la prueba que necesita el arreglo',
      ),
      options: [
        w('Visual', 'Visual'),
        w('Behaviour or crash', 'Comportamiento o cierre'),
        w('Performance', 'Rendimiento'),
      ],
      optionKeys: ['kvisual', 'kbehave', 'kperf'],
      initial: 'kbehave',
    },
    {
      key: 'frepro',
      kind: 'long',
      name: w('Steps to reproduce', 'Cómo reproducirlo'),
      hint: w(
        'numbered steps someone else can follow',
        'pasos numerados que otra persona pueda seguir',
      ),
    },
    {
      key: 'fexp',
      kind: 'long',
      name: w('Expected', 'Lo esperado'),
      hint: w('what should happen', 'qué tendría que pasar'),
    },
    {
      key: 'fgot',
      kind: 'long',
      name: w('Actual', 'Lo que pasa'),
      hint: w('what happens instead', 'qué pasa en cambio'),
    },
    {
      key: 'fsev',
      kind: 'level',
      name: w('Severity', 'Gravedad'),
      hint: w('how much it hurts the people who use it', 'cuánto le duele a quien lo usa'),
    },
    {
      key: 'feffort',
      kind: 'level',
      name: w('Effort', 'Esfuerzo'),
      hint: w(
        'how much work the fix looks like; an agent estimates it, you correct it',
        'cuánto trabajo parece el arreglo; lo estima un agente y tú lo corriges',
      ),
    },
    {
      key: 'frisk',
      kind: 'level',
      name: w('Risk', 'Riesgo'),
      hint: w(
        'how likely the fix is to break something else',
        'qué tan probable es que el arreglo rompa otra cosa',
      ),
    },
    {
      key: 'farea',
      kind: 'text',
      name: w('Area', 'Área'),
      hint: w('the part of the product it touches', 'la parte del producto que toca'),
    },
    {
      key: 'fbranch',
      kind: 'branch',
      name: w('Branch', 'Rama'),
      hint: w('fix/<id>-<topic>, from main', 'fix/<id>-<tema>, desde main'),
      guard: { push: ['sfix', 'sland'] },
    },
    {
      key: 'ediff',
      kind: 'code',
      name: w('Changes', 'Cambios'),
      hint: w('git diff main...HEAD of the branch', 'git diff main...HEAD de la rama'),
    },
    {
      key: 'etests',
      kind: 'log',
      name: w('Test output', 'Salida de las pruebas'),
      hint: w(
        'the full test run, with the new test that failed before the fix',
        'la ejecución completa de las pruebas, con la prueba nueva que fallaba antes del arreglo',
      ),
    },
    {
      key: 'ebench',
      kind: 'log',
      name: w('Before and after', 'Antes y después'),
      hint: w(
        'the same measurement before and after the fix',
        'la misma medición antes y después del arreglo',
      ),
    },
    {
      key: 'evideo',
      kind: 'video',
      name: w('Recording', 'Grabación'),
      hint: w('the same steps, now fixed', 'los mismos pasos, ya arreglado'),
      show: 'player',
    },
    {
      key: 'fcommit',
      kind: 'text',
      name: w('Commit on main', 'Commit en main'),
      hint: w('the short hash that landed on main', 'el hash corto que llegó a main'),
    },
  ],
  form: [
    ['fsaid', true],
    ['fsource', false],
  ],
  steps: [
    {
      key: 'scomplete',
      name: w('Complete', 'Completar'),
      doer: 'any',
      reviewer: 'none',
      hand: [
        ['frepro', 'always', false],
        ['fexp', 'always', false],
        ['fgot', 'always', false],
        ['fenv', 'always', false],
        ['feffort', 'no', false],
        ['frisk', 'no', false],
        ['farea', 'no', false],
      ],
      take: w(
        'Read @{fsaid} and @{fsource}. If it is not enough to reproduce, ask the person with otea ask; never guess the steps. Estimate @{feffort}, @{frisk} and @{farea} from what you found; the person corrects them when triaging.',
        'Lee @{fsaid} y @{fsource}. Si no alcanza para reproducirlo, pregunta a la persona con otea ask; nunca adivines los pasos. Estima @{feffort}, @{frisk} y @{farea} con lo que encontraste; la persona los corrige al triar.',
      ),
      skip: true,
    },
    {
      key: 'striage',
      name: w('Triage', 'Triar'),
      doer: 'you',
      reviewer: 'none',
      hand: [
        ['fsev', 'always', false],
        ['fkind', 'always', false],
        ['feffort', 'always', false],
        ['frisk', 'always', false],
      ],
    },
    {
      key: 'sfix',
      name: w('Fix', 'Arreglar'),
      doer: 'any',
      reviewer: 'you',
      hand: [
        ['fbranch', 'always', false],
        ['ediff', 'always', true],
        ['etests', 'when', true, ['fkind', 'kbehave']],
        ['ebench', 'when', true, ['fkind', 'kperf']],
        ['evideo', 'when', true, ['fkind', 'kvisual']],
      ],
      take: w(
        'Reproduce it with @{frepro} before changing code. For behaviour and crashes, write a failing test first; for performance, measure before you change anything.',
        'Reprodúcelo con @{frepro} antes de tocar el código. Para comportamiento y cierres, escribe primero una prueba que falle; para rendimiento, mide antes de cambiar nada.',
      ),
      review: w(
        'Check the proof shows the same steps as @{frepro}.',
        'Comprueba que la prueba muestra los mismos pasos que @{frepro}.',
      ),
      note: w(
        'the cause in one sentence, and how you checked the fix',
        'la causa en una frase, y cómo comprobaste el arreglo',
      ),
    },
    {
      key: 'sland',
      name: w('Land', 'Integrar'),
      doer: 'any',
      reviewer: 'none',
      hand: [['fcommit', 'always', false]],
      take: w(
        'Bring @{fbranch} into main without rewriting commits: a fast-forward push of main or, where main takes changes only through a PR, a PR merged with gh pr merge. Then delete the branch.',
        'Lleva @{fbranch} a main sin reescribir commits: con fast-forward y push de main o, si main solo acepta cambios por PR, con un PR que mergeas con gh pr merge. Después borra la rama.',
      ),
      before: w('Write the short hash in @{fcommit}.', 'Escribe el hash corto en @{fcommit}.'),
    },
  ],
  anytime: ['fkind', 'feffort', 'frisk', 'farea'],
  samples: {
    en: [
      'Login loops back to the start page',
      'Export drops the last row',
      'App freezes when the list is empty',
    ],
    es: [
      'El inicio de sesión vuelve a la página de inicio',
      'La exportación pierde la última fila',
      'La app se congela con la lista vacía',
    ],
  },
  motives: [
    ['mdup', w('Duplicate', 'Duplicado')],
    ['mnorepro', w('Cannot reproduce', 'No se reproduce')],
    ['mdesign', w('Works as intended', 'Es así a propósito')],
    ['mwont', w("Won't fix", 'No se arreglará')],
  ],
  list: { as: 'table', group: 'fsev' },
  row: ['fsev', 'fkind'],
  analysis: { effort: 'feffort', risk: 'frisk', area: 'farea' },
  layout: {
    rounds: 'main',
    fsaid: 'top',
    fsource: 'side',
    fenv: 'side',
    fkind: 'side',
    frepro: 'main',
    fexp: 'main',
    fgot: 'main',
    fsev: 'side',
    feffort: 'side',
    frisk: 'side',
    farea: 'side',
    fbranch: 'side',
    ediff: 'main',
    etests: 'main',
    ebench: 'main',
    evideo: 'main',
    fcommit: 'side',
  },
};

const CONTENT: Template = {
  key: 'content',
  icon: 'book',
  name: w('Content', 'Contenido'),
  description: w(
    'Writing that goes out: posts, newsletters, docs pages. You approve the outline and the draft; the agent publishes what you approved.',
    'Textos que salen afuera: entradas, newsletters, páginas de documentación. Tú apruebas el esquema y el borrador; el agente publica lo que aprobaste.',
  ),
  board: w('Content', 'Contenido'),
  item: w('Piece', 'Pieza'),
  about: w(
    'Writing that goes out: posts, newsletters, docs pages. You approve the outline and the draft; the agent publishes what you approved.',
    'Textos que salen afuera: entradas, newsletters, páginas de documentación. Tú apruebas el esquema y el borrador; el agente publica lo que aprobaste.',
  ),
  idle: w(
    'Nothing here for you. Wait with otea wait --turn agent --unclaimed; do not invent work.',
    'No hay nada para ti aquí. Espera con otea wait --turn agent --unclaimed; no inventes trabajo.',
  ),
  parts: [
    {
      key: 'fbrief',
      kind: 'long',
      name: w('Brief', 'Planteamiento'),
      hint: w(
        'what it is about, who it is for and what they should take away',
        'de qué trata, para quién es y qué tiene que llevarse quien lo lea',
      ),
    },
    {
      key: 'fchannel',
      kind: 'choice',
      name: w('Channel', 'Canal'),
      hint: w('where it goes', 'dónde sale'),
      options: [
        w('Blog', 'Blog'),
        w('Newsletter', 'Newsletter'),
        w('Docs', 'Documentación'),
        w('Social', 'Redes'),
      ],
      optionKeys: ['cblog', 'cnews', 'cdocs', 'csocial'],
    },
    {
      key: 'foutline',
      kind: 'long',
      name: w('Sections', 'Secciones'),
      hint: w('the sections and the point of each', 'las secciones y la idea de cada una'),
    },
    {
      key: 'fdraft',
      kind: 'long',
      name: w('Draft', 'Borrador'),
      hint: w('the full text, in the channel format', 'el texto completo, en el formato del canal'),
    },
    {
      key: 'fcover',
      kind: 'images',
      name: w('Images', 'Imágenes'),
      hint: w(
        'cover and inline images, with their source',
        'portada e imágenes del texto, con su fuente',
      ),
      show: 'gallery',
    },
    {
      key: 'eaudio',
      kind: 'audio',
      name: w('Audio', 'Audio'),
      hint: w(
        'a voice-over or episode, when the piece is heard',
        'una locución o un episodio, cuando la pieza se escucha',
      ),
    },
    {
      key: 'furl',
      kind: 'url',
      name: w('Published at', 'Publicado en'),
      hint: w('where it lives once published', 'dónde queda una vez publicado'),
    },
  ],
  form: [
    ['fbrief', true],
    ['fchannel', false],
  ],
  steps: [
    {
      key: 'soutline',
      name: w('Outline', 'Esquema'),
      doer: 'any',
      reviewer: 'you',
      hand: [['foutline', 'always', false]],
      take: w(
        'Read @{fbrief}. Ask with otea ask if the audience or the takeaway is unclear.',
        'Lee @{fbrief}. Pregunta con otea ask si no está claro el público o lo que se tiene que llevar.',
      ),
    },
    {
      key: 'sdraft',
      name: w('Write', 'Redactar'),
      doer: 'any',
      reviewer: 'you',
      hand: [['fdraft', 'always', true]],
      take: w(
        'Write @{fdraft} from what was approved in @{foutline}. Cite a source for every fact.',
        'Escribe @{fdraft} con lo aprobado en @{foutline}. Cita una fuente para cada dato.',
      ),
      review: w(
        'Read it as the audience in @{fbrief} would.',
        'Léelo como lo leería el público de @{fbrief}.',
      ),
      note: w(
        'what you cut, and anything you could not verify',
        'qué recortaste y qué no pudiste comprobar',
      ),
    },
    {
      key: 'spublish',
      name: w('Go live', 'Poner en línea'),
      doer: 'any',
      reviewer: 'none',
      hand: [['furl', 'always', false]],
      take: w(
        'Publish the approved draft as it is; do not rewrite it.',
        'Publica el borrador aprobado tal cual; no lo reescribas.',
      ),
    },
  ],
  anytime: ['fcover', 'eaudio', 'fchannel'],
  samples: {
    en: ['What changed in 2.0', 'How to migrate from the old API'],
    es: ['Qué cambió en la 2.0', 'Cómo migrar desde la API vieja'],
  },
  list: { as: 'list', group: STEP },
  row: ['fchannel'],
  layout: {
    rounds: 'main',
    fbrief: 'top',
    fchannel: 'side',
    foutline: 'main',
    fdraft: 'main',
    fcover: 'main',
    eaudio: 'main',
    furl: 'side',
  },
};

const RESEARCH: Template = {
  key: 'research',
  icon: 'beaker',
  name: w('Research', 'Investigación'),
  description: w(
    'Questions that need searching and comparing before deciding. Every fact with its source; every answer ends in a recommendation.',
    'Preguntas que piden buscar y comparar antes de decidir. Cada dato con su fuente; cada respuesta termina en una recomendación.',
  ),
  board: w('Research', 'Investigación'),
  item: w('Question', 'Pregunta'),
  about: w(
    'Questions that need searching and comparing before deciding. Every fact with its source; every answer ends in a recommendation.',
    'Preguntas que piden buscar y comparar antes de decidir. Cada dato con su fuente; cada respuesta termina en una recomendación.',
  ),
  idle: w(
    'Nothing here for you. Wait with otea wait --turn agent --unclaimed; do not invent work.',
    'No hay nada para ti aquí. Espera con otea wait --turn agent --unclaimed; no inventes trabajo.',
  ),
  parts: [
    {
      key: 'fq',
      kind: 'long',
      name: w('Question', 'Pregunta'),
      hint: w('what you want to know', 'lo que quieres saber'),
    },
    {
      key: 'fwhy',
      kind: 'long',
      name: w('What for', 'Para qué'),
      hint: w('which decision depends on the answer', 'qué decisión depende de la respuesta'),
    },
    {
      key: 'ffind',
      kind: 'long',
      name: w('Findings', 'Hallazgos'),
      hint: w(
        'what you found, each fact with its source and date',
        'lo que encontraste, cada dato con su fuente y su fecha',
      ),
    },
    {
      key: 'fsrc',
      kind: 'url',
      name: w('Sources', 'Fuentes'),
      hint: w('official docs, repositories or data', 'documentación oficial, repositorios o datos'),
    },
    {
      key: 'fanswer',
      kind: 'long',
      name: w('Conclusion', 'Conclusión'),
      hint: w(
        'the answer in five lines, and what you recommend',
        'la respuesta en cinco líneas, y lo que recomiendas',
      ),
    },
  ],
  form: [
    ['fq', true],
    ['fwhy', false],
  ],
  steps: [
    {
      key: 'sdig',
      name: w('Investigate', 'Investigar'),
      doer: 'any',
      reviewer: 'none',
      hand: [
        ['ffind', 'always', false],
        ['fsrc', 'always', false],
      ],
      take: w(
        'Look in the project and official docs first. If @{fwhy} is unclear, ask with otea ask before searching.',
        'Busca primero en el proyecto y en la documentación oficial. Si @{fwhy} no está claro, pregunta con otea ask antes de buscar.',
      ),
      before: w('Mark what you could not verify.', 'Marca lo que no pudiste comprobar.'),
    },
    {
      key: 'sanswer',
      name: w('Answer', 'Responder'),
      doer: 'any',
      reviewer: 'you',
      hand: [['fanswer', 'always', false]],
      take: w(
        'Answer @{fq} citing @{fsrc}. If it calls for a change, recommend it; do not make it.',
        'Responde @{fq} citando @{fsrc}. Si pide un cambio, recomiéndalo; no lo hagas.',
      ),
      review: w(
        'Check the answer serves @{fwhy}.',
        'Comprueba que la respuesta sirve para @{fwhy}.',
      ),
    },
  ],
  anytime: [],
  samples: {
    en: ['Which search library fits our data?', 'How do similar tools handle offline use?'],
    es: [
      '¿Qué librería de búsqueda le sirve a nuestros datos?',
      '¿Cómo resuelven el uso sin conexión herramientas parecidas?',
    ],
  },
  list: { as: 'list', group: STEP },
  layout: {
    rounds: 'main',
    fq: 'top',
    fwhy: 'main',
    ffind: 'main',
    fsrc: 'side',
    fanswer: 'main',
  },
};

const DECISIONS: Template = {
  key: 'decisions',
  icon: 'beaker',
  name: w('Decisions', 'Decisiones'),
  description: w(
    'Research before deciding: the agent searches with sources and lays out options, you decide, and if the repository keeps ADRs the agent records one. A question with no decision behind it leaves Decide straight to Done.',
    'Antes de decidir, investigar: el agente busca con fuentes y plantea opciones, tú decides, y si el repo lleva ADR el agente la registra. Una pregunta sin decisión detrás sale de Decidir hacia Hecho.',
  ),
  board: w('Decisions', 'Decisiones'),
  item: w('Decision', 'Decisión'),
  about: w(
    'Research before deciding: the agent searches with sources and lays out options, you decide, and if the repository keeps ADRs the agent records one. A question with no decision behind it leaves Decide straight to Done.',
    'Antes de decidir, investigar: el agente busca con fuentes y plantea opciones, tú decides, y si el repo lleva ADR el agente la registra. Una pregunta sin decisión detrás sale de Decidir hacia Hecho.',
  ),
  idle: w(
    'Nothing here for you. Wait with otea wait --turn agent --unclaimed; do not invent work.',
    'No hay nada para ti aquí. Espera con otea wait --turn agent --unclaimed; no inventes trabajo.',
  ),
  parts: [
    {
      key: 'fq',
      kind: 'long',
      name: w('What to decide', 'Qué hay que decidir'),
      hint: w(
        'the question, and what is held back until it is decided',
        'la pregunta, y qué se frena hasta que se decida',
      ),
    },
    {
      key: 'fctx',
      kind: 'long',
      name: w('Context', 'Contexto'),
      hint: w(
        'what was already decided that it touches (ADRs by number) and the constraints',
        'lo ya decidido que toca (ADR por número) y las restricciones',
      ),
    },
    {
      key: 'ffind',
      kind: 'long',
      name: w('Findings', 'Hallazgos'),
      hint: w(
        'each fact with its source and date; what you could not verify, marked',
        'cada dato con su fuente y su fecha; lo que no pudiste comprobar, marcado',
      ),
    },
    {
      key: 'fsrc',
      kind: 'url',
      name: w('Sources', 'Fuentes'),
      hint: w(
        "official docs, repositories or data; not someone else's summaries",
        'documentación oficial, repos o datos; no resúmenes de otros',
      ),
    },
    {
      key: 'fopts',
      kind: 'long',
      name: w('Options', 'Opciones'),
      hint: w(
        'two to four, each with what it gains and what it costs, and which you recommend',
        'de dos a cuatro, cada una con lo que gana y lo que cuesta, y cuál recomiendas',
      ),
    },
    {
      key: 'fdiag',
      kind: 'diagram',
      name: w('Diagram', 'Diagrama'),
      hint: w(
        'if an option is easier to understand drawn',
        'si una opción se entiende mejor dibujada',
      ),
    },
    {
      key: 'fdecided',
      kind: 'long',
      name: w('What I decided', 'Lo que decidí'),
      hint: w(
        "the chosen option and why, in the person's words",
        'la opción elegida y por qué, en palabras de la persona',
      ),
    },
    {
      key: 'eadr',
      kind: 'code',
      name: w('ADR', 'ADR'),
      hint: w(
        "the diff of the decision's file in the repository",
        'el diff del archivo de la decisión en el repo',
      ),
    },
  ],
  form: [
    ['fq', true],
    ['fctx', false],
  ],
  steps: [
    {
      key: 'sdig',
      name: w('Investigate', 'Investigar'),
      doer: 'any',
      reviewer: 'none',
      hand: [
        ['ffind', 'always', false],
        ['fsrc', 'always', false],
        ['fopts', 'always', false],
      ],
      take: w(
        'Read the decisions the repository already has first; if one already settles it, say so and do not open another. If the question is unclear, ask with otea ask before searching.',
        'Lee primero las decisiones que ya tiene el repo; si una ya lo resuelve, dilo y no abras otra. Si la pregunta no está clara, pregunta con otea ask antes de buscar.',
      ),
      before: w(
        'Mark in @{fopts} which one you recommend and why.',
        'Marca en @{fopts} cuál recomiendas y por qué.',
      ),
    },
    {
      key: 'sdecide',
      name: w('Decide', 'Decidir'),
      doer: 'you',
      reviewer: 'none',
      hand: [['fdecided', 'always', false]],
      ways: ['sdig', DONE],
    },
    {
      key: 'srecord',
      name: w('Record', 'Registrar'),
      doer: 'any',
      reviewer: 'you',
      hand: [['eadr', 'always', true]],
      take: w(
        'Write the ADR with the next number, in the format and language of the existing ones, taking @{fdecided} as it is. If the repository keeps no ADRs, say so in the note and hand in the text only.',
        'Escribe la ADR con el número siguiente, en el formato y el idioma de las que ya hay, recogiendo @{fdecided} tal cual. Si el repo no lleva ADR, dilo en la nota y entrega solo el texto.',
      ),
      review: w('Check it says what you decided.', 'Comprueba que dice lo que decidiste.'),
    },
  ],
  anytime: ['fdiag'],
  samples: {
    en: [
      'Do plugins ship with the core version?',
      'Which free hosting fits a site with heavy assets?',
    ],
    es: [
      '¿Los plugins se versionan con el núcleo?',
      '¿Qué hosting gratuito sirve para una web con assets pesados?',
    ],
  },
  list: { as: 'list', group: STEP },
  layout: {
    rounds: 'main',
    fq: 'top',
    fctx: 'main',
    ffind: 'main',
    fsrc: 'side',
    fopts: 'main',
    fdiag: 'main',
    fdecided: 'main',
    eadr: 'main',
  },
};

// Something judged by looking: an agent makes it, the person looks at each round (marking zones on
// the images, comparing with the round before) and sends it back until it is right; blind A/B is a
// choice made when the piece is created.
const DESIGN: Template = {
  key: 'design',
  icon: 'compare',
  name: w('Visual design', 'Diseño visual'),
  description: w(
    'Anything judged by looking: interfaces, illustrations, sprites, generated images. An agent makes it, you look at each round, mark what to change on the images and send it back until it is right.',
    'Todo lo que se juzga mirando: interfaces, ilustraciones, sprites, imágenes generadas. Un agente lo hace, miras cada ronda, marcas sobre las imágenes qué cambiar y lo devuelves hasta que quede bien.',
  ),
  board: w('Visual design', 'Diseño visual'),
  item: w('Piece', 'Pieza'),
  about: w(
    'Visual pieces an agent makes and the person approves by looking. Each round is shown the same way as the one before, so the person can compare them; it goes back as many times as needed.',
    'Piezas visuales que hace un agente y la persona aprueba mirándolas. Cada ronda se muestra igual que la anterior, para poder compararlas; vuelve tantas veces como haga falta.',
  ),
  idle: w(
    'No pieces for you. Wait with otea wait --turn agent --unclaimed; do not make pieces up.',
    'No hay piezas para ti. Espera con otea wait --turn agent --unclaimed; no inventes piezas.',
  ),
  parts: [
    {
      key: 'fbrief',
      kind: 'long',
      name: w('What it must convey', 'Qué tiene que transmitir'),
      hint: w(
        'what someone should see or feel without explanation',
        'lo que alguien tendría que ver o sentir sin explicación',
      ),
    },
    {
      key: 'frefs',
      kind: 'images',
      name: w('References', 'Referencias'),
      hint: w('the style or result you aim for', 'el estilo o el resultado al que apuntas'),
      show: 'gallery',
    },
    {
      key: 'fblind',
      kind: 'yesno',
      name: w('Blind comparison', 'Comparar a ciegas'),
      hint: w(
        'yes to judge each round as A and B without knowing which is new',
        'sí para juzgar cada ronda como A y B sin saber cuál es la nueva',
      ),
      initial: 'no',
    },
    {
      key: 'fbranch',
      kind: 'branch',
      name: w('Branch', 'Rama'),
      hint: w('design/<id>-<topic>, made from main', 'diseno/<id>-<tema>, creada desde main'),
      guard: { push: ['screate', 'sland'], base: 'main' },
    },
    {
      key: 'ediff',
      kind: 'code',
      name: w('Changes', 'Cambios'),
      hint: w('git diff of the branch against main', 'git diff de la rama contra main'),
    },
    {
      key: 'eshots',
      kind: 'images',
      name: w('Images', 'Imágenes'),
      hint: w(
        'the piece as it looks now, framed the same way every round',
        'la pieza como se ve ahora, encuadrada igual en cada ronda',
      ),
      show: 'one',
    },
    {
      key: 'eab',
      kind: 'images',
      name: w('A and B', 'A y B'),
      hint: w(
        'the previous round and this one, in random order, without saying which is which',
        'la ronda anterior y esta, en orden al azar, sin decir cuál es cuál',
      ),
      show: 'ab',
    },
    {
      key: 'emotion',
      kind: 'video',
      name: w('In motion', 'En movimiento'),
      hint: w(
        'a short GIF or video, when it is judged moving',
        'un GIF o vídeo corto, cuando se juzga en movimiento',
      ),
      show: 'player',
    },
    {
      key: 'fkey',
      kind: 'text',
      name: w('Which was which', 'Cuál era cuál'),
      hint: w('what A and B were, told after approval', 'qué eran A y B, dicho tras la aprobación'),
    },
    {
      key: 'fcommit',
      kind: 'text',
      name: w('Commit on main', 'Commit en main'),
      hint: w(
        'the short hash of the commit that landed on main',
        'el hash corto del commit que quedó en main',
      ),
    },
  ],
  form: [
    ['fbrief', true],
    ['frefs', false],
    ['fblind', false],
  ],
  steps: [
    {
      key: 'screate',
      name: w('Create', 'Crear'),
      doer: 'any',
      reviewer: 'you',
      hand: [
        ['fbranch', 'always'],
        ['ediff', 'always', true],
        ['eshots', 'always', true],
        ['eab', 'when', true, ['fblind', 'yes']],
      ],
      note: w('what you changed in this round and why', 'qué cambiaste en esta ronda y por qué'),
      take: w(
        'Read @{fbrief} and the notes of the last round before changing anything, and answer each one. Change what the notes ask for, nothing else.',
        'Lee @{fbrief} y las notas de la ronda anterior antes de cambiar nada, y responde cada una. Cambia lo que piden las notas, nada más.',
      ),
      before: w(
        'Attach @{eshots} framed exactly like the last round. With a blind comparison, attach @{eab} in random order and never say which one is new.',
        'Adjunta @{eshots} con el mismo encuadre que la ronda anterior. Si la comparación es a ciegas, adjunta @{eab} en orden al azar y nunca digas cuál es la nueva.',
      ),
      review: w(
        'Look before reading: mark on the images what you would change and send it back, or approve it.',
        'Mira antes de leer: marca sobre las imágenes lo que cambiarías y devuélvela, o apruébala.',
      ),
    },
    {
      key: 'sland',
      name: w('Land', 'Integrar'),
      doer: 'any',
      reviewer: 'none',
      hand: [
        ['fkey', 'when', false, ['fblind', 'yes']],
        ['fcommit', 'always'],
      ],
      take: w(
        'The person approved it: bring @{fbranch} into main and push it. Add nothing the person did not see.',
        'La persona la aprobó: integra @{fbranch} en main y empújala. No agregues nada que la persona no haya visto.',
      ),
      before: w(
        'Write in @{fcommit} the short hash on main; with a blind comparison, say in @{fkey} what A and B were.',
        'Escribe en @{fcommit} el hash corto en main; si fue a ciegas, di en @{fkey} qué eran A y B.',
      ),
    },
  ],
  anytime: ['emotion', 'frefs'],
  motives: [
    ['mrejected', w('Rejected', 'Rechazada')],
    ['mstale', w('No longer needed', 'Ya no hace falta')],
  ],
  list: { as: 'list', group: STEP },
  layout: {
    rounds: 'main',
    fbrief: 'top',
    frefs: 'main',
    eshots: 'main',
    eab: 'main',
    emotion: 'main',
    ediff: 'main',
    fblind: 'side',
    fbranch: 'side',
    fkey: 'side',
    fcommit: 'side',
  },
  samples: {
    en: ['Home screen icon', 'Title screen background', 'Empty state illustration'],
    es: [
      'Ícono de la pantalla de inicio',
      'Fondo de la pantalla de título',
      'Ilustración del estado vacío',
    ],
  },
};

const EXPERIMENTS: Template = {
  key: 'experiments',
  icon: 'compare',
  name: w('Experiments', 'Experimentos'),
  description: w(
    'Experiments with a hypothesis, a plan and one deciding metric: benchmarks, A/B tests, model or strategy tests. Nothing runs against live systems.',
    'Experimentos con una hipótesis, un plan y una métrica que decide: benchmarks, pruebas A/B, pruebas de modelos o estrategias. Nada corre contra sistemas en producción.',
  ),
  board: w('Experiments', 'Experimentos'),
  item: w('Experiment', 'Experimento'),
  about: w(
    'Experiments with a hypothesis, a plan and one deciding metric: benchmarks, A/B tests, model or strategy tests. Nothing runs against live systems.',
    'Experimentos con una hipótesis, un plan y una métrica que decide: benchmarks, pruebas A/B, pruebas de modelos o estrategias. Nada corre contra sistemas en producción.',
  ),
  idle: w(
    'Nothing here for you. Wait with otea wait --turn agent --unclaimed; do not invent work.',
    'No hay nada para ti aquí. Espera con otea wait --turn agent --unclaimed; no inventes trabajo.',
  ),
  parts: [
    {
      key: 'fhyp',
      kind: 'long',
      name: w('Hypothesis', 'Hipótesis'),
      hint: w('what you expect and why', 'lo que esperas y por qué'),
    },
    {
      key: 'fplan',
      kind: 'long',
      name: w('Design', 'Diseño'),
      hint: w(
        'what is run, on which data, and the metric that decides',
        'qué se corre, sobre qué datos, y la métrica que decide',
      ),
    },
    {
      key: 'fbranch',
      kind: 'branch',
      name: w('Branch', 'Rama'),
      hint: w('exp/<id>-<name>, from main', 'exp/<id>-<nombre>, desde main'),
      guard: { push: ['srun'] },
    },
    {
      key: 'ediff',
      kind: 'code',
      name: w('Code', 'Código'),
      hint: w('git diff main...HEAD', 'git diff main...HEAD'),
    },
    {
      key: 'elog',
      kind: 'log',
      name: w('Run output', 'Salida de la ejecución'),
      hint: w(
        'the full output, with seeds and data versions',
        'la salida completa, con semillas y versiones de los datos',
      ),
    },
    {
      key: 'fresult',
      kind: 'long',
      name: w('Result', 'Resultado'),
      hint: w(
        'the metric against the baseline, and whether the hypothesis holds',
        'la métrica frente a la base, y si la hipótesis se sostiene',
      ),
    },
  ],
  form: [
    ['fhyp', true],
    ['fplan', false],
  ],
  steps: [
    {
      key: 'splan',
      name: w('Plan', 'Planificar'),
      doer: 'any',
      reviewer: 'you',
      hand: [['fplan', 'always', false]],
      take: w(
        'Turn @{fhyp} into a plan with a baseline and one deciding metric.',
        'Convierte @{fhyp} en un plan con una base y una sola métrica que decide.',
      ),
    },
    {
      key: 'srun',
      name: w('Run', 'Correr'),
      doer: 'any',
      reviewer: 'you',
      hand: [
        ['fbranch', 'always', false],
        ['ediff', 'always', true],
        ['elog', 'always', true],
        ['fresult', 'always', false],
      ],
      take: w(
        'Run exactly @{fplan}. Never touch production data or live systems.',
        'Corre exactamente @{fplan}. Nunca toques datos de producción ni sistemas en vivo.',
      ),
      review: w(
        'Compare @{fresult} with the baseline before believing it.',
        'Compara @{fresult} con la base antes de creerlo.',
      ),
      note: w('what makes you doubt the result', 'qué te hace dudar del resultado'),
    },
  ],
  anytime: [],
  samples: {
    en: ['Does caching the index halve the cold start?', 'Does the shorter prompt keep accuracy?'],
    es: [
      '¿Guardar el índice en caché reduce a la mitad el arranque en frío?',
      '¿El prompt más corto mantiene la precisión?',
    ],
  },
  motives: [
    ['mfalse', w('Hypothesis rejected', 'Hipótesis descartada')],
    ['mstale', w('No longer relevant', 'Ya no hace falta')],
  ],
  list: { as: 'list', group: STEP },
  layout: {
    rounds: 'main',
    fhyp: 'top',
    fplan: 'main',
    fbranch: 'side',
    ediff: 'main',
    elog: 'main',
    fresult: 'main',
  },
};

export const CATALOGUE_TEMPLATES: readonly Template[] = [
  BUG_REPORTS,
  CHANGES,
  RESEARCH,
  DECISIONS,
  CONTENT,
  DESIGN,
  EXPERIMENTS,
];
