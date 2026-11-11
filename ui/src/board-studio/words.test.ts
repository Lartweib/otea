import { afterEach, describe, expect, it } from 'vitest';
import { changePlan } from '../../../src/core/board/plan.ts';
import { problemsOf } from '../../../src/core/board/problems.ts';
import { creatures, step } from '../../../src/core/board/testing.ts';
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
