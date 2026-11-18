import { describe, expect, it } from 'vitest';
import { choiceOf, OPTION_CHOSEN, optionsOf, pickAt, pickableOptions } from './choices.ts';
import type { BoardDefinition } from './model.ts';
import { instantiate, requireTemplate } from './templates.ts';

const OPTIONS = [
  '### A · SQLite on the device (recommended)',
  'Everything stays local.',
  '+ works offline',
  '- no sync',
  '',
  '### B · A cloud backend',
  'A server keeps the data.',
].join('\n');

const def = {
  parts: {
    options: {
      id: 'options',
      name: 'Options',
      kind: 'long',
      hint: '',
      options: [],
      show: 'options',
    },
    brief: { id: 'brief', name: 'Brief', kind: 'long', hint: '', options: [] },
  },
} as unknown as BoardDefinition;

const human = { kind: 'human' as const, name: 'you' };

describe('the options a person picks from', () => {
  it('reads them from the long text the board shows as options', () => {
    const found = pickableOptions(def, { options: OPTIONS, brief: '### A · not options' });
    expect(found?.part).toBe('options');
    expect(
      found?.options.map(({ letter, name, recommended }) => [letter, name, recommended]),
    ).toEqual([
      ['A', 'SQLite on the device', true],
      ['B', 'A cloud backend', false],
    ]);
  });

  it('offers no pick with fewer than two options, or none shown as options', () => {
    expect(pickableOptions(def, { options: '### A · Only one' })).toBeUndefined();
    expect(pickableOptions(def, { brief: OPTIONS })).toBeUndefined();
    expect(optionsOf('No headings here')).toEqual([]);
  });

  it('keeps the last choice the person made, with its comment', () => {
    const events = [
      {
        type: OPTION_CHOSEN,
        actor: human,
        at: '1',
        data: { option: 'A', name: 'SQLite', step: 'refine', stepName: 'Refine' },
      },
      { type: 'transitioned', actor: human, at: '2', data: {} },
      {
        type: OPTION_CHOSEN,
        actor: human,
        at: '3',
        data: {
          option: 'B',
          name: 'A cloud backend',
          comment: 'we need sync',
          step: 'design',
          stepName: 'Design',
        },
      },
    ];
    expect(choiceOf(events)).toEqual({
      option: 'B',
      name: 'A cloud backend',
      comment: 'we need sync',
      at: '3',
      by: 'you',
      step: 'design',
      stepName: 'Design',
    });
    expect(choiceOf([])).toBeUndefined();
  });
});

describe('where the person picks', () => {
  const board = instantiate(requireTemplate('ideaboard'), 'es', {}, undefined, { keep: true });
  const fields = { options: OPTIONS };

  it('asks for a pick on the review of the step that hands the options in, with its ways on', () => {
    const at = pickAt(board, { state: 'refine__review', fields });
    expect(at?.options.map(({ letter }) => letter)).toEqual(['A', 'B']);
    expect(at?.forward).toEqual(['design']);
  });

  it('never asks again at a later review, nor while the step is being done', () => {
    expect(pickAt(board, { state: 'design__review', fields })).toBeUndefined();
    expect(pickAt(board, { state: 'refine', fields })).toBeUndefined();
    expect(pickAt(board, { state: 'done', fields })).toBeUndefined();
  });

  it('on a board whose steps never hand the options in, asks on any review of yours', () => {
    const loose = {
      ...board,
      steps: board.steps.map((step) => ({
        ...step,
        hand: step.hand.filter(({ ref }) => ref !== 'options'),
      })),
    };
    expect(pickAt(loose, { state: 'design__review', fields })?.forward).toEqual(['planit', 'done']);
  });
});
