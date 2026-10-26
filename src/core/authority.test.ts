import { describe, expect, it } from 'vitest';
import { authorizeMove, mayPerform, type Performer } from './authority.ts';
import { tasks } from './testing.ts';

const agentCli: Performer = { actor: { kind: 'agent', name: 'claude' }, channel: 'cli' };
const humanCli: Performer = { actor: { kind: 'human', name: 'ana' }, channel: 'cli' };
const humanUi: Performer = { actor: { kind: 'human', name: 'ana' }, channel: 'ui' };
const agentUi: Performer = { actor: { kind: 'agent', name: 'claude' }, channel: 'ui' };

describe('mayPerform', () => {
  it.each([
    ['agent', agentCli, true],
    ['agent', humanUi, true],
    ['human', agentCli, false],
    ['human', agentUi, false],
    ['human', humanCli, false],
    ['human', humanUi, true],
    ['human-ui', agentCli, false],
    ['human-ui', agentUi, false],
    ['human-ui', humanCli, false],
    ['human-ui', humanUi, true],
  ] as const)('%s authority for %j is %s', (by, performer, expected) => {
    expect(mayPerform(by, performer)).toBe(expected);
  });
});

describe('authorizeMove', () => {
  it('returns the transition the performer may take', () => {
    expect(authorizeMove(tasks, 'todo', 'in_progress', agentCli)).toMatchObject({ by: 'agent' });
  });

  it('picks the transition matching the performer when several connect the states', () => {
    expect(authorizeMove(tasks, 'incomplete', 'discarded', agentCli, 'duplicate')).toMatchObject({
      by: 'agent',
    });
    expect(authorizeMove(tasks, 'incomplete', 'discarded', humanUi, 'duplicate')).toMatchObject({
      by: 'human',
    });
  });

  it('rejects an undeclared move with invalid_transition', () => {
    expect(() => authorizeMove(tasks, 'todo', 'done', humanUi)).toThrow(
      expect.objectContaining({ code: 'invalid_transition' }),
    );
  });

  it('rejects an agent approving work with forbidden, naming the authority', () => {
    const approve = () => authorizeMove(tasks, 'review', 'done', agentCli);

    expect(approve).toThrow(expect.objectContaining({ code: 'forbidden' }));
    expect(approve).toThrow(
      'Moving from "review" to "done" requires human-ui authority (a human in the web UI); agent "claude" via cli may not',
    );
  });

  it('rejects a human-ui move from the cli even for a human', () => {
    expect(() => authorizeMove(tasks, 'review', 'done', humanCli)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
  });

  it('requires a reason when the transition says so', () => {
    const discard = (reason?: string) =>
      authorizeMove(tasks, 'incomplete', 'discarded', agentCli, reason);

    expect(() => discard()).toThrow(expect.objectContaining({ code: 'reason_required' }));
    expect(() => discard('  ')).toThrow(
      'Moving from "incomplete" to "discarded" requires a reason',
    );
    expect(discard('duplicate')).toMatchObject({ to: 'discarded' });
  });

  it('checks authority before the reason', () => {
    expect(() => authorizeMove(tasks, 'review', 'todo', agentCli)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
  });
});
