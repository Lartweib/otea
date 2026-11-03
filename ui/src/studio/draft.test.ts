import { describe, expect, it } from 'vitest';
import {
  diffLines,
  pushIn,
  rawOf,
  readDraft,
  removeState,
  renameState,
  sectionOf,
  setIn,
} from './draft.ts';

const PRESET = `# Review rounds.
preset: rounds
preset_version: 1
fields:
  title: { module: text, required: create }
  # Where it ships.
  target: { module: enum, values: [shop, battle] }
workflow:
  initial: open
  states:
    open: { turn: agent }
    review: { turn: human }
    done: { turn: none, closes: done }
  transitions:
    - { from: open, to: review, by: agent }
    - { from: review, to: done, by: human-ui }
  gates:
    export: [done]
types:
  round:
    label: Round
`;

describe('editing a draft', () => {
  it('sets a value and keeps the comments and flow style around it', () => {
    const next = setIn(PRESET, ['fields', 'target'], {
      module: 'enum',
      values: ['shop', 'battle', 'overworld'],
      default: 'shop',
    });

    expect(next).toContain('# Where it ships.');
    expect(next).toContain(
      'target: { module: enum, values: [ shop, battle, overworld ], default: shop }',
    );
    expect(readDraft(next).ok).toBe(true);
  });

  it('adds a move in flow style and removes a value, dropping an empty map', () => {
    const added = pushIn(PRESET, ['workflow', 'transitions'], {
      from: 'review',
      to: 'open',
      by: 'human',
    });
    const removed = setIn(PRESET, ['workflow', 'gates', 'export'], undefined);

    expect(added).toContain('- { from: review, to: open, by: human }');
    expect(rawOf(removed).workflow?.gates).toBeUndefined();
  });

  it('renames a state everywhere the workflow names it', () => {
    const next = renameState(PRESET, ['workflow'], 'review', 'in_review');
    const { workflow } = rawOf(next);

    expect(Object.keys(workflow?.states ?? {})).toEqual(['open', 'in_review', 'done']);
    expect(workflow?.transitions).toEqual([
      { from: 'open', to: 'in_review', by: 'agent' },
      { from: 'in_review', to: 'done', by: 'human-ui' },
    ]);
    expect(readDraft(next).ok).toBe(true);
  });

  it('removes a state with the moves and gates that name it', () => {
    const next = removeState(PRESET, ['workflow'], 'done');
    const { workflow } = rawOf(next);

    expect(workflow?.transitions).toEqual([{ from: 'open', to: 'review', by: 'agent' }]);
    expect(workflow?.gates).toBeUndefined();
  });

  it('reads a draft with the core, which reports what is wrong and where', () => {
    const reading = readDraft(setIn(PRESET, ['workflow', 'states', 'polish'], { turn: 'human' }));

    expect(reading.ok).toBe(false);
    const problems = reading.ok ? [] : reading.problems;
    expect(problems).toContain(
      'workflow.states.polish: not reachable from the initial or incomplete state',
    );
    expect(problems.map(sectionOf)).toContain('states');
  });
});

describe('sectionOf', () => {
  it('files each problem under the section that fixes it', () => {
    expect(sectionOf('workflow.transitions.1.from: unknown state "x"')).toBe('moves');
    expect(sectionOf('types.round.workflow.gates.push[0]: unknown state "x"')).toBe('gates');
    expect(sectionOf('types.round.fields.size.module: unknown module "x"')).toBe('fields');
    expect(sectionOf('types.round.children[0]: unknown type "x"')).toBe('types');
    expect(sectionOf('view.group_by: title cannot group')).toBe('views');
  });
});

describe('diffLines', () => {
  it('marks the lines added and removed', () => {
    expect(diffLines('a\nb\nc', 'a\nc\nd')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'same', text: 'c' },
      { kind: 'add', text: 'd' },
    ]);
  });
});
