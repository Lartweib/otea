import { describe, expect, it } from 'vitest';
import { formatEvent, formatItems } from './format.ts';

// What `otea show` and `otea events` say of a stuck item the person restarted or reassigned in the
// UI, so an agent reading the timeline knows the item is free again and whom it is left for.

const human = { kind: 'human', name: 'human' } as const;
const released = (data: Record<string, unknown>) =>
  formatEvent({ id: 9, itemId: 'TASKS-1', type: 'released', actor: human, at: 'T', data });

describe('a release the person made from Atasco', () => {
  // Back in the queue of its step, or left for someone; the agent and handoff releases stay as
  // they were.
  it.each<[Record<string, unknown>, RegExp]>([
    [{ cause: 'restart' }, /released {2}kiln \(back in the queue\)$/],
    [{ cause: 'reassign', next: 'quill' }, /released {2}kiln \(left for quill\)$/],
    [{ cause: 'release' }, /kiln \(released\)$/],
    [{ cause: 'handoff' }, /kiln \(handed off\)$/],
  ])('says the release %o as kiln %s', (data, line) => {
    expect(released({ holder: 'kiln', ...data })).toMatch(line);
  });
});

describe('a note on a recording in the timeline', () => {
  const note = (anchor: Record<string, unknown>) =>
    formatEvent({
      id: 10,
      itemId: 'TASKS-1',
      type: 'note_left',
      actor: human,
      at: 'T',
      data: { note: 1, text: 'It stutters here', anchor },
    });

  // The moment the person was at, the line it quotes or the diagram node; only the file when the
  // note has no moment.
  it.each<[Record<string, unknown>, RegExp]>([
    [
      { evidence: 4, filename: 'run.webm', seconds: 62.4 },
      /note 1: "It stutters here" \(on run\.webm at 1:02\.4\)$/,
    ],
    [
      { evidence: 4, filename: 'a.diff', line: 12, quote: 'x = 1' },
      /\(on a\.diff at line 12: "x = 1"\)$/,
    ],
    [{ evidence: 5, filename: 'f.mmd', node: 'Scan QR' }, /\(on f\.mmd at node "Scan QR"\)$/],
    [{ evidence: 4, filename: 'shot.png' }, /\(on shot\.png\)$/],
  ])('names where the note on %o is', (anchor, line) => {
    expect(note(anchor)).toMatch(line);
  });
});

describe('a checklist point proved in the timeline', () => {
  const proved = (data: Record<string, unknown>) =>
    formatEvent({
      id: 11,
      itemId: 'TASKS-1',
      type: 'point_proved',
      actor: { kind: 'agent', name: 'kiln' },
      at: 'T',
      data: { part: 'Checks', point: 'Saves', evidence: 3, ...data },
    });

  it('names the point and its proof: a log line, a passing test or a file', () => {
    expect(proved({ kind: 'log', file: 'test.log', line: 12 })).toMatch(
      /proved "Saves" in Checks with test\.log line 12$/,
    );
    expect(proved({ kind: 'test', file: 'junit.xml', test: 'saves a draft' })).toMatch(
      /proved "Saves" in Checks with the test "saves a draft" of junit\.xml \(passes\)$/,
    );
    expect(proved({ kind: 'file', file: 'after.png' })).toMatch(
      /proved "Saves" in Checks with after\.png \(#3\)$/,
    );
  });
});

describe('an option the person picked in the timeline', () => {
  it('names the option, and their comment when they left one', () => {
    const chose = (data: Record<string, unknown>) =>
      formatEvent({
        id: 12,
        itemId: 'IDE-2',
        type: 'option_chosen',
        actor: { kind: 'human', name: 'fede' },
        at: 'T',
        data: { option: 'B', name: 'A cloud backend', step: 'design', stepName: 'Design', ...data },
      });
    expect(chose({})).toMatch(/chose B · A cloud backend$/);
    expect(chose({ comment: 'we need sync' })).toMatch(
      /chose B · A cloud backend: "we need sync"$/,
    );
  });
});

describe('the person’s order in a list', () => {
  const item = (id: string) =>
    ({
      id,
      collection: 'Ideas',
      type: 'item',
      title: `Idea ${id}`,
      fields: {},
      state: 'Refinar',
      turn: 'agent',
      lease: null,
    }) as unknown as Parameters<typeof formatItems>[0][number];

  it('marks what the person put on top and the order they fixed, as next takes them', () => {
    const order = new Map([
      ['IDE-2', { pin: 1 }],
      ['IDE-3', { rank: 1 }],
    ]);
    expect(formatItems([item('IDE-1'), item('IDE-2'), item('IDE-3')], () => false, order)).toBe(
      [
        'IDE-1  Refinar  agent            Idea IDE-1',
        'IDE-2  Refinar  agent  on top 1  Idea IDE-2',
        'IDE-3  Refinar  agent  order 1   Idea IDE-3',
      ].join('\n'),
    );
  });
});
