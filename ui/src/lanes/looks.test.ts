import { describe, expect, it } from 'vitest';
import { ago, inMinutes, item, NOW } from '../derive/fixtures.ts';
import { laneColor, lookColor, lookGlyph, lookOf } from './looks.ts';

describe('how a node looks', () => {
  it('reads the look from the turn, the lease and the children', () => {
    expect(lookOf(item({ id: 'A', turn: 'human' }), NOW)).toBe('yours');
    expect(lookOf(item({ id: 'A', turn: 'none', closes: 'done' }), NOW)).toBe('done');
    expect(lookOf(item({ id: 'A', turn: 'none', closes: 'discarded' }), NOW)).toBe('dropped');
    const held = { holder: 'mender', expiresAt: inMinutes(5) };
    const lapsed = { holder: 'kiln', expiresAt: ago(5) };
    expect(lookOf(item({ id: 'A', turn: 'agent', lease: held }), NOW)).toBe('working');
    expect(lookOf(item({ id: 'A', turn: 'agent', expiredLease: lapsed }), NOW)).toBe('stuck');
    expect(
      lookOf(item({ id: 'A', turn: 'agent', lease: { ...held, expiresAt: ago(1) } }), NOW),
    ).toBe('queued');
    const kids = { total: 2, open: 1, done: 1, discarded: 0 };
    expect(lookOf(item({ id: 'A', turn: 'agent', children: kids }), NOW)).toBe('waiting');
    expect(lookOf(item({ id: 'A', turn: 'agent' }), NOW)).toBe('queued');
  });

  it('knocks the node out of the sheet on a sheet', () => {
    expect(lookGlyph('working', 'sheet')).not.toContain('var(--ground)');
    expect(lookGlyph('working', 'sheet')).toContain('fill="var(--sheet)"');
  });

  it('colours a lane and a node by whose it is', () => {
    expect(laneColor('you')).toBe('var(--you)');
    expect(laneColor('ag')).toBe('var(--lane)');
    expect(laneColor('none')).toBe('var(--closed)');
    expect(lookColor('ag', 'stuck')).toBe('var(--warn)');
    expect(lookColor('you', 'yours')).toBe('var(--you)');
    expect(lookColor('none', 'done')).toBe('var(--closed)');
    expect(lookColor('ag', 'dropped')).toBe('var(--closed)');
    expect(lookColor('ag', 'working')).toBe('var(--pulse-ag)');
  });
});
