import { DONE, MOTIVE, STEP } from './model.ts';
import { EMPTY, w } from './template-words.ts';
import type { Template } from './templates.ts';

// The catalogue of ready-made boards for common jobs, designed and run end to end before they were
// offered: bug reports, content, a recurring digest, assets, research, decisions, experiments,
// support, visual iteration, playtests, resuming a dormant project and bugs handed to their owner.
// Keys are kept as the ids the boards were designed with.

const BUG_REPORTS: Template = {
  key: 'bug-reports',
  icon: 'bug',
  name: w('Bug reports', 'Reportes de errores'),
  description: w(
    'Bugs reported by the people who use what you make. Nothing is fixed before it is reproduced, and every fix comes with its proof.',
    'Errores que reporta la gente que usa lo que haces. Nada se arregla antes de reproducirlo, y cada arreglo llega con su prueba.',
  ),
  board: w('Bug reports', 'Reportes de errores'),
  item: w('Report', 'Reporte'),
  about: w(
    'Bugs reported by the people who use what you make. Nothing is fixed before it is reproduced, and every fix comes with its proof.',
    'Errores que reporta la gente que usa lo que haces. Nada se arregla antes de reproducirlo, y cada arreglo llega con su prueba.',
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
      ],
      take: w(
        'Read @{fsaid} and @{fsource}. If it is not enough to reproduce, ask the person with otea ask; never guess the steps.',
        'Lee @{fsaid} y @{fsource}. Si no alcanza para reproducirlo, pregunta a la persona con otea ask; nunca adivines los pasos.',
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
        'Fast-forward @{fbranch} into main without rewriting commits, then delete the branch.',
        'Lleva @{fbranch} a main con fast-forward, sin reescribir commits, y borra la rama.',
      ),
      before: w('Write the short hash in @{fcommit}.', 'Escribe el hash corto en @{fcommit}.'),
    },
  ],
  anytime: ['fkind'],
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
        'Write @{fdraft} from the approved @{foutline}. Cite a source for every fact.',
        'Escribe @{fdraft} a partir del @{foutline} aprobado. Cita una fuente para cada dato.',
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
  anytime: ['fcover', 'fchannel'],
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
    furl: 'side',
  },
};

