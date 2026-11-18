import type { DatabaseSync } from 'node:sqlite';
import type { AgentChannel } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import { activeLease, DEFAULT_LEASE_TTL_MS, leaseExpiry } from '../core/lease.ts';
import { pathKey } from '../core/path-key.ts';
import {
  clearListening,
  clearWaiting,
  findAgent,
  findProfile,
  markListening,
  markWaiting,
  type ProfileView,
  profileView,
  saveProfile,
  selectAgents,
  selectLeases,
  selectListener,
  selectListening,
  selectProfileChanges,
  selectWaiting,
  takeLease,
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
  // The MCP server it is heard through (its process id), which keeps its name to itself.
  session?: number;
  // The harness process that started that server (the server's parent process id).
  launcher?: number;
  // The folder it works from: the command's working directory, or the one its MCP server runs in.
  folder?: string | undefined;
};

// Seen again after this long away, an agent connects anew (its connectedAt starts over).
export const LIVE_WINDOW_MS = 5 * 60_000;

// An agent counts as connected while it listens, holds a lease, or acted within LISTEN_WINDOW_MS: a
// listener (an open MCP server, a running otea wait) is heard every LISTEN_BEAT_MS, and counts as
// listening for LISTEN_WINDOW_MS after the last beat, so a closed session drops out within it. An
// agent working through the command line, between its commands, counts as connected too, never as
// listening: having run a command lately is no listening.
export const LISTEN_BEAT_MS = 60_000;
export const LISTEN_WINDOW_MS = 150_000;

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
  // Connected: it listens, holds a lease, or acted within LISTEN_WINDOW_MS.
  live: boolean;
  // Heard listening within LISTEN_WINDOW_MS.
  listening: boolean;
  // Heard waiting in otea wait within LISTEN_WINDOW_MS: what the person does on the desk reaches
  // it. An agent idle in its chat with its MCP server open listens, but hears nothing.
  waiting: boolean;
  profile: ProfileView | null;
  profileConfirmed: boolean;
  profileChangedAt: string | null;
  // When it was last heard through Otea's MCP server (null if never), and whether it asked for that
  // connection (otea connect) and was never heard through it: its harness declined the server, or
  // it was never added.
  mcpAt: string | null;
  mcpMissing: boolean;
  // The folder it was last seen working from (null before any).
  folder: string | null;
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
  // Heard through the MCP server: its harness loaded Otea's server.
  const mcp = sighting.channel === 'mcp';
  const moved = sighting.folder !== undefined && sighting.folder !== known?.folder;
  const unchanged = fresh && same && connectedAt === known?.connectedAt && !moved;
  if (unchanged && (!mcp || known?.mcpAt)) return false;
  upsertAgent(db, {
    name: sighting.agent,
    ...next,
    lastSeen: at,
    connectedAt,
    ...(mcp ? { mcpAt: at } : {}),
    ...(sighting.folder === undefined ? {} : { folder: sighting.folder }),
  });
  return true;
}

// Hears an agent that listens now: sees it, and notes it listening. Returns when, for endListening.
export function hearAgent(db: DatabaseSync, sighting: Sighting, now: Clock = systemClock): string {
  const at = now();
  seeAgent(db, sighting, () => at);
  markListening(db, sighting.agent, at, sighting.session, sighting.launcher);
  return at;
}

// A listener that ends (an MCP server whose client closed it, a wait whose session ended) stops
// counting its agent as listening at once, not a listening window later: unless another one heard
// the agent after its last beat (`heardAt`, what hearAgent returned). An MCP server that ends
// gives its `session`: the calls it served heard the agent after its beat, through it.
export function endListening(
  db: DatabaseSync,
  agent: string,
  heardAt: string,
  session?: number,
): void {
  clearListening(db, agent, heardAt, session);
}

// Whether a process still runs on this computer, where every MCP server of the project runs.
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// An MCP session (`session`, its server's process id) takes an agent name only while no other open
// session works under it: two sessions under one name would take one item twice and hand off each
// other's work. A session that closed or went quiet leaves the name free; a command-line wait
// shares it with its own agent. A server the same harness process (`harness`, its parent's id) started
// anew (`fresh`: its first call under the name) takes the name from its sibling: the harness
// restarted it and no longer talks to the old one, which is refused from then on.
export function claimName(
  db: DatabaseSync,
  agent: string,
  session: number,
  alive: (pid: number) => boolean = processAlive,
  now: Clock = systemClock,
  harness?: number,
  fresh = false,
): void {
  const heard = selectListener(db, agent);
  if (!heard?.session || heard.session === session || !heard.at) return;
  if (Date.parse(now()) - Date.parse(heard.at) >= LISTEN_WINDOW_MS) return;
  if (!alive(heard.session)) return;
  if (fresh && harness !== undefined && heard.harness === harness) return;
  throw new OteaError(
    'name_in_use',
    `Another session works as ${agent} right now: give this one its own name, passing as "${agent}-2" (or another name) on every call`,
  );
}

// Whether the process that started a wait is gone (`start`, the parent it had then; `current`, the
// parent it has now; `chain`, the shells above it up to its harness): one of them ended, or the
// wait was handed to another parent. A wait left running after its agent's session ended would
// keep the agent shown as listening until it timed out.
export function ownerGone(
  start: number,
  current: number,
  alive: (pid: number) => boolean = processAlive,
  chain: readonly number[] = [start],
): boolean {
  if (start <= 1) return false;
  return current !== start || !chain.every(alive);
}

