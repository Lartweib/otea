import { describe, expect, it } from 'vitest';
import { formatEvent } from './format.ts';

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

  it('names only the file when the note has no moment', () => {
    expect(note({ evidence: 4, filename: 'shot.png' })).toMatch(/\(on shot\.png\)$/);
  });
});
