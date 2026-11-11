import type { BoardDefinition, Step } from './model.ts';

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
    ...rest,
  };
}

// Criaturas: Concepto (any agent, you review, concept art new each round, may skip to Hecho),
// Animar (kiln does it, scout reviews, a send-back lands on Concepto) and Pulir (you do it).
export function creatures(): BoardDefinition {
  return {
    schema: 1,
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
  };
}
