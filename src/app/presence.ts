import type { DatabaseSync } from 'node:sqlite';
import type { AgentChannel } from '../core/authority.ts';
import { activeLease } from '../core/lease.ts';
import {
  findAgent,
  findProfile,
  saveProfile,
  selectAgents,
  selectLeases,
  unconfirmProfile,
  upsertAgent,
} from '../store/queries.ts';
import { type Clock, systemClock } from './items.ts';

// What an agent came through: an MCP client's clientInfo, or `cli` for the command line.
export type Harness = { name: string; version?: string | undefined };

export const CLI_HARNESS: Harness = { name: 'cli' };

// An agent seen acting, through a channel and maybe a known harness. `newSession`: the first time
// it is seen in a session (an MCP client initialized the server, or its first call there).
export type Sighting = {
  agent: string;
  channel: AgentChannel;
  harness?: Harness | undefined;
  newSession?: boolean;
};

// An agent counts as live while it was seen this recently, or while it holds a lease.
export const LIVE_WINDOW_MS = 5 * 60_000;

// Seen again within this, an agent's last-seen time is left as it is: an agent reading item after
// item writes once, not on every call (each write wakes the live UI).
export const SEEN_PRECISION_MS = 30_000;

// A command-line agent has no session Otea can see: back after this long away, it counts as a new
// one, and its profile stands unconfirmed until it declares it again.
export const CLI_SESSION_GAP_MS = 60 * 60_000;

export type AgentPresence = {
  name: string;
  harness: string | null;
  holding: string[];
  lastSeen: string;
  live: boolean;
};

// The harness an agent is known by after a sighting: an MCP client names itself and replaces what
// was known; the command line only fills a harness nobody named, so an MCP agent that also runs
// `otea` keeps its client's name.
function harnessAfter(
  known: { harness: string | null; harnessVersion: string | null } | undefined,
  { channel, harness }: Sighting,
): { harness: string | null; harnessVersion: string | null } {
  const given = harness ? { harness: harness.name, harnessVersion: harness.version ?? null } : null;
  if (channel === 'mcp' && given) return given;
  if (known?.harness) return { harness: known.harness, harnessVersion: known.harnessVersion };
  return given ?? { harness: null, harnessVersion: null };
}

// Records that an agent was seen now. Reading first keeps the many calls of a busy agent from
// taking the write lock: it writes only when the harness changed or the last sighting is older
// than SEEN_PRECISION_MS. Returns whether it wrote.
export function seeAgent(db: DatabaseSync, sighting: Sighting, now: Clock = systemClock): boolean {
  const at = now();
  const known = findAgent(db, sighting.agent);
  const away = known && Date.parse(at) - Date.parse(known.lastSeen) > CLI_SESSION_GAP_MS;
  if (sighting.newSession || (sighting.channel === 'cli' && away)) {
    unconfirmProfile(db, sighting.agent);
  }
  followClient(db, sighting, at);
  const next = harnessAfter(known, sighting);
  const fresh = known && Date.parse(at) - Date.parse(known.lastSeen) < SEEN_PRECISION_MS;
  const same =
    known && known.harness === next.harness && known.harnessVersion === next.harnessVersion;
  if (fresh && same) return false;
  upsertAgent(db, { name: sighting.agent, ...next, lastSeen: at });
  return true;
}

// A profile's harness is the MCP client's: when the client names another one, the profile follows.
function followClient(db: DatabaseSync, { agent, channel, harness }: Sighting, at: string): void {
  if (channel !== 'mcp' || !harness) return;
  const declared = findProfile(db, agent);
  if (!declared || declared.profile.harness === harness.name) return;
  const profile = { ...declared.profile, harness: harness.name };
  saveProfile(db, agent, profile, { at, channel, confirmed: declared.confirmed });
}

// The agents seen in the project, never the human: live ones first, then the most recently seen.
export function listAgents(db: DatabaseSync, now: Clock = systemClock): AgentPresence[] {
  const at = now();
  const holding = new Map<string, string[]>();
  for (const { id, lease } of selectLeases(db)) {
    const live = activeLease(lease, at);
    if (live) holding.set(live.holder, [...(holding.get(live.holder) ?? []), id]);
  }
  const agents = selectAgents(db).map(({ name, harness, lastSeen }) => {
    const held = holding.get(name) ?? [];
    const recent = Date.parse(at) - Date.parse(lastSeen) <= LIVE_WINDOW_MS;
    return { name, harness, holding: held, lastSeen, live: recent || held.length > 0 };
  });
  return agents.sort(
    (a, b) =>
      Number(b.live) - Number(a.live) ||
      Date.parse(b.lastSeen) - Date.parse(a.lastSeen) ||
      a.name.localeCompare(b.name),
  );
}

// What changes when an agent's presence does, leaving out `live`, which only time changes: the
// stream tells the UI to read the agents again when it differs.
export function presenceSignature(db: DatabaseSync, now: Clock = systemClock): string {
  const agents = listAgents(db, now).sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify(
    agents.map(({ name, harness, holding, lastSeen }) => [name, harness, holding, lastSeen]),
  );
}