// The beat of a wait (watch's `beat`): hears the agent again, never as a new session, and notes it
// waiting. Far inside CLI_SESSION_GAP_MS, so a wait of hours is no time away and its profile stays
// confirmed.
export function waitBeat(
  db: DatabaseSync,
  { newSession: _, ...sighting }: Sighting,
  now: Clock = systemClock,
): { everyMs: number; run: () => string } {
  const run = () => {
    const at = hearAgent(db, sighting, now);
    markWaiting(db, sighting.agent, at);
    keepLeases(db, sighting.agent, at);
    return at;
  };
  return { everyMs: LISTEN_BEAT_MS, run };
}

// A waiting agent is alive: a parent waiting on its children, or on the person's answer, keeps
// what it holds, each live lease extended to a default lease from now, never shortened. A lease
// that already ran out stays as it is (Atasco): the agent claims it again.
function keepLeases(db: DatabaseSync, agent: string, at: string): void {
  const until = leaseExpiry(at, DEFAULT_LEASE_TTL_MS);
  for (const { id, lease } of selectLeases(db)) {
    const live = activeLease(lease, at);
    if (live?.holder !== agent || live.expiresAt >= until) continue;
    takeLease(db, id, { holder: agent, expiresAt: until }, at);
  }
}

// A wait that ends (it found what it waited for, or its session ended) stops its agent waiting at
// once, unless another wait heard it after `heardAt`, its last beat. A wait that timed out leaves
// it: the agent calls it again at once, and the desk would blink to nobody waiting between them.
export function endWaiting(db: DatabaseSync, agent: string, heardAt: string): void {
  clearWaiting(db, agent, heardAt);
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
  const heard = selectListening(db);
  const waits = selectWaiting(db);
  const within = (last: string | undefined) =>
    last !== undefined && Date.parse(at) - Date.parse(last) <= LISTEN_WINDOW_MS;
  const agents = selectAgents(db).map(
    ({ name, harness, harnessVersion, connectedAt, lastSeen, mcpAt, mcpAskedAt, folder }) => {
      const held = holding.get(name) ?? [];
      const listening = within(heard.get(name));
      // It acted lately (a command-line agent between its commands); a profile given for it by
      // the person, with no sighting of its own, is no act.
      const active = connectedAt !== null && within(lastSeen);
      const declared = findProfile(db, name);
      return {
        name,
        harness,
        harnessVersion,
        connectedAt,
        holding: held,
        lastSeen,
        live: listening || held.length > 0 || active,
        listening,
        waiting: within(waits.get(name)),
        profile: declared ? profileView(declared.profile) : null,
        profileConfirmed: declared?.confirmed ?? false,
        profileChangedAt: profileChangedAt(db, name),
        mcpAt: mcpAt ?? null,
        mcpMissing: Boolean(mcpAskedAt) && !mcpAt,
        folder: folder ?? null,
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
    agents.map(
      ({ name, harness, holding, lastSeen, profile, profileConfirmed, waiting, mcpMissing }) => [
        name,
        harness,
        holding,
        lastSeen,
        profile,
        profileConfirmed,
        waiting,
        mcpMissing,
      ],
    ),
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

// What a session should call itself (otea whoami): the name it worked under before, when an agent
// of the same harness worked from this folder (or one inside or around it) and no session listens
// or holds a lease under it now, so a returning session keeps one name, even right after its last
// one closed; never a name a session listens or works under, so a second terminal never takes
// another's. `name`: the one to reuse, the most recently seen; `lately`: it acted moments ago (a
// command-line agent between its commands may still be at work), which the session is told;
// `others`, the rest that fit; `working`, the names connected now.
export type NameAdvice = {
  name: string | null;
  lately: boolean;
  others: string[];
  working: string[];
};

const harnessKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

function sameFolder(a: string, b: string): boolean {
  const [x, y] = [pathKey(a, process.platform), pathKey(b, process.platform)];
  const inside = (outer: string, inner: string) =>
    inner === outer || inner.startsWith(outer.endsWith('/') ? outer : `${outer}/`);
  return inside(x, y) || inside(y, x);
}

export function nameFor(
  db: DatabaseSync,
  {
    folder,
    harness,
    session,
  }: { folder: string; harness?: string | undefined; session?: number | undefined },
  now: Clock = systemClock,
  alive: (pid: number) => boolean = processAlive,
): NameAdvice {
  const agents = listAgents(db, now);
  const working = agents.filter(({ live }) => live).map(({ name }) => name);
  const wanted = harness && harness.toLowerCase() !== 'cli' ? harnessKey(harness) : undefined;
  // The harnesses it is known by: its MCP client's, and the one its profile declares.
  const harnesses = (agent: AgentPresence) =>
    [agent.harness, agent.profile?.harness]
      .filter((each): each is string => Boolean(each) && each?.toLowerCase() !== 'cli')
      .map(harnessKey);
  // Busy: a lease, or another session listening under the name. The MCP server asking (`session`,
  // its process id) is no other session: a harness that keeps one server for its new sessions
  // (OpenCode does) asks through the server its agent was heard by. A server that is gone (its
  // harness was killed) is no session either.
  const listens = (agent: AgentPresence) => {
    if (!agent.listening) return false;
    const heard = selectListener(db, agent.name);
    if (!heard?.session) return true;
    return heard.session !== session && alive(heard.session);
  };
  const busy = (agent: AgentPresence) => listens(agent) || agent.holding.length > 0;
  const fits = agents
    .filter((agent) => !busy(agent) && agent.connectedAt !== null && agent.folder !== null)
    .filter((agent) => sameFolder(agent.folder ?? '', folder))
    .filter((agent) => {
      const known = harnesses(agent);
      return wanted === undefined || known.length === 0 || known.includes(wanted);
    })
    .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
  const [first] = fits;
  return {
    name: first?.name ?? null,
    lately: first?.live === true,
    others: fits.slice(1).map(({ name }) => name),
    working: working.filter((name) => name !== first?.name),
  };
}
