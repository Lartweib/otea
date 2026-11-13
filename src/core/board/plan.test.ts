import { describe, expect, it } from 'vitest';
import type { BoardDefinition } from './model.ts';
import { changePlan, itemEffects, itemMoves } from './plan.ts';
import { creatures, step } from './testing.ts';

const kinds = (live: BoardDefinition | null, draft: BoardDefinition) =>
  changePlan(live, draft).map(({ kind }) => kind);

describe('changePlan', () => {
  it('says a new board is created with its steps', () => {
    expect(changePlan(null, creatures())).toEqual([
      { kind: 'created', board: 'Criaturas', steps: ['Concepto', 'Animar', 'Pulir'] },
    ]);
  });

  it('finds nothing when nothing changed', () => {
    expect(changePlan(creatures(), creatures())).toEqual([]);
  });

  it('says what changed on the board and its steps, in sentences the UI words', () => {
    const live = creatures();
    const draft = creatures();
    draft.name = 'Bestias';
    draft.item = 'Bestia';
    const [concept, animate] = draft.steps;
    if (!concept || !animate) throw new Error('fixture');
    concept.name = 'Boceto';
    concept.reviewer = 'none';
    concept.hand.push({ ref: 'ecode', req: 'always', fresh: false });
    concept.hand[0] = { ref: 'eart', req: 'no', fresh: false };
    animate.doer = 'you';
    animate.hand = animate.hand.filter(({ ref }) => ref !== 'ecode');
    animate.instructions.take = 'Otra cosa';
    draft.steps = draft.steps.filter(({ id }) => id !== 'spolish');
    draft.steps.push(step('snew', 'Animar en el motor', { doer: 'any' }));
    expect(changePlan(live, draft)).toEqual([
      { kind: 'board_renamed', from: 'Criaturas', to: 'Bestias' },
      { kind: 'item_renamed', to: 'Bestia' },
      { kind: 'step_renamed', step: 'sconcept', from: 'Concepto', to: 'Boceto' },
      { kind: 'step_reviewer', step: 'sconcept', name: 'Boceto', reviewer: 'none' },
      {
        kind: 'hand_changed',
        step: 'sconcept',
        name: 'Boceto',
        part: 'eart',
        partName: 'Arte conceptual',
        req: 'no',
        fresh: false,
      },
      {
        kind: 'hand_added',
        step: 'sconcept',
        name: 'Boceto',
        part: 'ecode',
        partName: 'Cambios de código',
        req: 'always',
        fresh: false,
      },
      { kind: 'step_doer', step: 'sanimate', name: 'Animar', doer: 'you' },
      {
        kind: 'hand_removed',
        step: 'sanimate',
        name: 'Animar',
        part: 'ecode',
        partName: 'Cambios de código',
      },
      { kind: 'step_instructions', step: 'sanimate', name: 'Animar' },
      {
        kind: 'step_added',
        step: 'snew',
        name: 'Animar en el motor',
        doer: 'any',
        reviewer: 'you',
      },
      { kind: 'step_removed', step: 'spolish', name: 'Pulir' },
    ]);
  });

  it('says when steps change order, ways change, parts are new, the form, layout, words or cap change', () => {
    const live = creatures();
    const draft = creatures();
    draft.steps.reverse();
    const animate = draft.steps.find(({ id }) => id === 'sanimate');
    if (animate) animate.back = 'same';
    const concept = draft.steps.find(({ id }) => id === 'sconcept');
    if (concept) concept.ways = [];
    draft.parts.fprio = { id: 'fprio', name: 'Prioridad', kind: 'level', hint: '', options: [] };
    draft.anytime = ['fprio'];
    draft.parts.fdesc = {
      ...(draft.parts.fdesc ?? { id: 'fdesc', kind: 'long', hint: '', options: [] }),
      name: 'Qué es',
    };
    draft.form = [{ ref: 'fdesc', required: true }];
    draft.layout = { ...draft.layout, fbiome: 'hidden' };
    draft.about = 'Otro texto';
    draft.cap = { on: true, n: 2 };
    expect(kinds(live, draft)).toEqual([
      'step_back',
      'step_ways',
      'steps_reordered',
      'part_renamed',
      'part_added',
      'form',
      'layout',
      'board_instructions',
      'cap',
    ]);
  });
});

