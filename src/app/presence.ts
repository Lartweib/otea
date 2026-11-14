import type { DatabaseSync } from 'node:sqlite';
import type { AgentChannel } from '../core/authority.ts';
import { activeLease } from '../core/lease.ts';
import {
  findAgent,
  findProfile,
  type ProfileView,
  profileView,
  saveProfile,
  selectAgents,
  selectLeases,
  selectProfileChanges,
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

// `profile`: what the agent declares it runs as (null before it declares one), `profileConfirmed`
// whether it declared it in its current session, `profileChangedAt` when its model or effort last
// changed (null while it never did).
export type AgentPresence = {
  name: string;
  harness: string | null;
  harnessVersion: string | null;
  connectedAt: string | null;
  holding: string[];
  lastSeen: string;
  live: boolean;
  profile: ProfileView | null;
  profileConfirmed: boolean;
  profileChangedAt: string | null;
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
  // It connects anew on its first sighting, in a new session, or back after it was away.
  const back = !known?.connectedAt || Date.parse(at) - Date.parse(known.lastSeen) > LIVE_WINDOW_MS;
  const connectedAt = sighting.newSession || back ? at : (known?.connectedAt ?? at);
  if (fresh && same && connectedAt === known?.connectedAt) return false;
  upsertAgent(db, { name: sighting.agent, ...next, lastSeen: at, connectedAt });
  return true;
}

// A waiting agent is seen this often while `otea wait` blocks: inside LIVE_WINDOW_MS, so it stays
// live, and far inside CLI_SESSION_GAP_MS, so a wait of hours is no time away and its profile
// stays confirmed for what it does next.
export const WAIT_BEAT_MS = 4 * 60_000;

// The beat of a wait (watch's `beat`): sees the agent again, never as a new session.
export function waitBeat(
  db: DatabaseSync,
  { newSession: _, ...sighting }: Sighting,
  now: Clock = systemClock,
): { everyMs: number; run: () => void } {
  return { everyMs: WAIT_BEAT_MS, run: () => void seeAgent(db, sighting, now) };
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
  const agents = selectAgents(db).map(
    ({ name, harness, harnessVersion, connectedAt, lastSeen }) => {
      const held = holding.get(name) ?? [];
      const recent = Date.parse(at) - Date.parse(lastSeen) <= LIVE_WINDOW_MS;
      const declared = findProfile(db, name);
      return {
        name,
        harness,
        harnessVersion,
        connectedAt,
        holding: held,
        lastSeen,
        live: recent || held.length > 0,
        profile: declared ? profileView(declared.profile) : null,
        profileConfirmed: declared?.confirmed ?? false,
        profileChangedAt: profileChangedAt(db, name),
      };
    },
  );
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
    agents.map(({ name, harness, holding, lastSeen, profile, profileConfirmed }) => [
      name,
      harness,
      holding,
      lastSeen,
      profile,
      profileConfirmed,
    ]),
  );
}

// When the agent last changed model or effort: a harness the client renamed is no change of its.
export function profileChangedAt(db: DatabaseSync, agent: string): string | null {
  const changes = selectProfileChanges(db, agent);
  const key = ({ profile }: (typeof changes)[number]) => `${profile.model} ${profile.effort}`;
  const keys = changes.map(key);
  const at = keys.findLastIndex((each, i) => i > 0 && each !== keys[i - 1]);
  return at < 0 ? null : (changes[at]?.at ?? null);
}