const DIGEST: Template = {
  key: 'digest',
  icon: 'book',
  name: w('Digest', 'Resumen periódico'),
  description: w(
    'A recurring curated issue (daily or weekly): the agent collects with sources, you pick, the agent writes and publishes.',
    'Una edición periódica y curada (diaria o semanal): el agente recoge con fuentes, tú eliges, y el agente redacta y publica.',
  ),
  board: w('Digest', 'Resumen periódico'),
  item: w('Issue', 'Edición'),
  about: w(
    'A recurring curated issue (daily or weekly): the agent collects with sources, you pick, the agent writes and publishes.',
    'Una edición periódica y curada (diaria o semanal): el agente recoge con fuentes, tú eliges, y el agente redacta y publica.',
  ),
  idle: w(
    'Nothing here for you. Wait with otea wait --turn agent --unclaimed; do not invent work.',
    'No hay nada para ti aquí. Espera con otea wait --turn agent --unclaimed; no inventes trabajo.',
  ),
  parts: [
    {
      key: 'fperiod',
      kind: 'text',
      name: w('Period', 'Periodo'),
      hint: w('the day or week this issue covers', 'el día o la semana que cubre esta edición'),
    },
    {
      key: 'fcand',
      kind: 'long',
      name: w('Candidates', 'Candidatas'),
      hint: w(
        'one per line: what happened and why it matters',
        'una por línea: qué pasó y por qué importa',
      ),
    },
    {
      key: 'fsrc',
      kind: 'url',
      name: w('Sources', 'Fuentes'),
      hint: w('the primary source of each candidate', 'la fuente primaria de cada candidata'),
    },
    {
      key: 'fpick',
      kind: 'long',
      name: w('Picked', 'Elegidas'),
      hint: w('what goes in, in order', 'lo que entra, en orden'),
    },
    {
      key: 'ftext',
      kind: 'long',
      name: w('Issue', 'Edición'),
      hint: w('the issue as it will go out', 'la edición tal como va a salir'),
    },
    {
      key: 'furl',
      kind: 'url',
      name: w('Published at', 'Publicado en'),
      hint: w('where it lives once published', 'dónde queda una vez publicado'),
    },
  ],
  form: [['fperiod', true]],
  steps: [
    {
      key: 'scollect',
      name: w('Collect', 'Recoger'),
      doer: 'any',
      reviewer: 'none',
      hand: [
        ['fcand', 'always', false],
        ['fsrc', 'always', false],
      ],
      take: w(
        'Gather what happened in @{fperiod}. Primary sources only; leave out rumours.',
        'Reúne lo que pasó en @{fperiod}. Solo fuentes primarias; deja fuera los rumores.',
      ),
    },
    {
      key: 'spick',
      name: w('Pick', 'Elegir'),
      doer: 'you',
      reviewer: 'none',
      hand: [['fpick', 'always', false]],
    },
    {
      key: 'swrite',
      name: w('Write', 'Redactar'),
      doer: 'any',
      reviewer: 'you',
      hand: [['ftext', 'always', true]],
      take: w(
        'Write only what is in @{fpick}, in that order.',
        'Escribe solo lo que está en @{fpick}, en ese orden.',
      ),
      review: w('Check every fact against @{fsrc}.', 'Comprueba cada dato contra @{fsrc}.'),
    },
    {
      key: 'spublish',
      name: w('Go live', 'Poner en línea'),
      doer: 'any',
      reviewer: 'none',
      hand: [['furl', 'always', false]],
    },
  ],
  anytime: [],
  samples: { en: ['Week 47', 'Monday 17'], es: ['Semana 47', 'Lunes 17'] },
  list: { as: 'list', group: STEP },
  row: ['fperiod'],
  layout: {
    rounds: 'main',
    fperiod: 'side',
    fcand: 'main',
    fsrc: 'side',
    fpick: 'top',
    ftext: 'main',
    furl: 'side',
  },
};