describe('itemEffects', () => {
  const items = [
    { id: 'CRI-1', state: 'spolish' },
    { id: 'CRI-2', state: 'spolish' },
    { id: 'CRI-3', state: 'sanimate' },
    { id: 'CRI-4', state: 'sanimate__review' },
    { id: 'CRI-5', state: 'sconcept__review' },
    { id: 'CRI-6', state: 'done' },
  ];

  it('asks where the items of a removed step go, suggesting the next step that stays', () => {
    const draft = creatures();
    draft.steps = draft.steps.filter(({ id }) => id !== 'sanimate');
    expect(itemEffects(creatures(), draft, items).moves).toEqual([
      { step: 'sanimate', name: 'Animar', items: ['CRI-3', 'CRI-4'], suggested: 'spolish' },
    ]);
    const lastGone = creatures();
    lastGone.steps = lastGone.steps.filter(({ id }) => id !== 'spolish');
    expect(itemEffects(creatures(), lastGone, items).moves).toEqual([
      { step: 'spolish', name: 'Pulir', items: ['CRI-1', 'CRI-2'], suggested: 'done' },
    ]);
  });

  it('says which items being worked on will need more at their next handoff', () => {
    const draft = creatures();
    draft.steps[1]?.hand.push({ ref: 'ecode', req: 'always', fresh: false });
    const effects = itemEffects(creatures(), draft, items);
    expect(effects.needs).toEqual([
      { step: 'sanimate', name: 'Animar', items: ['CRI-3'], parts: ['Cambios de código'] },
    ]);
  });

  it('says which reviews go back to work when their step stops being reviewed', () => {
    const draft = creatures();
    const concept = draft.steps[0];
    if (concept) concept.reviewer = 'none';
    expect(itemEffects(creatures(), draft, items).reopened).toEqual([
      { step: 'sconcept', name: 'Concepto', items: ['CRI-5'] },
    ]);
  });
});

describe('itemMoves', () => {
  it('moves items of removed steps where asked, and reopens reviews that no longer exist', () => {
    const draft = creatures();
    draft.steps = draft.steps.filter(({ id }) => id !== 'spolish');
    const concept = draft.steps[0];
    if (concept) concept.reviewer = 'none';
    const items = [
      { id: 'CRI-1', state: 'spolish' },
      { id: 'CRI-5', state: 'sconcept__review' },
      { id: 'CRI-7', state: 'sanimate' },
    ];
    expect(itemMoves(creatures(), draft, items, { spolish: 'sconcept' })).toEqual({
      ok: true,
      moves: [
        { id: 'CRI-1', from: 'spolish', to: 'sconcept' },
        { id: 'CRI-5', from: 'sconcept__review', to: 'sconcept' },
      ],
    });
  });

  it('takes the suggestion for a removed step it was not told about', () => {
    const draft = creatures();
    draft.steps = draft.steps.filter(({ id }) => id !== 'spolish');
    expect(itemMoves(creatures(), draft, [{ id: 'CRI-1', state: 'spolish' }], {})).toEqual({
      ok: true,
      moves: [{ id: 'CRI-1', from: 'spolish', to: 'done' }],
    });
  });

  it('refuses a move to a step the draft does not have', () => {
    const draft = creatures();
    draft.steps = draft.steps.filter(({ id }) => id !== 'spolish');
    expect(
      itemMoves(creatures(), draft, [{ id: 'CRI-1', state: 'spolish' }], { spolish: 'spolish' }),
    ).toEqual({
      ok: false,
      step: 'spolish',
    });
  });
});
