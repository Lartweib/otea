import { describe, expect, it } from 'vitest';
import {
  authorizeMove,
  authorizeRelay,
  availableMoves,
  mayPerform,
  type Performer,
  relayableMoves,
} from './authority.ts';
import { tasks } from './testing.ts';

const agentCli: Performer = { actor: { kind: 'agent', name: 'claude' }, channel: 'cli' };
const humanCli: Performer = { actor: { kind: 'human', name: 'ana' }, channel: 'cli' };
const humanUi: Performer = { actor: { kind: 'human', name: 'ana' }, channel: 'ui' };
const agentUi: Performer = { actor: { kind: 'agent', name: 'claude' }, channel: 'ui' };
const agentMcp: Performer = { actor: { kind: 'agent', name: 'claude' }, channel: 'mcp' };
const humanMcp: Performer = { actor: { kind: 'human', name: 'ana' }, channel: 'mcp' };

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
    ['agent', agentMcp, true],
    ['human', agentMcp, false],
    ['human', humanMcp, false],
    ['human-ui', agentMcp, false],
    ['human-ui', humanMcp, false],
  ] as const)('%s authority for %j is %s', (by, performer, expected) => {
    expect(mayPerform(by, performer)).toBe(expected);
  });
});

describe('availableMoves', () => {
  it('lists the moves the performer may make from a state, once per target', () => {
    expect(availableMoves(tasks, 'incomplete', agentCli)).toEqual([
      { to: 'todo', by: 'agent', reasonRequired: false, turn: 'agent' },
      { to: 'discarded', by: 'agent', reasonRequired: true, turn: 'none', closes: 'discarded' },
    ]);
    expect(availableMoves(tasks, 'incomplete', humanUi).map(({ to, by }) => [to, by])).toEqual([
      ['todo', 'agent'],
      ['discarded', 'human'],
    ]);
  });

  it('says whose turn each move hands the item to', () => {
    expect(availableMoves(tasks, 'review', humanUi).map(({ to, turn }) => [to, turn])).toEqual([
      ['done', 'none'],
      ['todo', 'agent'],
      ['discarded', 'none'],
    ]);
  });

  it('says how each move into a closed state closes the item', () => {
    expect(availableMoves(tasks, 'review', humanUi).map(({ to, closes }) => [to, closes])).toEqual([
      ['done', 'done'],
      ['todo', undefined],
      ['discarded', 'discarded'],
    ]);
  });

  it('offers an agent nothing while the item waits for a human', () => {
    expect(availableMoves(tasks, 'review', agentCli)).toEqual([]);
  });
});

describe('relayableMoves', () => {
  it('lists the human moves a relayed decision may take from a state, once per target', () => {
    expect(relayableMoves(tasks, 'review')).toEqual([
      { to: 'discarded', by: 'human', reasonRequired: true, turn: 'none', closes: 'discarded' },
    ]);
    expect(relayableMoves(tasks, 'incomplete').map(({ to }) => to)).toEqual(['discarded']);
  });

  it('offers nothing where every move belongs to the agent or the web UI', () => {
    expect(relayableMoves(tasks, 'done')).toEqual([]);
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

describe('authorizeRelay', () => {
  it('returns the human transition a relayed decision takes', () => {
    expect(authorizeRelay(tasks, 'review', 'discarded', 'duplicate')).toMatchObject({
      by: 'human',
    });
  });

  it('picks the human transition when an agent one connects the same states', () => {
    expect(authorizeRelay(tasks, 'incomplete', 'discarded', 'duplicate')).toMatchObject({
      by: 'human',
    });
  });

  it('refuses a human-ui move with forbidden, pointing to the web UI', () => {
    const approve = () => authorizeRelay(tasks, 'review', 'done');

    expect(approve).toThrow(expect.objectContaining({ code: 'forbidden' }));
    expect(approve).toThrow(
      'Moving from "review" to "done" requires human-ui authority (a human in the web UI) and cannot be relayed; the human must make it in the web UI',
    );
  });

  it('refuses an agent move with not_relayable, pointing to otea move', () => {
    const start = () => authorizeRelay(tasks, 'todo', 'in_progress');

    expect(start).toThrow(expect.objectContaining({ code: 'not_relayable' }));
    expect(start).toThrow(
      'Moving from "todo" to "in_progress" needs no human decision; make it with "otea move"',
    );
  });

  it('rejects an undeclared move with invalid_transition', () => {
    expect(() => authorizeRelay(tasks, 'todo', 'done')).toThrow(
      expect.objectContaining({ code: 'invalid_transition' }),
    );
  });

  it('requires a reason when the human transition does', () => {
    expect(() => authorizeRelay(tasks, 'review', 'discarded')).toThrow(
      expect.objectContaining({ code: 'reason_required' }),
    );
    expect(() => authorizeRelay(tasks, 'review', 'discarded', ' ')).toThrow(
      'Moving from "review" to "discarded" requires a reason',
    );
  });
});
