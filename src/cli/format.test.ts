import { describe, expect, it } from 'vitest';
import { formatEvent, formatItems } from './format.ts';

// What `otea show` and `otea events` say of a stuck item the person restarted or reassigned in the
// UI, so an agent reading the timeline knows the item is free again and whom it is left for.

const human = { kind: 'human', name: 'human' } as const;
const released = (data: Record<string, unknown>) =>
  formatEvent({ id: 9, itemId: 'TASKS-1', type: 'released', actor: human, at: 'T', data });

describe('a release the person made from Atasco', () => {
  it('says the item went back to the queue of its step', () => {
    expect(released({ holder: 'kiln', cause: 'restart' })).toMatch(
      /released {2}kiln \(back in the queue\)$/,
    );
  });

  it('says whom it is left for', () => {
    expect(released({ holder: 'kiln', cause: 'reassign', next: 'quill' })).toMatch(
      /released {2}kiln \(left for quill\)$/,
    );
  });

  it('keeps the agent and handoff releases as they were', () => {
    expect(released({ holder: 'kiln', cause: 'release' })).toMatch(/kiln \(released\)$/);
    expect(released({ holder: 'kiln', cause: 'handoff' })).toMatch(/kiln \(handed off\)$/);
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

  it('names the moment the person was at in it', () => {
    expect(note({ evidence: 4, filename: 'run.webm', seconds: 62.4 })).toMatch(
      /note 1: "It stutters here" \(on run\.webm at 1:02\.4\)$/,
    );
  });

  it('names the line it quotes, or the diagram node', () => {
    expect(note({ evidence: 4, filename: 'a.diff', line: 12, quote: 'x = 1' })).toMatch(
      /\(on a\.diff at line 12: "x = 1"\)$/,
    );
    expect(note({ evidence: 5, filename: 'f.mmd', node: 'Scan QR' })).toMatch(
      /\(on f\.mmd at node "Scan QR"\)$/,
    );
  });

  it('names only the file when the note has no moment', () => {
    expect(note({ evidence: 4, filename: 'shot.png' })).toMatch(/\(on shot\.png\)$/);
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

  it('adds no column while the person set no order', () => {
    expect(formatItems([item('IDE-1')], () => false, new Map())).toBe(
      'IDE-1  Refinar  agent  Idea IDE-1',
    );
  });
});
