import { afterEach, describe, expect, it } from 'vitest';
import { blankBoard } from '../../../../src/core/board/templates.ts';
import { creatures } from '../../../../src/core/board/testing.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import {
  handConseq,
  instructionHints,
  type Name,
  plain,
  roundsSentence,
  type Sentence,
  stepConseq,
  summary,
  waysConseq,
} from './sentences.ts';

afterEach(() => setLanguage('en'));

const text = (list: readonly Sentence[]) => list.map(plain).join(' ');
const step = (def: ReturnType<typeof creatures>, id: string) => {
  const found = def.steps.find((s) => s.id === id);
  if (!found) throw new Error(id);
  return found;
};
const online = [
  { name: 'kiln', connected: true },
  { name: 'scout', connected: true },
];

describe('summary', () => {
  it('says a blank board in both languages', () => {
    setLanguage('es');
    const es = blankBoard('es', { name: 'Criaturas', item: 'Criatura' });
    expect(text(summary(es))).toBe(
      'Cada criatura empieza con Título. En Hacerlo, cualquier agente lo hace y tú lo revisas. Después, Hecho.',
    );
    setLanguage('en');
    const en = blankBoard('en', { name: 'Creatures', item: 'Creature' });
    expect(text(summary(en))).toBe(
      'Each creature starts with Title. In Do it, any agent does it and you review it. After that, Done.',
    );
  });

  it('names the form, each step, what it hands off and its other ways', () => {
    setLanguage('es');
    expect(text(summary(creatures()))).toBe(
      'Cada criatura empieza con Título, Descripción y Bioma. ' +
        'En Concepto, cualquier agente lo hace y tú lo revisas; entrega Arte conceptual y Barro. ' +
        'Desde Concepto también puede ir a Hecho. ' +
        'Luego, en Animar, kiln lo hace y scout lo revisa; entrega Animación y Comprobaciones. ' +
        'Luego, en Pulir, lo haces tú y nadie lo revisa. Después, Hecho.',
    );
  });

  it('says how to start when there are no steps', () => {
    setLanguage('es');
    const def = creatures();
    def.steps = [];
    expect(plain(summary(def)[1] as Sentence)).toBe('Todavía no tiene pasos: añade uno con +.');
  });

  it('marks the board’s own words as names', () => {
    const [start, first] = summary(creatures());
    expect(start?.params?.form).toEqual({
      names: ['Título', 'Descripción', 'Bioma'],
      join: 'and',
    });
    expect(first?.params?.step).toEqual({
      name: 'Concepto',
      at: { kind: 'step', id: 'sconcept' },
    });
  });

  it('points each step and Hecho at its card, so the summary can select them', () => {
    setLanguage('es');
    const named = summary(creatures()).flatMap((s) =>
      Object.values(s.params ?? {}).filter((v): v is Name => typeof v === 'object' && 'at' in v),
    );
    expect(named.map(({ name, at }) => [name, at])).toEqual([
      ['Concepto', { kind: 'step', id: 'sconcept' }],
      ['Concepto', { kind: 'step', id: 'sconcept' }],
      ['Animar', { kind: 'step', id: 'sanimate' }],
      ['Pulir', { kind: 'step', id: 'spolish' }],
      ['Hecho', { kind: 'done' }],
    ]);
  });
});

describe('stepConseq', () => {
  it('says what each choice of who means', () => {
    setLanguage('es');
    const def = creatures();
    expect(text(stepConseq(step(def, 'sconcept'), online))).toBe(
      'Cuando un agente lo entrega, es tu turno: lo apruebas o lo devuelves.',
    );
    expect(text(stepConseq(step(def, 'sanimate'), online))).toBe(
      'scout lo aprueba o pide otra ronda, y adjunta lo que le pidas.',
    );
    expect(text(stepConseq(step(def, 'spolish'), online))).toBe(
      'Es tu paso: lo haces y lo entregas tú. Nadie lo revisa.',
    );
    setLanguage('en');
    expect(text(stepConseq(step(def, 'sconcept'), online))).toBe(
      'When an agent hands it off, it is your turn: you approve it or send it back.',
    );
  });

  it('warns when you review your own step and when an agent was never seen', () => {
    setLanguage('es');
    const def = creatures();
    const polish = { ...step(def, 'spolish'), reviewer: 'you' as const };
    const [self] = stepConseq(polish, online);
    expect(self).toMatchObject({ level: 'warn' });
    expect(plain(self as Sentence)).toBe(
      'Lo haces y lo revisas tú: es lo mismo que nadie lo revise.',
    );
    const offline = stepConseq(step(def, 'sanimate'), [{ name: 'kiln', connected: true }]);
    expect(offline.at(-1)).toMatchObject({ level: 'warn' });
    expect(plain(offline.at(-1) as Sentence)).toBe(
      'scout no está conectado todavía, así que los ítems esperarán en Animar.',
    );
  });

  it('says that nobody reviews their own work', () => {
    setLanguage('es');
    const def = creatures();
    const animate = { ...step(def, 'sanimate'), doer: { agent: 'scout' } };
    expect(text(stepConseq(animate, online))).toContain(
      'Nadie revisa su propio trabajo: si lo hizo scout, la revisión es tuya.',
    );
  });
});

