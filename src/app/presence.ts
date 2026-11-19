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
  findAgent,
  findProfile,
  markListening,
  markWaiting,
  type NameOffer,
  type ProfileView,
  profileView,
  saveNameOffer,
  saveProfile,
  selectAgents,
  selectLeases,
  selectListener,
  selectListenerProcesses,
  selectListening,
  selectNameOffers,
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
  markListening(db, sighting.agent, at, sighting.session, sighting.launcher, sighting.waiter);
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
  // The name it is told is handed to it, so a third session refused the same name is told another.
  const at = now();
  const offers = handedOut(db, session, at);
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
// command-line session has none Otea can tell apart, so every earlier one is another).
function handedOut(db: DatabaseSync, session: number | undefined, at: string): Set<string> {
  const other = ({ session: to }: NameOffer) => to === null || to !== session;
  const lately = ({ at: when }: NameOffer) => Date.parse(at) - Date.parse(when) < OFFER_WINDOW_MS;
  return new Set(
    selectNameOffers(db)
      .filter((offer) => lately(offer) && other(offer))
      .map(({ name }) => name),
  );
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
// agent is not counted as gone when it exits. Only a wait killed with its session stays noted.
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

// A profile's harness is the MCP client's: when the client names another one, the profile follows.
function followClient(db: DatabaseSync, { agent, channel, harness }: Sighting, at: string): void {
  if (channel !== 'mcp' || !harness) return;
  const declared = findProfile(db, agent);
  if (!declared || declared.profile.harness === harness.name) return;
  const profile = { ...declared.profile, harness: harness.name };
  saveProfile(db, agent, profile, { at, channel, confirmed: declared.confirmed });
}

// The agents seen in the project, never the human: live ones first, then the most recently seen.
// `alive` says whether a process of this computer still runs: an agent heard through a listener
// (its MCP server, its wait) whose process is gone no longer listens, and if it did nothing since,
// its session ended (killed, or the computer restarted): it is gone, though a lease of its runs on.
export function listAgents(
  db: DatabaseSync,
  now: Clock = systemClock,
  alive: (pid: number) => boolean = processAlive,
): AgentPresence[] {
  const at = now();
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
  const silenced = (name: string) => {
    const { session = null, waiter = null } = listeners.get(name) ?? {};
    if (session === null && waiter === null) return false;
    return !(session !== null && alive(session)) && !(waiter !== null && alive(waiter));
  };
  const agents = selectAgents(db).map(
    ({ name, harness, harnessVersion, connectedAt, lastSeen, mcpAt, mcpAskedAt, folder }) => {
      const held = holding.get(name) ?? [];
      const heardAt = heard.get(name);
      const gone = heardAt !== undefined && silenced(name);
      const listening = within(heardAt) && !gone;
      // Its session ended: it was last heard through a listener now gone, and did nothing since.
      const ended = gone && Date.parse(lastSeen) <= Date.parse(heardAt);
      // It acted lately (a command-line agent between its commands); a profile given for it by
      // the person, with no sighting of its own, is no act.
      const active = connectedAt !== null && since(lastSeen, ACTIVE_WINDOW_MS);
      const declared = findProfile(db, name);
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
const harnessKey = (name: string) =>
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
  alive: (pid: number) => boolean = processAlive,
): NameAdvice {
  const agents = listAgents(db, now, alive);
  const handed = handedOut(db, session, now());
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
  const busy = (agent: AgentPresence) =>
    listens(agent) || agent.holding.length > 0 || handed.has(agent.name);
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
    lately: first?.live === true,
    others: fits.slice(1).map(({ name }) => name),
    working: working.filter((name) => name !== first?.name),
    suggested: taken ? freeName(db, taken.name, handed) : null,
    harness: first && harnesses(first).length > 0 ? known : null,
    sameHarness: first !== undefined && wanted !== undefined && harnesses(first).includes(wanted),
  };
}

// What otea whoami tells a session (nameFor), and the name it hands it noted as handed out, so a
// session asking next is handed another one.
export function offerName(
  db: DatabaseSync,
  asking: { folder: string; harness?: string | undefined; session?: number | undefined },
  now: Clock = systemClock,
  alive: (pid: number) => boolean = processAlive,
): NameAdvice {
  const at = now();
  const advice = nameFor(db, asking, () => at, alive);
  const name = advice.name ?? advice.suggested;
  if (name !== null) saveNameOffer(db, { name, at, session: asking.session ?? null });
  return advice;
}
