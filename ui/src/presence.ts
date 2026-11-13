import type { Connection } from './hooks.ts';
import type { ItemEvent } from './types.ts';

// An agent the server has seen in this project: its name (the actor of its claims, leases and
// writes), the harness its MCP client named (none when it only used the CLI), the items it holds a
// lease on, when it last gave a sign, and whether it still counts as connected.
export type Agent = {
  name: string;
  harness: string | null;
  holding: string[];
  lastSeen: string;
  live: boolean;
  // What an older server leaves out: the harness's version, when the agent connected, and the
  // profile it declares (null before it declares one), whether it declared it in this session and
  // when its model or effort last changed.
  harnessVersion?: string | null;
  connectedAt?: string | null;
  profile?: AgentProfile | null;
  profileConfirmed?: boolean;
  profileChangedAt?: string | null;
};

// What an agent declares it runs as, as declared, with the family its model groups under.
export type AgentProfile = { harness: string; model: string; effort: string; family: string };

// A profile as the server gives it, or null when it is not one.
export function parseProfile(raw: unknown): AgentProfile | null {
  const p = raw as Partial<AgentProfile> | null;
  if (typeof p?.model !== 'string' || typeof p.effort !== 'string') return null;
  return {
    harness: typeof p.harness === 'string' ? p.harness : '',
    model: p.model,
    effort: p.effort,
    family: typeof p.family === 'string' ? p.family : p.model,
  };
}

const textOr = (value: unknown): string | null => (typeof value === 'string' ? value : null);

// The profile an agent acted with: the one its last own event among these kept (each event keeps
// the profile of that moment), else the one it declares now; null when neither says.
export function actedWith(
  agent: string,
  events: readonly Pick<ItemEvent, 'actor' | 'data' | 'profile'>[],
  agents?: readonly Agent[] | null,
): AgentProfile | null {
  const own = events.findLast(
    (e) =>
      e.actor.kind === 'agent' &&
      e.actor.name === agent &&
      typeof e.data.via !== 'string' &&
      e.profile !== undefined,
  );
  return own?.profile ?? agents?.find((a) => a.name === agent)?.profile ?? null;
}

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
        ...('harnessVersion' in each ? { harnessVersion: textOr(each.harnessVersion) } : {}),
        ...('connectedAt' in each ? { connectedAt: textOr(each.connectedAt) } : {}),
        ...('profile' in each ? { profile: parseProfile(each.profile) } : {}),
        ...('profileConfirmed' in each ? { profileConfirmed: each.profileConfirmed === true } : {}),
        ...('profileChangedAt' in each ? { profileChangedAt: textOr(each.profileChangedAt) } : {}),
      },
    ];
  });
}

// How often the pill asks again between changes: a connection or a lease can lapse without a write.
export const PRESENCE_POLL_MS = 10_000;