describe('handConseq', () => {
  it('changes with required, only when, optional and new each round', () => {
    setLanguage('es');
    const def = creatures();
    const concept = step(def, 'sconcept');
    const [art, mud] = concept.hand;
    if (!art || !mud) throw new Error('fixture');
    expect(text(handConseq(def, concept, art))).toBe(
      'Un agente no puede entregarlo sin Arte conceptual, y en cada ronda tiene que traer una versión nueva.',
    );
    expect(text(handConseq(def, concept, { ...art, fresh: false }))).toBe(
      'Un agente no puede entregarlo sin Arte conceptual.',
    );
    expect(text(handConseq(def, concept, mud))).toBe('Obligatorio solo cuando Bioma es Pantano.');
    expect(text(handConseq(def, concept, { ...art, req: 'no' }))).toBe(
      'Opcional: se puede entregar sin esto.',
    );
    setLanguage('en');
    expect(text(handConseq(def, concept, mud))).toBe('Required only when Bioma is Pantano.');
  });

  it('asks for every box of a checklist, and speaks to you on your own step', () => {
    setLanguage('es');
    const def = creatures();
    const animate = step(def, 'sanimate');
    const checks = animate.hand[2];
    if (!checks) throw new Error('fixture');
    expect(text(handConseq(def, animate, checks))).toBe(
      'Un agente no puede entregarlo sin Comprobaciones. Hacen falta todas las casillas marcadas.',
    );
    expect(text(handConseq(def, { ...animate, doer: 'you' }, checks))).toBe(
      'No puedes entregarlo sin Comprobaciones. Hacen falta todas las casillas marcadas.',
    );
  });
});

describe('waysConseq', () => {
  it('says the choice at approval, or who chooses', () => {
    setLanguage('es');
    const def = creatures();
    expect(plain(waysConseq(def, step(def, 'sconcept')) as Sentence)).toBe(
      'Al aprobar eliges: Aprobar → Animar o → Hecho.',
    );
    expect(waysConseq(def, step(def, 'sanimate'))).toBeNull();
    const animate = { ...step(def, 'sanimate'), ways: ['done'] };
    def.steps[1] = animate;
    expect(plain(waysConseq(def, animate) as Sentence)).toBe(
      'Quien termina el paso elige Pulir o Hecho y dice por qué. Si eso te deja menos por revisar, te llega como pregunta.',
    );
    setLanguage('en');
    expect(plain(waysConseq(def, step(def, 'sconcept')) as Sentence)).toBe(
      'When you approve it you choose: Approve → Animar or → Done.',
    );
  });
});

describe('roundsSentence', () => {
  it('names the step a send-back lands on', () => {
    setLanguage('es');
    const def = creatures();
    expect(plain(roundsSentence(def, step(def, 'sanimate')))).toContain(
      'si vuelve a Concepto por tercera vez, es la ronda 3.',
    );
  });
});

describe('instructionHints, on the card', () => {
  it('says each hint of the step in the language on screen, as a warning', () => {
    setLanguage('es');
    const def = { ...creatures(), about: '' };
    const concept = step(def, 'sconcept');
    concept.instructions = { take: '', before: '', review: '' };
    const animate = step(def, 'sanimate');
    animate.instructions.before = 'Deja los @[ecode].';
    expect(instructionHints(def, concept).map(plain)).toEqual([
      'Nada le dice al agente qué hacer en este paso: escribe al menos una instrucción.',
    ]);
    expect(instructionHints(def, animate).map((s) => [plain(s), s.level])).toEqual([
      [
        'Las instrucciones piden Cambios de código, pero la entrega de este paso no lo exige.',
        'warn',
      ],
    ]);
    animate.hand = animate.hand.filter(({ ref }) => ref === 'fsteps');
    animate.instructions.before = 'Attach the test results.';
    setLanguage('en');
    expect(instructionHints(def, animate).map(plain)).toEqual([
      'The instructions ask to attach something, but this step’s handoff requires no evidence.',
    ]);
    expect(instructionHints(def, step(def, 'spolish'))).toEqual([]);
  });
});
