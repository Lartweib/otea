import { describe, expect, it } from 'vitest';
import { instructionHints } from './hints.ts';
import type { BoardDefinition, Step } from './model.ts';
import { instantiate, TEMPLATES } from './templates.ts';
import { creatures } from './testing.ts';

const at = (def: BoardDefinition, id: string) => def.steps.find((s) => s.id === id) as Step;
// Criaturas with no words of its own about the board, so a step's instructions are all its agent reads.
const bare = () => ({ ...creatures(), about: '' });

describe('instructionHints, what an agent reads on a step', () => {
  it('finds nothing on a board whose instructions match its handoffs', () => {
    expect(instructionHints(creatures())).toEqual([]);
  });

  it('notes a step an agent works with nothing to read', () => {
    const def = bare();
    at(def, 'sconcept').instructions = { take: ' ', before: '', review: '' };
    expect(instructionHints(def)).toEqual([
      { code: 'instructions_missing', step: 'sconcept', params: { step: 'Concepto' } },
    ]);
  });

  it('counts the board’s own words as something the agent reads', () => {
    const def = creatures();
    at(def, 'sconcept').instructions = { take: '', before: '', review: '' };
    expect(def.about).not.toBe('');
    expect(instructionHints(def)).toEqual([]);
  });

  it('counts the review instructions when an agent only reviews', () => {
    const def = bare();
    const polish = at(def, 'spolish');
    polish.reviewer = 'any';
    expect(instructionHints(def).map(({ code, step }) => [code, step])).toEqual([
      ['instructions_missing', 'spolish'],
    ]);
    polish.instructions.review = 'Mira que el pulido no cambie la silueta.';
    expect(instructionHints(def)).toEqual([]);
  });

  it('leaves alone a step no agent does or reviews', () => {
    const def = creatures();
    expect(at(def, 'spolish').instructions).toEqual({ take: '', before: '', review: '' });
    expect(instructionHints(def).some(({ step }) => step === 'spolish')).toBe(false);
  });

  it('notes instructions that ask for a part the handoff does not require', () => {
    const def = creatures();
    // Animación is not on Concepto's handoff at all; Código is only optional on Animar's.
    at(def, 'sconcept').instructions.before = 'Adjunta el @[eart] y un bucle en @[eanim].';
    at(def, 'sanimate').instructions.before = 'Deja los @[ecode] y los @[ecode].';
    expect(instructionHints(def)).toEqual([
      {
        code: 'instructions_ask_part',
        step: 'sconcept',
        params: { step: 'Concepto', part: 'Animación' },
      },
      {
        code: 'instructions_ask_part',
        step: 'sanimate',
        params: { step: 'Animar', part: 'Cambios de código' },
      },
    ]);
  });

  it('reads what the item already carries without a hint', () => {
    const def = creatures();
    // Descripción comes with the form, Arte conceptual from Concepto: reading them is fine.
    at(def, 'sanimate').instructions.take = 'Lee la @[fdesc] y parte del @[eart].';
    expect(instructionHints(def)).toEqual([]);
  });

  it('notes instructions that ask to attach something when no evidence is required', () => {
    const def = creatures();
    const animate = at(def, 'sanimate');
    animate.hand = animate.hand.filter(({ ref }) => ref === 'fsteps');
    animate.instructions.before = 'Adjuntá el resultado de los tests.';
    expect(instructionHints(def)).toEqual([
      { code: 'instructions_ask_evidence', step: 'sanimate', params: { step: 'Animar' } },
    ]);
    animate.instructions.before = 'Attach a screenshot of the run.';
    expect(instructionHints(def).map(({ code }) => code)).toEqual(['instructions_ask_evidence']);
    // Evidence the handoff requires answers the ask.
    animate.hand.push({ ref: 'eanim', req: 'always', fresh: true });
    expect(instructionHints(def)).toEqual([]);
  });

  it('finds nothing in the templates, in either language', () => {
    for (const template of TEMPLATES)
      for (const lang of ['en', 'es'] as const) {
        const def = instantiate(template, lang, {});
        expect([template.key, lang, instructionHints(def)]).toEqual([template.key, lang, []]);
      }
  });
});
