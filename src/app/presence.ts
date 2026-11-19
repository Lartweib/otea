import type { DatabaseSync } from 'node:sqlite';
import type { AgentChannel } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import { isAgentName } from '../core/item.ts';
import { activeLease, DEFAULT_LEASE_TTL_MS, leaseExpiry } from '../core/lease.ts';
import { pathKey } from '../core/path-key.ts';
import {
  clearListening,
  clearWaiter,
  clearWaiting,
  deleteProcessBeat,
  findAgent,
  findProfile,
  markListening,
  markWaiting,
  type NameOffer,
  type ProfileView,
  profileView,
  saveMcpLoad,
  saveNameOffer,
  saveProcessBeat,
  saveProfile,
  selectAgents,
  selectLeases,
  selectListener,
  selectListenerProcesses,
  selectListening,
  selectMcpLoads,
  selectNameOffers,
  selectProcessBeats,
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
  // The command-line wait it is heard through (its process id), while that wait runs.
  waiter?: number;
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

// A call counts for this long: an agent seen acting, between its commands, counts as connected,
// and an ended subagent drops out soon after its last call (P1-11).
export const ACTIVE_WINDOW_MS = 90_000;

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
  // MCP as the desk tells it (P2S-R2-6, P6-R2-10): `missing` while it, or another agent of its
  // harness, asked for the server (otea connect) and that harness never loaded it since; `unused`
  // once the harness loaded it (or another agent of it was heard through it) while this agent
  // still works through the command line; null when nobody asked, or it was heard through it.
  mcp: 'missing' | 'unused' | null;
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
// The listener it is heard through (its MCP server, its wait) is the process calling: it runs.
export function hearAgent(db: DatabaseSync, sighting: Sighting, now: Clock = systemClock): string {
  const at = now();
  seeAgent(db, sighting, () => at);
  markListening(db, sighting.agent, at, sighting.session, sighting.launcher, sighting.waiter);
  for (const pid of [sighting.session, sighting.waiter])
    if (pid !== undefined) beatProcess(db, pid, () => at);
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

// Whether a process still runs on this computer, where every MCP server of the project runs, as
// the system tells it by its id alone.
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// Long past any listening window: the rows of processes killed before they could say they ended.
const BEATS_KEPT_MS = 24 * 60 * 60_000;

// A process id alone is no proof an Otea process (an MCP server, a command-line wait) still runs:
// once it ends, the system may give its id to another process, as Windows does within seconds, and
// its session would stay open on the desk (P3C-R3-12). So each one says it still runs (beatProcess)
// as it starts and on every LISTEN_BEAT_MS, and one that ends on its own says so (endProcess).
export function beatProcess(db: DatabaseSync, pid: number, now: Clock = systemClock): void {
  const at = now();
  saveProcessBeat(db, pid, at, new Date(Date.parse(at) - BEATS_KEPT_MS).toISOString());
}

export function endProcess(db: DatabaseSync, pid: number): void {
  deleteProcessBeat(db, pid);
}

// Which process ids name an Otea process that runs now: one the system says runs (`alive`) that
// beat within LISTEN_WINDOW_MS. One killed with its session counts as running until then, even
// once its id is another process's; one that ended on its own, no longer. Read once per look.
export function runningProcesses(
  db: DatabaseSync,
  now: Clock = systemClock,
  alive: (pid: number) => boolean = processAlive,
): (pid: number) => boolean {
  const at = Date.parse(now());
  const beats = selectProcessBeats(db);
  return (pid) => {
    const beat = beats.get(pid);
    return beat !== undefined && at - Date.parse(beat) <= LISTEN_WINDOW_MS && alive(pid);
  };
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
  const running = runningProcesses(db, now, alive);
  if (!running(heard.session)) return;
  if (fresh && harness !== undefined && heard.harness === harness) return;
  // The name it is told is handed to it, so a third session refused the same name is told another:
  // the refused session is the process calling, which runs.
  const at = now();
  beatProcess(db, session, () => at);
  const offers = handedOut(db, session, at, running);
  const free = freeName(db, agent, offers);
  if (free !== null) saveNameOffer(db, { name: free, at, session });
  const take =
    free === null
      ? 'passing as another name of your own on every call'
      : `passing as "${free}" on every call (no other agent or session has that name)`;
  throw new OteaError(
    'name_in_use',
    `Another session works as ${agent} right now: give this one its own name, ${take}, and declare its profile under it`,
  );
}

// A name handed out (otea whoami, a refused session) stays that session's for this long: another
// session asking meanwhile is handed another one, so two sessions started together never share one.
export const OFFER_WINDOW_MS = LIVE_WINDOW_MS;

// The names handed lately to a session other than `session` (an MCP server's process id; a
// command-line session has none Otea can tell apart, so every earlier one is another). A name
// handed to a session that ended is free again (P4-R3-2): the MCP server it was handed to is gone,
// or, handed on the command line, the name was heard since through listeners that all ended.
// `running`: runningProcesses.
function handedOut(
  db: DatabaseSync,
  session: number | undefined,
  at: string,
  running: (pid: number) => boolean,
): Set<string> {
  const heard = selectListening(db);
  const listeners = selectListenerProcesses(db);
  const other = ({ session: to }: NameOffer) => to === null || to !== session;
  const lately = ({ at: when }: NameOffer) => Date.parse(at) - Date.parse(when) < OFFER_WINDOW_MS;
  const ended = ({ name, at: when, session: to }: NameOffer) => {
    if (to !== null) return !running(to);
    const last = heard.get(name);
    return last !== undefined && last >= when && listenersEnded(listeners.get(name), running);
  };
  return new Set(
    selectNameOffers(db)
      .filter((offer) => lately(offer) && other(offer) && !ended(offer))
      .map(({ name }) => name),
  );
}

// Whether the agent's session ended: every process it was heard listening through (its MCP server,
// its wait) has ended, the test whoami hands its name back on (P4-R3-2). Never for an agent heard
// through none, such as one at the command line between its commands. An answer is not claimed
// for it, and another agent's claim takes over its lease (P3C-R3-11).
export function sessionEnded(
  db: DatabaseSync,
  agent: string,
  now: Clock = systemClock,
  alive: (pid: number) => boolean = processAlive,
): boolean {
  return listenersEnded(selectListenerProcesses(db).get(agent), runningProcesses(db, now, alive));
}

// Whether every process an agent was heard listening through (its MCP server, its wait) has ended;
// never for one heard through none.
function listenersEnded(
  processes: { session: number | null; waiter: number | null } | undefined,
  alive: (pid: number) => boolean,
): boolean {
  const { session = null, waiter = null } = processes ?? {};
  if (session === null && waiter === null) return false;
  return !(session !== null && alive(session)) && !(waiter !== null && alive(waiter));
}

// A name of the same stem as `base` that no agent ever used and no other session was handed:
// claude, claude-2 and claude-3 taken give claude-4. Null when none fits an agent name.
function freeName(db: DatabaseSync, base: string, handed: ReadonlySet<string>): string | null {
  const stem = base.replace(/-\d+$/, '');
  for (let n = 2; n < 100; n += 1) {
    const name = `${stem}-${n}`;
    if (!isAgentName(name)) return null;
    if (!handed.has(name) && !findAgent(db, name)) return name;
  }
  return null;
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

// A wait that ends by itself, however it ends: its process is no longer one to watch, so its
// agent is not counted as gone when it exits. Only a wait whose session ended stays noted: one
// killed with it, or one that saw its session gone and stopped.
export function endWaiter(db: DatabaseSync, agent: string, waiter: number): void {
  clearWaiter(db, agent, waiter);
}

// The agents an MCP server should stop hearing on its beats (`calls`: when each last called through
// it, in ms): a subagent that has not called within the listening window has ended, though the
// session's own agent (`own`), idle in its chat with the server open, still listens.
export function quietVoices(
  calls: ReadonlyMap<string, number>,
  own: string | undefined,
  now: number,
): string[] {
  return [...calls]
    .filter(([name, at]) => name !== own && now - at > LISTEN_WINDOW_MS)
    .map(([name]) => name);
}

// A harness loaded Otea's MCP server (its client's initialize): every agent of that harness can
// reach it, whatever name it took, and otea connect --check says the server works. `session`: the
// server's process, so the desk says MCP is at hand only while it runs (P4-R3-7).
export function mcpLoaded(
  db: DatabaseSync,
  harness: Harness,
  now: Clock = systemClock,
  session?: number,
): void {
  const key = harnessKey(harness.name);
  if (key === '') return;
  const at = now();
  saveMcpLoad(db, { harness: key, name: harness.name, at, session: session ?? null });
  if (session !== undefined) beatProcess(db, session, () => at);
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
// `processes` says whether a process id runs on this computer, and a listener (its MCP server, its
// wait) runs while it also beats (runningProcesses): an agent heard through a listener that is gone
// no longer listens, and if it did nothing since, its session ended (killed, or the computer
// restarted): it is gone, though a lease of its runs on.
export function listAgents(
  db: DatabaseSync,
  now: Clock = systemClock,
  processes: (pid: number) => boolean = processAlive,
): AgentPresence[] {
  const at = now();
  const alive = runningProcesses(db, () => at, processes);
  const holding = new Map<string, string[]>();
  for (const { id, lease } of selectLeases(db)) {
    const live = activeLease(lease, at);
    if (live) holding.set(live.holder, [...(holding.get(live.holder) ?? []), id]);
  }
  const heard = selectListening(db);
  const waits = selectWaiting(db);
  const listeners = selectListenerProcesses(db);
  const since = (last: string | undefined, window: number) =>
    last !== undefined && Date.parse(at) - Date.parse(last) <= window;
  const within = (last: string | undefined) => since(last, LISTEN_WINDOW_MS);
  // Every listener process it was heard through has ended.
  const silenced = (name: string) => listenersEnded(listeners.get(name), alive);
  const records = selectAgents(db);
  const declaredOf = new Map(records.map(({ name }) => [name, findProfile(db, name)]));
  // The harness an agent works through, as one key: its MCP client's, else the one it declared.
  const keyOf = ({ name, harness }: (typeof records)[number]): string | null => {
    const named =
      harness && harness.toLowerCase() !== 'cli' ? harness : declaredOf.get(name)?.profile.harness;
    return named ? harnessKey(named) : null;
  };
  // Per harness: the latest ask for MCP.
  const asks = new Map<string, string>();
  for (const record of records) {
    const key = keyOf(record);
    const value = record.mcpAskedAt;
    if (!key || key === 'cli' || !value) continue;
    const known = asks.get(key);
    if (known === undefined || known < value) asks.set(key, value);
  }
  // The harnesses with an MCP server running now: the last one each loaded, or one an agent of it
  // listens through. A load an ended session left is no server at hand (P4-R3-7).
  const serving = new Set<string>();
  for (const load of selectMcpLoads(db))
    if (load.session !== null && alive(load.session)) serving.add(load.harness);
  for (const record of records) {
    const key = keyOf(record);
    const session = listeners.get(record.name)?.session ?? null;
    if (key && session !== null && alive(session)) serving.add(key);
  }
  const mcpOf = (record: (typeof records)[number]): AgentPresence['mcp'] => {
    if (record.mcpAt) return null;
    const key = keyOf(record);
    const asked = [record.mcpAskedAt, key ? asks.get(key) : undefined]
      .filter((each): each is string => Boolean(each))
      .sort()
      .at(-1);
    if (asked === undefined) return null;
    return key && serving.has(key) ? 'unused' : 'missing';
  };
  const agents = records.map((record) => {
    const { name, harness, harnessVersion, connectedAt, lastSeen, mcpAt, folder } = record;
    const held = holding.get(name) ?? [];
    const heardAt = heard.get(name);
    const gone = heardAt !== undefined && silenced(name);
    const listening = within(heardAt) && !gone;
    // Its session ended: it was last heard through a listener now gone, and did nothing since.
    const ended = gone && Date.parse(lastSeen) <= Date.parse(heardAt);
    // It acted lately (a command-line agent between its commands); a profile given for it by
    // the person, with no sighting of its own, is no act.
    const active = connectedAt !== null && since(lastSeen, ACTIVE_WINDOW_MS);
    const declared = declaredOf.get(name);
    const mcp = mcpOf(record);
    return {
      name,
      harness,
      harnessVersion,
      connectedAt,
      holding: held,
      lastSeen,
      live: !ended && (listening || held.length > 0 || active),
      listening,
      waiting: within(waits.get(name)) && !gone,
      profile: declared ? profileView(declared.profile) : null,
      profileConfirmed: declared?.confirmed ?? false,
      profileChangedAt: profileChangedAt(db, name),
      mcpAt: mcpAt ?? null,
      mcpMissing: mcp === 'missing',
      mcp,
      folder: folder ?? null,
    };
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
    agents.map(({ name, harness, holding, lastSeen, profile, profileConfirmed, waiting, mcp }) => [
      name,
      harness,
      holding,
      lastSeen,
      profile,
      profileConfirmed,
      waiting,
      mcp,
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

// What a session should call itself (otea whoami): the name it worked under before, when an agent
// of the same harness worked from this folder (or one inside or around it) and no session listens
// or holds a lease under it now, so a returning session keeps one name, even right after its last
// one closed; never a name a session listens or works under, so a second terminal never takes
// another's. `name`: the one to reuse, the most recently seen; `lately`: it acted moments ago (a
// command-line agent between its commands may still be at work), which the session is told;
// `others`, the rest that fit; `working`, the names connected now or handed to another session
// lately; `suggested`, when no name fits but this one's earlier name is taken, a free one of its
// stem to take instead; `harness`, the harness the name to reuse is known by (null when unknown),
// and `sameHarness`, whether it is the one the session named.
export type NameAdvice = {
  name: string | null;
  lately: boolean;
  others: string[];
  working: string[];
  suggested: string | null;
  harness: string | null;
  sameHarness: boolean;
};

// A harness as one key, however it is written: "Claude Code" is claude-code, and "Open Code 2.0"
// is opencode, its version left out.
export const harnessKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[\s_-]*v?\d+(?:\.\d+)*$/, '')
    .replace(/[^a-z0-9]/g, '');

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
  processes: (pid: number) => boolean = processAlive,
): NameAdvice {
  const agents = listAgents(db, now, processes);
  const alive = runningProcesses(db, now, processes);
  const handed = handedOut(db, session, now(), alive);
  const working = [
    ...new Set([...agents.filter(({ live }) => live).map(({ name }) => name), ...handed]),
  ];
  const wanted = harness && harness.toLowerCase() !== 'cli' ? harnessKey(harness) : undefined;
  // The harnesses it is known by: its MCP client's, and the one its profile declares. A profile
  // declared for the command line (a test name, P6-R2-2) is known as cli; the command line it was
  // merely seen through says nothing of the harness behind it.
  const harnesses = (agent: AgentPresence) =>
    [agent.harness?.toLowerCase() === 'cli' ? null : agent.harness, agent.profile?.harness]
      .filter((each): each is string => Boolean(each))
      .map(harnessKey);
  // The best fit first: an agent whose harness is the one named, then one with a profile, then one
  // with none (a name seen only on a failed command, P2S-R2-3); the most recently seen within each.
  const rank = (agent: AgentPresence) =>
    wanted !== undefined && harnesses(agent).includes(wanted) ? 2 : agent.profile ? 1 : 0;
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
  // Its session ended: every process it was heard listening through is gone (P4-R3-2). Its
  // lease is then the returning session's to carry on, and its last acts no other terminal's.
  const listeners = selectListenerProcesses(db);
  const ended = (agent: AgentPresence) => listenersEnded(listeners.get(agent.name), alive);
  const busy = (agent: AgentPresence) =>
    listens(agent) || (agent.holding.length > 0 && !ended(agent)) || handed.has(agent.name);
  const earlier = agents
    .filter((agent) => agent.connectedAt !== null && agent.folder !== null)
    .filter((agent) => sameFolder(agent.folder ?? '', folder))
    .filter((agent) => {
      const known = harnesses(agent);
      return wanted === undefined || known.length === 0 || known.includes(wanted);
    })
    .sort((a, b) => rank(b) - rank(a) || Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
  const fits = earlier.filter((agent) => !busy(agent));
  const [first] = fits;
  const taken = first === undefined ? earlier[0] : undefined;
  const known = first ? (first.profile?.harness ?? first.harness) : null;
  return {
    name: first?.name ?? null,
    lately: first?.live === true && !ended(first),
    others: fits.slice(1).map(({ name }) => name),
    working: working.filter((name) => name !== first?.name),
    suggested: taken ? freeName(db, taken.name, handed) : null,
    harness: first && harnesses(first).length > 0 ? known : null,
    sameHarness: first !== undefined && wanted !== undefined && harnesses(first).includes(wanted),
  };
}

// What otea whoami tells a session (nameFor), and the name it hands it noted as handed out, so a
// session asking next is handed another one. The MCP server asking (`session`) is the process
// calling: it runs.
export function offerName(
  db: DatabaseSync,
  asking: { folder: string; harness?: string | undefined; session?: number | undefined },
  now: Clock = systemClock,
  alive: (pid: number) => boolean = processAlive,
): NameAdvice {
  const at = now();
  if (asking.session !== undefined) beatProcess(db, asking.session, () => at);
  const advice = nameFor(db, asking, () => at, alive);
  const name = advice.name ?? advice.suggested;
  if (name !== null) saveNameOffer(db, { name, at, session: asking.session ?? null });
  return advice;
}
