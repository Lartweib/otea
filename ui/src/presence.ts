import type { Connection } from './hooks.ts';

// An agent the server has seen in this project: its name (the actor of its claims, leases and
// writes), the harness its MCP client named (none when it only used the CLI), the items it holds a
// lease on, when it last gave a sign, and whether it still counts as connected.
export type Agent = {
  name: string;
  harness: string | null;
  holding: string[];
  lastSeen: string;
  live: boolean;
};

// What the agents pill can say: nothing at all while the server has no presence to tell (an older
// server), offline while the live stream is down (it cannot count), or how many are connected.
export type PillState =
  | { kind: 'absent' }
  | { kind: 'offline' }
  | { kind: 'agents'; count: number; holding: number };

// agents: undefined while the server has not answered yet, null when it has no presence endpoint.
export function pillState(connection: Connection, agents: Agent[] | null | undefined): PillState {
  if (connection !== 'live') return { kind: 'offline' };
  if (!agents) return { kind: 'absent' };
  const live = liveAgents(agents);
  return {
    kind: 'agents',
    count: live.length,
    holding: live.filter((agent) => agent.holding.length > 0).length,
  };
}

// The connected agents, the most recently seen first; a name keeps its place on a tie.
export function liveAgents(agents: readonly Agent[]): Agent[] {
  return agents
    .filter((agent) => agent.live)
    .map((agent, index) => ({ agent, index, seen: Date.parse(agent.lastSeen) || 0 }))
    .sort((a, b) => b.seen - a.seen || a.index - b.index)
    .map(({ agent }) => agent);
}

// The server's answer, read defensively: a malformed agent is left out rather than breaking the bar.
export function parseAgents(body: unknown): Agent[] {
  const list = (body as { agents?: unknown } | null)?.agents;
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw): Agent[] => {
    const each = raw as Partial<Agent> | null;
    if (typeof each?.name !== 'string' || typeof each.lastSeen !== 'string') return [];
    return [
      {
        name: each.name,
        harness: typeof each.harness === 'string' ? each.harness : null,
        holding: Array.isArray(each.holding)
          ? each.holding.filter((id): id is string => typeof id === 'string')
          : [],
        lastSeen: each.lastSeen,
        live: each.live !== false,
      },
    ];
  });
}

// How often the pill asks again between changes: a connection or a lease can lapse without a write.
export const PRESENCE_POLL_MS = 10_000;
