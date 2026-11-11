import { describe, expect, it } from 'vitest';
import { stateLook } from './looks.ts';

// Studio draws a state (or a sample in it) with the node the list would give an item there.
describe('the look of a state', () => {
  it('is yours on your turn', () => {
    expect(stateLook({ turn: 'human' })).toBe('yours');
  });

  it('is an open ring on the agents, dashed where the type keeps what is incomplete', () => {
    expect(stateLook({ turn: 'agent' })).toBe('queued');
    expect(stateLook({ turn: 'agent' }, true)).toBe('waiting');
  });

  it('is done or dropped once closed, by how it closes', () => {
    expect(stateLook({ turn: 'none', closes: 'done' })).toBe('done');
    expect(stateLook({ turn: 'none' })).toBe('done');
    expect(stateLook({ turn: 'none', closes: 'discarded' })).toBe('dropped');
  });

  it('takes an unknown turn as the agents', () => {
    expect(stateLook({ turn: 'robot' })).toBe('queued');
  });
});