const ASSETS: Template = {
  key: 'assets',
  icon: 'paw',
  name: w('Assets', 'Recursos'),
  description: w(
    'Art and other assets: the agent writes the spec and integrates, you make the art (change Make to an agent if a tool makes it).',
    'Arte y otros recursos: el agente escribe la especificación e integra, tú haces el arte (cambia Hacer a un agente si lo hace una herramienta).',
  ),
  board: w('Assets', 'Recursos'),
  item: w('Asset', 'Recurso'),
  about: w(
    'Art and other assets: the agent writes the spec and integrates, you make the art (change Make to an agent if a tool makes it).',
    'Arte y otros recursos: el agente escribe la especificación e integra, tú haces el arte (cambia Hacer a un agente si lo hace una herramienta).',
  ),
  idle: w(
    'Nothing here for you. Wait with otea wait --turn agent --unclaimed; do not invent work.',
    'No hay nada para ti aquí. Espera con otea wait --turn agent --unclaimed; no inventes trabajo.',
  ),
  parts: [
    {
      key: 'fidea',
      kind: 'long',
      name: w('Idea', 'Idea'),
      hint: w('what it is and where it is used', 'qué es y dónde se usa'),
    },
    {
      key: 'frefs',
      kind: 'images',
      name: w('References', 'Referencias'),
      hint: w('sketches or images that help', 'bocetos o imágenes que ayuden'),
      show: 'gallery',
    },
    {
      key: 'fspec',
      kind: 'long',
      name: w('Spec', 'Especificación'),
      hint: w(
        'sizes, format, states or variants, and the data it needs',
        'tamaños, formato, estados o variantes, y los datos que necesita',
      ),
    },
    {
      key: 'eart',
      kind: 'images',
      name: w('Art', 'Arte'),
      hint: w('the finished files', 'los archivos terminados'),
      show: 'gallery',
    },
    {
      key: 'fbranch',
      kind: 'branch',
      name: w('Branch', 'Rama'),
      hint: w('asset/<id>-<name>, from main', 'asset/<id>-<nombre>, desde main'),
      guard: { push: ['sintegrate'] },
    },
    {
      key: 'ediff',
      kind: 'code',
      name: w('Changes', 'Cambios'),
      hint: w('git diff main...HEAD', 'git diff main...HEAD'),
    },
    {
      key: 'epreview',
      kind: 'video',
      name: w('In place', 'En su sitio'),
      hint: w('the asset where it is used', 'el recurso donde se usa'),
      show: 'player',
    },
  ],
  form: [
    ['fidea', true],
    ['frefs', false],
  ],
  steps: [
    {
      key: 'sspec',
      name: w('Specify', 'Especificar'),
      doer: 'any',
      reviewer: 'you',
      hand: [['fspec', 'always', false]],
      take: w(
        'Match @{fspec} to the assets that already exist in the project.',
        'Alinea @{fspec} con los recursos que ya tiene el proyecto.',
      ),
    },
    {
      key: 'smake',
      name: w('Make', 'Hacer'),
      doer: 'you',
      reviewer: 'none',
      hand: [['eart', 'always', false]],
    },
    {
      key: 'sintegrate',
      name: w('Integrate', 'Integrar'),
      doer: 'any',
      reviewer: 'you',
      hand: [
        ['fbranch', 'always', false],
        ['ediff', 'always', true],
        ['epreview', 'always', true],
      ],
      take: w(
        'Wire @{eart} in the way the project already loads its assets.',
        'Conecta @{eart} como el proyecto ya carga sus recursos.',
      ),
      review: w('Compare @{epreview} with @{fspec}.', 'Compara @{epreview} con @{fspec}.'),
    },
  ],
  anytime: ['frefs'],
  samples: {
    en: ['New app icon set', 'Character idle animation'],
    es: ['Nuevo juego de iconos de la app', 'Animación en reposo del personaje'],
  },
  list: { as: 'list', group: STEP },
  layout: {
    rounds: 'main',
    fidea: 'top',
    frefs: 'main',
    fspec: 'main',
    eart: 'main',
    fbranch: 'side',
    ediff: 'main',
    epreview: 'main',
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

const SUPPORT: Template = {
  key: 'support',
  icon: 'checklist',
  name: w('Support', 'Soporte'),
  description: w(
    'Questions from the people who use what you make. The agent drafts the reply; you send it.',
    'Preguntas de la gente que usa lo que haces. El agente prepara la respuesta; tú la envías.',
  ),
  board: w('Support', 'Soporte'),
  item: w('Request', 'Consulta'),
  about: w(
    'Questions from the people who use what you make. The agent drafts the reply; you send it.',
    'Preguntas de la gente que usa lo que haces. El agente prepara la respuesta; tú la envías.',
  ),
  idle: w(
    'Nothing here for you. Wait with otea wait --turn agent --unclaimed; do not invent work.',
    'No hay nada para ti aquí. Espera con otea wait --turn agent --unclaimed; no inventes trabajo.',
  ),
  parts: [
    {
      key: 'fmsg',
      kind: 'long',
      name: w('Message', 'Mensaje'),
      hint: w('what they asked, as they wrote it', 'lo que preguntaron, tal como lo escribieron'),
    },
    {
      key: 'ffrom',
      kind: 'text',
      name: w('From', 'De'),
      hint: w('who asked, as you know them', 'quién preguntó, como lo conoces'),
    },
    {
      key: 'fsource',
      kind: 'url',
      name: w('Where', 'Dónde'),
      hint: w('link to the thread, ticket or email', 'enlace al hilo, ticket o correo'),
    },
    {
      key: 'freply',
      kind: 'long',
      name: w('Reply', 'Respuesta'),
      hint: w('the reply, ready to send', 'la respuesta, lista para enviar'),
    },
    {
      key: 'fsent',
      kind: 'text',
      name: w('Sent', 'Enviada'),
      hint: w('when and where you sent it', 'cuándo y por dónde la enviaste'),
    },
  ],
  form: [
    ['fmsg', true],
    ['ffrom', false],
    ['fsource', false],
  ],
  steps: [
    {
      key: 'sreply',
      name: w('Draft a reply', 'Preparar la respuesta'),
      doer: 'any',
      reviewer: 'you',
      hand: [['freply', 'always', true]],
      take: w(
        'Answer from the project docs and code only. If you do not know, say what you would need to find out; never promise dates or features.',
        'Responde solo con la documentación y el código del proyecto. Si no lo sabes, di qué necesitarías averiguar; nunca prometas fechas ni funciones.',
      ),
      review: w(
        'Read @{freply} as the person in @{ffrom} would.',
        'Lee @{freply} como lo leería la persona de @{ffrom}.',
      ),
    },
    {
      key: 'ssend',
      name: w('Send', 'Enviar'),
      doer: 'you',
      reviewer: 'none',
      hand: [['fsent', 'always', false]],
    },
  ],
  anytime: [],
  samples: {
    en: ['Can I import from the old version?', 'Is there a dark theme?'],
    es: ['¿Puedo importar desde la versión vieja?', '¿Hay tema oscuro?'],
  },
  list: { as: 'list', group: STEP },
  layout: {
    rounds: 'main',
    fmsg: 'top',
    ffrom: 'side',
    fsource: 'side',
    freply: 'main',
    fsent: 'side',
  },
};

const VISUAL_ITERATION: Template = {
  key: 'visual-iteration',
  icon: 'compare',
  name: w('Visual iteration', 'Iteración visual'),
  description: w(
    'For what is judged by looking, not measuring: procedural generation, sprites, shaders, interfaces. Each round changes one thing, is filmed like the previous one, and the person picks blind between A and B.',
    'Para lo que se juzga mirando, no midiendo: generación procedural, sprites, shaders, interfaces. Cada ronda cambia una sola cosa, se filma igual que la anterior, y la persona elige a ciegas entre A y B.',
  ),
  board: w('Visual iteration', 'Iteración visual'),
  item: w('Round', 'Ronda'),
  about: w(
    'For what is judged by looking, not measuring: procedural generation, sprites, shaders, interfaces. Each round changes one thing, is filmed like the previous one, and the person picks blind between A and B.',
    'Para lo que se juzga mirando, no midiendo: generación procedural, sprites, shaders, interfaces. Cada ronda cambia una sola cosa, se filma igual que la anterior, y la persona elige a ciegas entre A y B.',
  ),
  idle: w(
    'No rounds for you. Wait with otea wait --turn agent --unclaimed.',
    'No hay rondas para ti. Espera con otea wait --turn agent --unclaimed.',
  ),
  parts: [
    {
      key: 'fgoal',
      kind: 'long',
      name: w('What must read', 'Qué tiene que leerse'),
      hint: w(
        'what someone should see without explanation, such as "reads as a fish"',
        'lo que alguien tendría que ver sin explicación, como «se lee como un pez»',
      ),
    },
    {
      key: 'fref',
      kind: 'images',
      name: w('Reference', 'Referencia'),
      hint: w('the style or result you aim for', 'el estilo o el resultado al que apuntas'),
      show: 'gallery',
    },
    {
      key: 'fpred',
      kind: 'long',
      name: w('Prediction', 'Predicción'),
      hint: w(
        'what you change, what you expect to look different and what must not move',
        'qué cambias, qué esperas que se vea distinto y qué no tiene que moverse',
      ),
    },
    {
      key: 'fbranch',
      kind: 'branch',
      name: w('Branch', 'Rama'),
      hint: w(
        'vis/<id>-<topic>, from the working branch',
        'vis/<id>-<tema>, desde la rama de trabajo',
      ),
      guard: { push: ['srender', 'sland'] },
    },
    {
      key: 'ediff',
      kind: 'code',
      name: w('Changes', 'Cambios'),
      hint: w('git diff of the branch', 'git diff de la rama'),
    },
    {
      key: 'esheet',
      kind: 'images',
      name: w('Contact sheet', 'Hoja de contactos'),
      hint: w(
        'the same seeds, camera and scale as the previous round',
        'las mismas semillas, cámara y escala que la ronda anterior',
      ),
      show: 'gallery',
    },
    {
      key: 'eab',
      kind: 'images',
      name: w('A and B', 'A y B'),
      hint: w(
        'before and now, in random order, without saying which is which',
        'antes y ahora, en orden al azar, sin decir cuál es cuál',
      ),
      show: 'ba',
    },
    {
      key: 'egif',
      kind: 'video',
      name: w('In motion', 'En movimiento'),
      hint: w(
        'a short gif or video, when the change shows in motion',
        'un gif o vídeo corto, cuando el cambio se ve en movimiento',
      ),
      show: 'player',
    },
    {
      key: 'fverdict',
      kind: 'long',
      name: w('What I see', 'Lo que veo'),
      hint: w(
        'what you see, in your own words; no numbers',
        'lo que ves, con tus palabras; sin números',
      ),
    },
    {
      key: 'fpick',
      kind: 'choice',
      name: w('I keep', 'Me quedo con'),
      hint: w('which one you prefer', 'cuál prefieres'),
      options: [w('A', 'A'), w('B', 'B'), w('Neither', 'Ninguna')],
      optionKeys: ['pa', 'pb', 'pnone'],
    },
    {
      key: 'fkey',
      kind: 'text',
      name: w('Which was which', 'Cuál era cuál'),
      hint: w(
        'what A and B were, revealed after the verdict',
        'qué eran A y B, revelado después del veredicto',
      ),
    },
    {
      key: 'fcommit',
      kind: 'text',
      name: w('Commit', 'Commit'),
      hint: w('the short hash on the working branch', 'el hash corto en la rama de trabajo'),
    },
  ],
  form: [
    ['fgoal', true],
    ['fref', false],
  ],
  steps: [
    {
      key: 'spredict',
      name: w('Predict', 'Predecir'),
      doer: 'any',
      reviewer: 'none',
      hand: [['fpred', 'always', false]],
      take: w(
        "Read the previous round's verdict before changing anything. One change per round.",
        'Lee el veredicto de la ronda anterior antes de cambiar nada. Un cambio por ronda.',
      ),
    },
    {
      key: 'srender',
      name: w('Render', 'Generar'),
      doer: 'any',
      reviewer: 'none',
      hand: [
        ['fbranch', 'always', false],
        ['ediff', 'always', true],
        ['esheet', 'always', true],
        ['eab', 'always', true],
      ],
      take: w(
        "Render @{esheet} with the previous round's seeds and camera. Build @{eab} in random order and keep the key out of the person's sight. No numbers in what the person looks at.",
        'Genera @{esheet} con las semillas y la cámara de la ronda anterior. Arma @{eab} en orden al azar y no dejes la clave a la vista de la persona. Nada de números en lo que mira la persona.',
      ),
      before: w(
        'A round that does not change what the generator does does not count: do not hand in only comments or diagnostics.',
        'Una ronda que no cambia lo que hace el generador no cuenta: no entregues solo comentarios o diagnósticos.',
      ),
    },
    {
      key: 'slook',
      name: w('Look', 'Mirar'),
      doer: 'you',
      reviewer: 'none',
      hand: [
        ['fverdict', 'always', false],
        ['fpick', 'always', false],
      ],
      ways: ['spredict'],
    },
    {
      key: 'sland',
      name: w('Integrate', 'Integrar'),
      doer: 'any',
      reviewer: 'none',
      hand: [
        ['fkey', 'always', false],
        ['fcommit', 'always', false],
      ],
      take: w(
        'Write in @{fkey} what A and B were. If the new one won, integrate the branch; otherwise drop it and say so in the note.',
        'Escribe en @{fkey} qué eran A y B. Si ganó la nueva, integra la rama; si no, descártala y dilo en la nota.',
      ),
    },
  ],
  anytime: ['egif', 'fref'],
  samples: {
    en: ['The fish must not read as a snake', 'One-pixel outline on the hind legs'],
    es: ['El pez no tiene que parecer una serpiente', 'Contorno de un píxel en las patas traseras'],
  },
  motives: [
    ['mstuck', w('No progress', 'Sin avance')],
    ['mstale', w('No longer relevant', 'Ya no hace falta')],
  ],
  list: { as: 'list', group: STEP },
  layout: {
    rounds: 'main',
    fgoal: 'top',
    fref: 'main',
    fpred: 'main',
    fbranch: 'side',
    ediff: 'main',
    esheet: 'main',
    eab: 'main',
    egif: 'main',
    fverdict: 'main',
    fpick: 'side',
    fkey: 'side',
    fcommit: 'side',
  },
};

const PLAYTEST: Template = {
  key: 'playtest',
  icon: 'checklist',
  name: w('Playtest', 'Probar si es divertido'),
  description: w(
    'To validate a game or product idea before building it: a minimal prototype answers one question, the person plays it and decides to keep going, adjust or kill it.',
    'Para validar una idea de juego o de producto antes de construirla: un prototipo mínimo responde una sola pregunta, la persona lo juega y decide seguir, ajustar o matarla.',
  ),
  board: w('Playtest', 'Probar si es divertido'),
  item: w('Test', 'Prueba'),
  about: w(
    'To validate a game or product idea before building it: a minimal prototype answers one question, the person plays it and decides to keep going, adjust or kill it.',
    'Para validar una idea de juego o de producto antes de construirla: un prototipo mínimo responde una sola pregunta, la persona lo juega y decide seguir, ajustar o matarla.',
  ),
  idle: w(
    'No prototypes for you. Wait with otea wait --turn agent --unclaimed.',
    'No hay prototipos para ti. Espera con otea wait --turn agent --unclaimed.',
  ),
  parts: [
    {
      key: 'fq',
      kind: 'long',
      name: w('The question', 'La pregunta'),
      hint: w(
        'the single hypothesis this test validates, such as "is approaching step by step fun?"',
        'la única hipótesis que valida esta prueba, como «¿es divertido acercarse paso a paso?»',
      ),
    },
    {
      key: 'fkill',
      kind: 'long',
      name: w('Kill criterion', 'Criterio para matarla'),
      hint: w(
        'what would have to happen to drop the idea',
        'qué tendría que pasar para abandonar la idea',
      ),
    },
    {
      key: 'frun',
      kind: 'text',
      name: w('How to play it', 'Cómo jugarlo'),
      hint: w(
        'the command or scene to open, and what to do',
        'el comando o la escena que hay que abrir, y qué hacer',
      ),
    },
    {
      key: 'fbranch',
      kind: 'branch',
      name: w('Branch', 'Rama'),
      hint: w('proto/<id>-<topic>, from main', 'proto/<id>-<tema>, desde main'),
      guard: { push: ['sproto'] },
    },
    {
      key: 'ediff',
      kind: 'code',
      name: w('Changes', 'Cambios'),
      hint: w('git diff of the branch', 'git diff de la rama'),
    },
    {
      key: 'evideo',
      kind: 'video',
      name: w('A playthrough', 'Una partida'),
      hint: w(
        'one full session recorded by the agent',
        'una sesión completa grabada por el agente',
      ),
      show: 'player',
    },
    {
      key: 'fplayed',
      kind: 'long',
      name: w('How it felt', 'Cómo se sintió'),
      hint: w(
        'what you felt while playing, in your own words',
        'lo que sentiste al jugar, con tus palabras',
      ),
    },
    {
      key: 'fverdict',
      kind: 'choice',
      name: w('Verdict', 'Veredicto'),
      hint: w('what happens to the idea', 'qué pasa con la idea'),
      options: [w('Keep going', 'Seguir'), w('Adjust', 'Ajustar'), w('Kill it', 'Matarla')],
      optionKeys: ['vgo', 'vtune', 'vkill'],
    },
    {
      key: 'fchange',
      kind: 'long',
      name: w('What to adjust', 'Qué ajustar'),
      hint: w('the next thing to try, if it goes on', 'lo próximo que hay que probar, si sigue'),
    },
  ],
  form: [
    ['fq', true],
    ['fkill', true],
  ],
  steps: [
    {
      key: 'sproto',
      name: w('Prototype', 'Prototipar'),
      doer: 'any',
      reviewer: 'none',
      hand: [
        ['fbranch', 'always', false],
        ['ediff', 'always', true],
        ['evideo', 'always', true],
        ['frun', 'always', false],
      ],
      take: w(
        'Build the least that answers @{fq}: plain shapes, no art or menus. If it needs more than a few days, say so with otea ask first.',
        'Construye lo mínimo que responda @{fq}: formas simples, sin arte ni menús. Si necesita más de unos días, dilo antes con otea ask.',
      ),
      before: w(
        'Record @{evideo} playing it yourself and explain in @{frun} how to open it.',
        'Graba @{evideo} jugándolo tú y explica en @{frun} cómo abrirlo.',
      ),
    },
    {
      key: 'splay',
      name: w('Play', 'Jugar'),
      doer: 'you',
      reviewer: 'none',
      hand: [
        ['fplayed', 'always', false],
        ['fverdict', 'always', false],
      ],
      ways: ['sproto', DONE],
    },
  ],
  anytime: ['fchange'],
  samples: {
    en: [
      'Is reading the creature before each step fun?',
      'Does the shop make you want another run?',
    ],
    es: [
      '¿Es divertido leer a la criatura antes de cada paso?',
      '¿La tienda te deja con ganas de otra partida?',
    ],
  },
  motives: [
    ['mkill', w('Killed by its criterion', 'Descartada por su criterio')],
    ['mstale', w('No longer relevant', 'Ya no hace falta')],
  ],
  list: { as: 'list', group: STEP },
  layout: {
    rounds: 'main',
    fq: 'top',
    fkill: 'main',
    frun: 'side',
    fbranch: 'side',
    ediff: 'main',
    evideo: 'main',
    fplayed: 'main',
    fverdict: 'side',
    fchange: 'main',
  },
};

const RESUME: Template = {
  key: 'resume',
  icon: 'layers',
  name: w('Resume a project', 'Retomar un proyecto'),
  description: w(
    'To come back to a project that was dormant: the agent rebuilds the context and proposes next steps, you pick, and the agent creates them as items.',
    'Para volver a un proyecto que estuvo dormido: el agente reconstruye el contexto y propone próximos pasos, tú eliges, y el agente los deja creados como ítems.',
  ),
  board: w('Resume a project', 'Retomar un proyecto'),
  item: w('Resumption', 'Retomada'),
  about: w(
    'To come back to a project that was dormant: the agent rebuilds the context and proposes next steps, you pick, and the agent creates them as items.',
    'Para volver a un proyecto que estuvo dormido: el agente reconstruye el contexto y propone próximos pasos, tú eliges, y el agente los deja creados como ítems.',
  ),
  idle: w(
    'Nothing here for you. Wait with otea wait --turn agent --unclaimed; do not invent work.',
    'No hay nada para ti aquí. Espera con otea wait --turn agent --unclaimed; no inventes trabajo.',
  ),
  parts: [
    {
      key: 'frepo',
      kind: 'text',
      name: w('Project', 'Proyecto'),
      hint: w('the folder or repository being resumed', 'la carpeta o el repo que se retoma'),
    },
    {
      key: 'fgoal',
      kind: 'long',
      name: w('Why I am back', 'Para qué vuelvo'),
      hint: w(
        'what I want to get this time, even if vague',
        'qué quiero conseguir esta vez, aunque sea vago',
      ),
    },
    {
      key: 'fstate',
      kind: 'long',
      name: w('Where it stopped', 'Dónde quedó'),
      hint: w(
        'last activity, branches, what builds and which tests pass today',
        'última actividad, ramas, qué compila y qué pasan los tests hoy',
      ),
    },
    {
      key: 'fopen',
      kind: 'long',
      name: w('Open threads', 'Hilos abiertos'),
      hint: w(
        'TODOs, unmerged branches, issues, notes in the agent instructions or the log left half done',
        'TODO, ramas sin integrar, issues, notas de CLAUDE.md o del diario que quedaron a medias',
      ),
    },
    {
      key: 'fbroke',
      kind: 'long',
      name: w('What broke', 'Qué se rompió'),
      hint: w(
        'outdated dependencies, expired keys or services, security advisories',
        'dependencias viejas, claves o servicios caducados, avisos de seguridad',
      ),
    },
    {
      key: 'elog',
      kind: 'log',
      name: w('Check output', 'Salida de las comprobaciones'),
      hint: w(
        'install, build and run the tests, as it came out',
        'instalar, compilar y pasar los tests, tal como salió',
      ),
    },
    {
      key: 'fnext',
      kind: 'long',
      name: w('Next steps', 'Próximos pasos'),
      hint: w(
        'three to seven numbered steps, each with its size and what it unblocks',
        'de tres a siete pasos numerados, cada uno con su tamaño y lo que desbloquea',
      ),
    },
    {
      key: 'fpicked',
      kind: 'long',
      name: w('What I picked', 'Lo que elegí'),
      hint: w(
        'the chosen numbers, in order, and what will not be done',
        'los números elegidos, en orden, y lo que no se hace',
      ),
    },
    {
      key: 'fmade',
      kind: 'text',
      name: w('What was created', 'Lo que quedó creado'),
      hint: w(
        'the items created on other boards, by id',
        'los ítems creados en otros tableros, por id',
      ),
    },
  ],
  form: [
    ['frepo', true],
    ['fgoal', false],
  ],
  steps: [
    {
      key: 'sread',
      name: w('Rebuild', 'Reconstruir'),
      doer: 'any',
      reviewer: 'none',
      hand: [
        ['fstate', 'always', false],
        ['fopen', 'always', false],
        ['fbroke', 'always', false],
        ['elog', 'always', true],
        ['fnext', 'always', false],
      ],
      take: w(
        "Read the README, the agent instructions (such as AGENTS.md), the repository's log or decisions and the git history since the last burst of commits. Do not change anything in the repository yet.",
        'Lee el README, las instrucciones para agentes (como AGENTS.md), el diario o las decisiones del repo y el historial de git desde la última racha de commits. No cambies nada del repo todavía.',
      ),
      before: w(
        "Install and run the project's own checks and paste the output in @{elog}. In @{fnext}, put first whatever it takes to make it work again, and relate each step to @{fgoal}.",
        'Instala y corre las comprobaciones del propio proyecto y pega la salida en @{elog}. En @{fnext} pon primero lo que haga falta para que vuelva a funcionar, y relaciona cada paso con @{fgoal}.',
      ),
      note: w(
        'what surprised you about the state of the project',
        'lo que te sorprendió del estado del proyecto',
      ),
    },
    {
      key: 'spick',
      name: w('Pick', 'Elegir'),
      doer: 'you',
      reviewer: 'none',
      hand: [['fpicked', 'always', false]],
      ways: ['sread'],
    },
    {
      key: 'sseed',
      name: w('Prepare', 'Preparar'),
      doer: 'any',
      reviewer: 'none',
      hand: [['fmade', 'always', false]],
      take: w(
        'Create one item for each step in @{fpicked} on the board it belongs to: a board of changes for changes, one of ideas for what still needs thinking. Cite this resumption in each.',
        'Crea un ítem por cada paso de @{fpicked} en el tablero que le toque: uno de cambios para los cambios, uno de ideas para lo que aún hay que pensar. Cita esta retomada en cada uno.',
      ),
    },
  ],
  anytime: [],
  samples: {
    en: [
      'Back to the side project after summer',
      'Revive the old prototype',
      'Pick up the CLI where it stopped',
    ],
    es: [
      'Volver al proyecto personal después del verano',
      'Revivir el prototipo viejo',
      'Retomar la CLI donde quedó',
    ],
  },
  list: { as: 'list', group: STEP },
  row: ['frepo'],
  layout: {
    rounds: 'main',
    frepo: 'side',
    fgoal: 'top',
    fstate: 'main',
    fopen: 'main',
    fbroke: 'main',
    elog: 'main',
    fnext: 'main',
    fpicked: 'main',
    fmade: 'side',
  },
};

export const CATALOGUE_TEMPLATES: readonly Template[] = [
  BUG_REPORTS,
  CONTENT,
  DIGEST,
  ASSETS,
  RESEARCH,
  DECISIONS,
  EXPERIMENTS,
  SUPPORT,
  VISUAL_ITERATION,
  PLAYTEST,
  RESUME,
];
