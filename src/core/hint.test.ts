import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type HintInput, nextStep, playbookSection } from './hint.ts';
import { parsePreset } from './preset.ts';
import { tasks } from './testing.ts';
import type { Workflow } from './workflow.ts';

const bugs = parsePreset(
  readFileSync(new URL('../../presets/bug-triage/preset.yaml', import.meta.url), 'utf8'),
).workflow;

const utc = (iso: string) => iso.slice(11, 16);

const hint = (workflow: Workflow, input: Partial<HintInput> & { state: string }) =>
  nextStep(
    workflow,
    { lease: null, missing: [], emptyRequired: [], openChildren: 0, ...input },
    'claude',
    utc,
  );

const lease = (holder: string) => ({ holder, expiresAt: '2026-11-01T04:21:00.000Z' });

describe('nextStep', () => {
  it('walks an unclaimed item along the agent moves to the human, with evidence', () => {
    expect(hint(tasks, { state: 'todo' })).toBe(
      'Your turn: claim it, move it to in_progress, work it, then move it to review with evidence.',
    );
  });

  it('skips the claim when the agent holds the item, and says until when', () => {
    expect(hint(tasks, { state: 'in_progress', lease: lease('claude') })).toBe(
      'Your turn (you hold it until 04:21): work it, then move it to review with evidence.',
    );
  });

  it('names who holds an item another agent leased', () => {
    expect(hint(tasks, { state: 'in_progress', lease: lease('claude-b') })).toBe(
      'Held by claude-b until 04:21: pick another item.',
    );
  });

  it('asks to fill what is missing before an incomplete item leaves', () => {
    expect(hint(tasks, { state: 'incomplete', missing: ['description'] })).toBe(
      'Your turn: claim it, fill in description, then move it to todo.',
    );
  });

  it('waits on the human turn', () => {
    expect(hint(tasks, { state: 'review' })).toBe("Human's turn: wait (otea wait).");
  });

  it('has nothing left to do once closed', () => {
    expect(hint(tasks, { state: 'done' })).toBe('Closed (done): nothing left to do.');
    expect(hint(bugs, { state: 'duplicate' })).toBe('Closed (discarded): nothing left to do.');
  });

  it('asks for the reason a move requires', () => {
    expect(hint(bugs, { state: 'accepted', lease: lease('claude') })).toBe(
      'Your turn (you hold it until 04:21): move it to fixing, work it, then move it to verify with evidence and a reason.',
    );
  });

  it('goes back to an earlier state only when no move goes forward', () => {
    expect(hint(bugs, { state: 'needs_info', lease: lease('claude') })).toBe(
      'Your turn (you hold it until 04:21): work it, then move it to reported with evidence.',
    );
  });

  it('names the required evidence modules still empty', () => {
    expect(hint(tasks, { state: 'in_progress', emptyRequired: ['shots', 'log'] })).toBe(
      'Your turn: claim it, work it, then move it to review with evidence in shots and log.',
    );
  });

  it('waits for open children when the next state requires them closed', () => {
    const gated: Workflow = {
      ...tasks,
      states: tasks.states.map((state) =>
        state.name === 'review' ? { ...state, requires: 'children_closed' } : state,
      ),
    };

    expect(hint(gated, { state: 'in_progress', openChildren: 2 })).toBe(
      'Your turn: claim it, work it, then move it to review with evidence once its 2 open children are closed.',
    );
    expect(hint(gated, { state: 'in_progress', openChildren: 1 })).toContain(
      'once its 1 open child is closed.',
    );
  });

  it('says so when no agent move leads back to the human', () => {
    const stuck: Workflow = {
      name: 'stuck',
      initial: 'open',
      states: [
        { name: 'open', turn: 'agent' },
        { name: 'closed', turn: 'none', closes: 'done' },
      ],
      transitions: [{ from: 'open', to: 'closed', by: 'human', reasonRequired: false }],
    };

    expect(hint(stuck, { state: 'open' })).toBe(
      'Your turn: claim it and work it; no move of yours leaves open (see otea playbook).',
    );
  });

  it('uses the playbook section of the state when there is one', () => {
    expect(hint(tasks, { state: 'review', section: 'Leave it; the human approves it.' })).toBe(
      "Human's turn: Leave it; the human approves it.",
    );
    expect(hint(tasks, { state: 'todo', section: 'Read the brief first.' })).toBe(
      'Your turn: Read the brief first.',
    );
    expect(hint(tasks, { state: 'todo', section: 'Read it.', lease: lease('claude-b') })).toBe(
      'Held by claude-b until 04:21: pick another item.',
    );
  });
});

describe('playbookSection', () => {
  const playbook = [
    '# Playbook',
    '',
    '## 1. Start',
    '',
    'Begin here.',
    '',
    '## `in_progress`',
    '',
    'Work it and attach',
    'the test output.',
    '',
    'Then more.',
    '',
    '### review',
    '',
    '- Leave it.',
    '',
  ].join('\n');

  it('reads the first paragraph under a heading that names the state', () => {
    expect(playbookSection(playbook, 'in_progress')).toBe('Work it and attach the test output.');
    expect(playbookSection(playbook, 'review')).toBe('- Leave it.');
  });

  it('finds nothing for a state no heading names', () => {
    expect(playbookSection(playbook, 'todo')).toBeUndefined();
    expect(playbookSection(playbook, 'start')).toBeUndefined();
  });

  it('accepts a numbered heading and Windows line ends', () => {
    expect(playbookSection('## 3. todo\r\n\r\nPick it up.\r\n', 'todo')).toBe('Pick it up.');
  });
});
