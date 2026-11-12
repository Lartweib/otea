import { type BoardDefinition, boardDefaults, type Step, stepDefaults } from './model.ts';

const none = { take: '', before: '', review: '' };

export function step(id: string, name: string, rest: Partial<Step> = {}): Step {
  return {
    id,
    name,
    doer: 'any',
    reviewer: 'you',
    hand: [],
    ways: [],
    back: 'same',
    instructions: { ...none },
    ...stepDefaults(),
    ...rest,
  };
}

// Criaturas: Concepto (any agent, you review, concept art new each round, may skip to Hecho),
// Animar (kiln does it, scout reviews, a send-back lands on Concepto) and Pulir (you do it).
export function creatures(): BoardDefinition {
  return {
    schema: 2,
    name: 'Criaturas',
    item: 'Criatura',
    icon: 'paw',
    title: 'Título',
    parts: {
      fdesc: { id: 'fdesc', name: 'Descripción', kind: 'long', hint: 'cómo es', options: [] },
      fbiome: {
        id: 'fbiome',
        name: 'Bioma',
        kind: 'choice',
        hint: 'dónde vive',
        options: [
          { id: 'cswamp', name: 'Pantano' },
          { id: 'cwood', name: 'Bosque' },
        ],
      },
      fsteps: {
        id: 'fsteps',
        name: 'Comprobaciones',
        kind: 'check',
        hint: '',
        options: [
          { id: 'cone', name: 'Silueta' },
          { id: 'ctwo', name: 'Paleta' },
        ],
      },
      eart: {
        id: 'eart',
        name: 'Arte conceptual',
        kind: 'images',
        hint: '3 vistas',
        options: [],
        show: 'gallery',
      },
      eanim: {
        id: 'eanim',
        name: 'Animación',
        kind: 'video',
        hint: 'un bucle',
        options: [],
        show: 'strip',
      },
      ecode: { id: 'ecode', name: 'Cambios de código', kind: 'code', hint: '', options: [] },
      eswamp: { id: 'eswamp', name: 'Barro', kind: 'images', hint: '', options: [], show: 'one' },
    },
    form: [
      { ref: 'fdesc', required: true },
      { ref: 'fbiome', required: false },
    ],
    steps: [
      step('sconcept', 'Concepto', {
        hand: [
          { ref: 'eart', req: 'always', fresh: true },
          { ref: 'eswamp', req: 'when', when: { part: 'fbiome', value: 'cswamp' }, fresh: false },
        ],
        ways: ['done'],
        instructions: {
          take: 'Pinta desde la @[fdesc].',
          before: 'Adjunta el @[eart].',
          review: '',
        },
      }),
      step('sanimate', 'Animar', {
        doer: { agent: 'kiln' },
        reviewer: { agent: 'scout' },
        hand: [
          { ref: 'eanim', req: 'always', fresh: true },
          { ref: 'ecode', req: 'no', fresh: false },
          { ref: 'fsteps', req: 'always', fresh: false },
        ],
        back: 'sconcept',
        instructions: {
          take: 'Parte del @[eart] de @[sconcept].',
          before: '',
          review: 'Mira el bucle.',
        },
      }),
      step('spolish', 'Pulir', { doer: 'you', reviewer: 'none' }),
    ],
    anytime: [],
    layout: { fdesc: 'main', fbiome: 'side', eart: 'main', eanim: 'main' },
    row: ['fbiome'],
    about: 'Cada criatura del pantano.',
    idle: '',
    cap: { on: false, n: 3 },
    samples: ['Tortuga musgosa'],
    ...boardDefaults(),
  };
}

