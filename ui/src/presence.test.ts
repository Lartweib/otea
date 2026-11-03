import { describe, expect, it } from 'vitest';
import { type Agent, liveAgents, parseAgents, pillState } from './presence.ts';

const agent = (name: string, o: Partial<Agent> = {}): Agent => ({
  name,
  harness: 'Claude Code',
  holding: [],
  lastSeen: '2026-11-03T10:00:00Z',
  live: true,
  ...o,
});

describe('pillState', () => {
  it('shows no pill while the server has no presence to tell', () => {
    expect(pillState('live', null)).toEqual({ kind: 'absent' });
    expect(pillState('live', undefined)).toEqual({ kind: 'absent' });
  });

  it('says offline while the live stream is down, whatever it knew', () => {
    expect(pillState('reconnecting', [agent('a')])).toEqual({ kind: 'offline' });
    expect(pillState('connecting', null)).toEqual({ kind: 'offline' });
  });

  it('counts the connected agents and those holding a lease', () => {
    const agents = [
      agent('a', { holding: ['WORK-1'] }),
      agent('b'),
      agent('c', { live: false, holding: ['WORK-2'] }),
    ];
    expect(pillState('live', agents)).toEqual({ kind: 'agents', count: 2, holding: 1 });
    expect(pillState('live', [])).toEqual({ kind: 'agents', count: 0, holding: 0 });
  });
});

describe('liveAgents', () => {
  it('keeps the connected ones, the most recently seen first', () => {
    const agents = [
      agent('old', { lastSeen: '2026-11-03T09:00:00Z' }),
      agent('gone', { live: false, lastSeen: '2026-11-03T11:00:00Z' }),
      agent('new', { lastSeen: '2026-11-03T10:30:00Z' }),
    ];
    expect(liveAgents(agents).map((each) => each.name)).toEqual(['new', 'old']);
  });
});

describe('parseAgents', () => {
  it('reads the payload and leaves out what it cannot read', () => {
    const body = {
      agents: [
        {
          name: 'claude-a',
          harness: 'Claude Code',
          holding: ['WORK-1'],
          lastSeen: 'x',
          live: true,
        },
        { name: 'cli', harness: null, holding: [1, 'BUGS-2'], lastSeen: 'y', live: false },
        { harness: 'Codex', lastSeen: 'z' },
        null,
      ],
    };
    expect(parseAgents(body)).toEqual([
      { name: 'claude-a', harness: 'Claude Code', holding: ['WORK-1'], lastSeen: 'x', live: true },
      { name: 'cli', harness: null, holding: ['BUGS-2'], lastSeen: 'y', live: false },
    ]);
  });

  it('reads anything else as nobody', () => {
    expect(parseAgents(null)).toEqual([]);
    expect(parseAgents({ agents: 'no' })).toEqual([]);
  });
});
