import { afterEach, describe, expect, it } from 'vitest';
import { changePlan } from '../../../src/core/board/plan.ts';
import { problemsOf } from '../../../src/core/board/problems.ts';
import { cambios, creatures, errores, step } from '../../../src/core/board/testing.ts';
import { setLanguage } from '../i18n/i18n.ts';
import { changeText, doesText, kindName, problemText, reviewsText, targetName } from './words.ts';

afterEach(() => setLanguage('en'));

describe('problemText', () => {
  it('says every problem in words, in the language on screen', () => {
    const def = creatures();
    def.steps[1] = { ...(def.steps[1] ?? step('x', 'x')), name: 'Arte conceptual' };
    const [problem] = problemsOf(def, {
      agents: [
        { name: 'kiln', connected: true },
        { name: 'scout', connected: true },
      ],
    });
    if (!problem) throw new Error('fixture');
    setLanguage('es');
    expect(problemText(problem)).toBe(
      '«Arte conceptual» se usa para una evidencia y un paso. En un tablero cada nombre es único, para que las menciones con @ no se confundan.',
    );
    setLanguage('en');
    expect(problemText(problem)).toBe(
      '“Arte conceptual” is used for a piece of evidence and a step. Each name on a board is unique, so @ mentions never mix them up.',
    );
  });

  it('counts uses of one kind instead of repeating them', () => {
    const def = creatures();
    def.steps[1] = { ...(def.steps[1] ?? step('x', 'x')), name: 'Concepto' };
    const problem = problemsOf(def, {
      agents: [
        { name: 'kiln', connected: true },
        { name: 'scout', connected: true },
      ],
    }).find(({ code }) => code === 'duplicate_name');
    if (!problem) throw new Error('fixture');
    setLanguage('es');
    expect(problemText(problem)).toMatch(/^«Concepto» se usa para 2 pasos\./);
  });

  it('words an offline agent as the warning it is', () => {
    const [problem] = problemsOf(creatures(), { agents: [{ name: 'kiln', connected: true }] });
    if (!problem) throw new Error('fixture');
    setLanguage('es');
    expect(problemText(problem)).toBe(
      'scout no está conectado todavía, así que los ítems esperarán en Animar.',
    );
  });
});

describe('changeText', () => {
  it('says what publishing changes, as the design writes it', () => {
    setLanguage('es');
    expect(changePlan(null, creatures()).map(changeText)).toEqual([
      'Criaturas se crea con 3 pasos: Concepto, Animar y Pulir.',
    ]);
    const draft = creatures();
    draft.steps.push(step('snew', 'Montar', { doer: { agent: 'kiln' } }));
    draft.steps[0]?.hand.push({ ref: 'ecode', req: 'always', fresh: true });
    expect(changePlan(creatures(), draft).map(changeText)).toEqual([
      'Concepto entrega también Cambios de código, obligatorio y nuevo en cada ronda.',
      'Paso nuevo: Montar (kiln lo hace, tú lo revisas).',
    ]);
  });
});

describe('who and kinds', () => {
  it('says who does and reviews a step, and names kinds and targets', () => {
    setLanguage('es');
    expect(doesText('any')).toBe('cualquier agente lo hace');
    expect(doesText({ agent: 'kiln' })).toBe('kiln lo hace');
    expect(reviewsText('none')).toBe('nadie lo revisa');
    expect(kindName('video')).toBe('Vídeo o GIF');
    expect(targetName(creatures(), 'done')).toBe('Hecho');
    expect(targetName(creatures(), 'sanimate')).toBe('Animar');
  });
});

describe('the later settings, in words', () => {
  it('says the publish sentences of the design in Spanish', () => {
    setLanguage('es');
    const plain = errores();
    plain.steps = plain.steps.map((s) => ({
      ...s,
      ways: [],
      note: { req: 'no' as const, hint: '' },
      waits: [],
      skipWhenReady: false,
      doerMayDrop: false,
    }));
    plain.drop = { by: 'anyone', motives: [] };
    delete plain.parts.fbranch?.guard;
    const draft = errores();
    draft.drop = {
      by: 'page',
      motives: [...draft.drop.motives, { id: 'wont_fix', name: 'No se arreglará' }],
    };
    const words = changePlan(plain, draft).map(changeText);
    expect(words).toEqual(
      expect.arrayContaining([
        'Si al crearlo ya trae todo, empieza en Triar.',
        'Triar puede devolverlo a Completar, con una nota.',
        'Arreglar: quien lo hace puede regresarlo a Triar diciendo por qué.',
        'Arreglar pide una nota en cada entrega.',
        'Arreglar no se entrega mientras haya Errores sin terminar, ni mientras lo frene algo sin terminar.',
        'Otea protege la Rama: se sube solo mientras se hace Arreglar, y se fusiona cuando está Hecho.',
        'Al descartar se elige un motivo: Rechazado, Duplicado o No se arreglará.',
        'Descartar lo haces tú, solo desde la página.',
      ]),
    );
  });

  it('words every new problem', () => {
    setLanguage('es');
    const def = cambios();
    delete def.split;
    const [wait] = problemsOf(def, { agents: [] });
    if (!wait) throw new Error('fixture');
    expect(problemText(wait)).toBe(
      'Ejecutar espera a sus partes, pero Cambios no se divide en nada.',
    );
    const cycle = problemsOf(cambios(), {
      agents: [],
      id: 'bcam',
      boards: [
        { id: 'bcam', name: 'Cambios', split: { board: 'brt', always: true } },
        { id: 'brt', name: 'Tareas de repo', split: { board: 'bcam', always: false } },
      ],
    }).find(({ code }) => code === 'split_cycle');
    if (!cycle) throw new Error('fixture');
    expect(problemText(cycle)).toBe(
      'Cambios se divide en Tareas de repo y Tareas de repo en Cambios: un ítem acabaría siendo parte de sí mismo.',
    );
  });
});