// Errores, as bug-triage becomes: Completar (any agent, nobody reviews, skipped when the bug
// arrives complete) → Triar (you; may give it back to Completar) → Arreglar (mender, you review, a
// note each handoff, may take it back to Triar, may drop it). Motives on discard, page only.
export function errores(): BoardDefinition {
  const def = creatures();
  def.name = 'Errores';
  def.item = 'Bug';
  def.parts = {
    fsteps: { id: 'fsteps', name: 'Pasos', kind: 'long', hint: '', options: [] },
    fcat: {
      id: 'fcat',
      name: 'Categoría',
      kind: 'choice',
      hint: '',
      options: [{ id: 'cgame', name: 'Juego' }],
    },
    ecode: { id: 'ecode', name: 'Cambios de código', kind: 'code', hint: '', options: [] },
    fbranch: {
      id: 'fbranch',
      name: 'Rama',
      kind: 'branch',
      hint: '',
      options: [],
      guard: { push: ['sfix'], repo: 'frepo' },
    },
    frepo: { id: 'frepo', name: 'Repo', kind: 'text', hint: '', options: [] },
  };
  def.form = [];
  def.layout = {};
  def.row = [];
  def.steps = [
    step('sfill', 'Completar', {
      reviewer: 'none',
      hand: [{ ref: 'fsteps', req: 'always', fresh: false }],
      skipWhenReady: true,
    }),
    step('striage', 'Triar', {
      doer: 'you',
      reviewer: 'none',
      hand: [{ ref: 'fcat', req: 'always', fresh: false }],
      ways: ['sfill'],
    }),
    step('sfix', 'Arreglar', {
      doer: { agent: 'mender' },
      hand: [{ ref: 'ecode', req: 'always', fresh: false }],
      ways: ['striage'],
      note: { req: 'always', hint: 'la prueba' },
      waits: ['parts', 'blockers'],
      doerMayDrop: true,
    }),
  ];
  def.anytime = ['fbranch', 'frepo'];
  // Its bugs may divide into smaller bugs on the same board.
  def.split = { board: 'same', always: false };
  def.drop = {
    by: 'page',
    motives: [
      { id: 'rejected', name: 'Rechazado' },
      { id: 'duplicate', name: 'Duplicado' },
    ],
  };
  return def;
}

// Cambios: Analizar (any agent, you review; the Plan) → Ejecutar (any agent, you review; waits for
// its parts). Each Cambio divides into Tareas de repo (board brt), always.
export function cambios(): BoardDefinition {
  const def = creatures();
  def.name = 'Cambios';
  def.item = 'Cambio';
  def.parts = {
    fwhat: { id: 'fwhat', name: 'Qué cambia', kind: 'long', hint: '', options: [] },
    fplan: { id: 'fplan', name: 'Plan', kind: 'long', hint: '', options: [] },
  };
  def.form = [{ ref: 'fwhat', required: true }];
  def.layout = { parts: 'main' };
  def.row = [];
  def.steps = [
    step('sanalyse', 'Analizar', { hand: [{ ref: 'fplan', req: 'always', fresh: false }] }),
    step('sexec', 'Ejecutar', { waits: ['parts'] }),
  ];
  def.split = { board: 'brt', always: true };
  return def;
}

// Tareas de repo: Propuesta (you) → Implementar (any agent, you review; may take it back to
// Propuesta). Rama is protected: pushed only while Implementar is done, repository from Repo.
export function tareasDeRepo(): BoardDefinition {
  const def = creatures();
  def.name = 'Tareas de repo';
  def.item = 'Tarea de repo';
  def.parts = {
    frepo: { id: 'frepo', name: 'Repo', kind: 'text', hint: '', options: [] },
    fbranch: {
      id: 'fbranch',
      name: 'Rama',
      kind: 'branch',
      hint: '',
      options: [],
      guard: { push: ['simpl'], repo: 'frepo' },
    },
    fwhat: { id: 'fwhat', name: 'Qué propone', kind: 'long', hint: '', options: [] },
    ecode: { id: 'ecode', name: 'Cambios de código', kind: 'code', hint: '', options: [] },
  };
  def.form = [
    { ref: 'frepo', required: true },
    { ref: 'fbranch', required: true },
  ];
  def.layout = {};
  def.row = ['frepo'];
  def.steps = [
    step('sprop', 'Propuesta', {
      doer: 'you',
      reviewer: 'none',
      hand: [{ ref: 'fwhat', req: 'always', fresh: false }],
    }),
    step('simpl', 'Implementar', {
      hand: [{ ref: 'ecode', req: 'always', fresh: false }],
      ways: ['sprop'],
    }),
  ];
  return def;
}
