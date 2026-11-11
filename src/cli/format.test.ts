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
