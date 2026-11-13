import { afterEach, describe, expect, it } from 'vitest';
import { ago, inMinutes, item, NOW } from '../derive/fixtures.ts';
import { setLanguage } from '../i18n/i18n.ts';
import type { Agent } from '../presence.ts';
import type { ProjectOverview } from '../types.ts';
import { agentCounts, agentRows, elsewhereLine, pillMark, projectRows } from './topbar-model.ts';

afterEach(() => setLanguage('en'));

const overview = (o: Partial<ProjectOverview> & { id: string }): ProjectOverview => ({
  name: o.id,
  storage: 'common',
  current: false,
  paths: [{ path: `/repos/${o.id}`, missing: false }] as ProjectOverview['paths'],
  waiting: [],
  withAgents: 0,
  open: 0,
  ...o,
});
const waiting = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `W-${i}` })) as unknown as ProjectOverview['waiting'];

const agent = (name: string, o: Partial<Agent> = {}): Agent => ({
  name,
  harness: null,
  holding: [],
  lastSeen: ago(1),
  live: true,
  ...o,
});

describe('the project menu’s rows', () => {
  const here = { id: 'hm', name: 'Hollowmere', icon: null };

  it('puts the project open now first, with your count, a tick and no address', () => {
    setLanguage('es');
    const { rows } = projectRows(
      here,
      [
        overview({ id: 'mirefall', served: 'http://127.0.0.1:4700', waiting: waiting(2) }),
        overview({ id: 'hm', name: 'Hollowmere', current: true, waiting: waiting(9) }),
      ],
      3,
    );
    expect(rows[0]).toMatchObject({
      id: 'hm',
      current: true,
      line: 'abierto ahora',
      waiting: 3,
      inert: false,
    });
    expect(rows[0]?.href).toBeUndefined();
  });

  it('opens a served project at its own address, names where it lives', () => {
    const { rows } = projectRows(
      here,
      [overview({ id: 'mirefall', served: 'http://127.0.0.1:4700', waiting: waiting(2) })],
      0,
    );
    expect(rows.find((r) => r.id === 'mirefall')).toMatchObject({
      href: 'http://127.0.0.1:4700/',
      line: '/repos/mirefall',
      waiting: 2,
      inert: false,
    });
  });

  it('keeps an unserved project inert, saying how to open it', () => {
    setLanguage('es');
    const { rows } = projectRows(here, [overview({ id: 'quiet' })], 0);
    expect(rows.find((r) => r.id === 'quiet')).toMatchObject({
      inert: true,
      line: 'sin servidor · otea serve allí lo abre',
    });
  });

  it('says when a path is missing', () => {
    const { rows } = projectRows(
      here,
      [
        overview({
          id: 'gone',
          served: 'http://x',
          paths: [{ path: '/old', missing: true }] as ProjectOverview['paths'],
        }),
      ],
      0,
    );
    expect(rows.find((r) => r.id === 'gone')?.line).toBe('a path is missing · /old');
  });

  it('adds every waiting count for Todos los proyectos', () => {
    const { total } = projectRows(
      here,
      [
        overview({ id: 'hm', current: true, waiting: waiting(9) }),
        overview({ id: 'a', waiting: waiting(2) }),
        overview({ id: 'b', waiting: waiting(1) }),
      ],
      7,
    );
    expect(total).toBe(10);
  });

  it('lists the project alone before the server answers', () => {
    const { rows, total } = projectRows(here, undefined, 4);
    expect(rows.map((r) => [r.id, r.current, r.waiting])).toEqual([['hm', true, 4]]);
    expect(total).toBe(4);
  });
});

describe('the Elsewhere line', () => {
  it('counts what waits in other projects, in the mock’s words', () => {
    setLanguage('es');
    const line = elsewhereLine([
      overview({ id: 'hm', current: true, waiting: waiting(5) }),
      overview({ id: 'a', waiting: waiting(2) }),
      overview({ id: 'b', waiting: waiting(1) }),
      overview({ id: 'c' }),
    ]);
    expect(line).toBe('3 más te esperan en 2 proyectos');
  });

  it('says nothing while nothing waits elsewhere', () => {
    expect(elsewhereLine([overview({ id: 'hm', current: true, waiting: waiting(5) })])).toBe(null);
    expect(elsewhereLine(undefined)).toBe(null);
  });
});

describe('the agents menu’s rows', () => {
  const items = [
    item({
      id: 'ERR-231',
      title: 'Huecos en la colisión',
      turn: 'agent',
      lease: { holder: 'Scout', expiresAt: inMinutes(30) },
    }),
    item({
      id: 'CRE-44',
      title: 'Tortuga musgosa',
      turn: 'agent',
      lease: null,
      expiredLease: { holder: 'Kiln', expiresAt: ago(12) },
    }),
  ];

  it('lists each connected agent with its harness and what it holds, as a mini node', () => {
    const rows = agentRows(
      [agent('Scout', { harness: 'Claude Code', holding: ['ERR-231'] }), agent('Quill')],
      items,
      NOW,
    );
    expect(rows[0]).toMatchObject({
      name: 'Scout',
      harness: 'Claude Code',
      held: [{ id: 'ERR-231', title: 'Huecos en la colisión', look: 'working' }],
      quiet: false,
    });
    expect(rows[1]).toMatchObject({ name: 'Quill', held: [], quiet: false });
  });

  it('keeps an agent gone quiet on its expired lease, its item stuck', () => {
    const rows = agentRows([agent('Kiln', { live: false, lastSeen: ago(12) })], items, NOW);
    expect(rows).toEqual([
      expect.objectContaining({
        name: 'Kiln',
        quiet: true,
        held: [{ id: 'CRE-44', title: 'Tortuga musgosa', look: 'stuck' }],
      }),
    ]);
  });

  it('leaves out an agent that is gone with nothing stuck', () => {
    expect(agentRows([agent('Old', { live: false })], items, NOW)).toEqual([]);
  });

  it('counts the agents the menu lists, those holding a lease and the idle', () => {
    const rows = agentRows(
      [
        agent('Scout', { holding: ['ERR-231'] }),
        agent('Quill'),
        agent('Old', { live: false }),
        agent('Kiln', { live: false, lastSeen: ago(12) }),
      ],
      items,
      NOW,
    );
    // Kiln went quiet on its stuck item: the menu lists it, so the pill counts it too.
    expect(rows.map((r) => r.name)).toEqual(['Scout', 'Quill', 'Kiln']);
    expect(agentCounts(rows)).toEqual({ live: 3, holding: 1, idle: 2 });
  });
});

describe('the agents pill’s mark', () => {
  const rows = (agents: Agent[]) => agentRows(agents, [], NOW);

  it('turns while an agent holds a lease, rests as a ring with agents, dashes with none', () => {
    expect(pillMark('live', rows([agent('a', { holding: ['X'] })]))).toBe('working');
    expect(pillMark('live', rows([agent('a')]))).toBe('idle');
    expect(pillMark('live', [])).toBe('none');
    expect(pillMark('reconnecting', rows([agent('a')]))).toBe('offline');
  });
});
