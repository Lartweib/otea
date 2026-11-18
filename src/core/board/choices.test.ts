import { describe, expect, it } from 'vitest';
import { choiceOf, OPTION_CHOSEN, optionsOf, pickableOptions } from './choices.ts';
import type { BoardDefinition } from './model.ts';

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
