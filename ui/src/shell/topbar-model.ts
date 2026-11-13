import type { FeedEvent } from '../activity.ts';
import { isStuck } from '../derive/toca.ts';
import type { Connection } from '../hooks.ts';
import { t } from '../i18n/i18n.ts';
import { type Look, lookOf } from '../lanes/looks.ts';
import { type Agent, type AgentProfile, liveAgents } from '../presence.ts';
import { projectHref, waitingElsewhere, whereOf } from '../projects.ts';
import type { Item, ProjectOverview, ProjectView } from '../types.ts';
import { type AgentStateName, agentState } from '../views/toca/trace.ts';

// What the topbar's two menus list (SPEC §7.1, mock:3370-3393), worked out from the data alone.

export type ProjectRow = {
  id: string;
  name: string;
  current: boolean;
  // The mono line: open now, where it lives, or how to open it.
  line: string;
  waiting: number;
  // Another served project opens at its own address; the current one and an unserved one have none.
  href?: string;
  inert: boolean;
};

// Every project on this machine: the one open now first (with your count, the rail's), then the
// rest as the server lists them. Before the server answers, the project open now alone.
export function projectRows(
  project: ProjectView,
  projects: readonly ProjectOverview[] | undefined,
  yoursHere: number,
): { rows: ProjectRow[]; total: number } {
  const listed: ProjectOverview[] = projects?.length
    ? [...projects.filter((p) => p.current), ...projects.filter((p) => !p.current)]
    : [
        {
          id: project.id,
          name: project.name,
          storage: 'common',
          current: true,
          paths: [],
          waiting: [],
          withAgents: 0,
          open: 0,
        },
      ];
  const rows = listed.map((each): ProjectRow => {
    if (each.current) {
      return {
        id: each.id,
        name: each.name,
        current: true,
        line: t('shell.projectOpen'),
        waiting: yoursHere,
        inert: false,
      };
    }
    const href = each.unavailable ? undefined : projectHref(each);
    const where = whereOf(each) ?? '';
    const missing = each.paths.some((path) => path.missing);
    const line = href ? where : t('shell.notServed');
    return {
      id: each.id,
      name: each.name,
      current: false,
      line: missing ? `${t('shell.pathMissing')} · ${line}` : line,
      waiting: each.waiting.length,
      ...(href ? { href } : {}),
      inert: !href,
    };
  });
  return { rows, total: rows.reduce((sum, row) => sum + row.waiting, 0) };
}

// "3 más te esperan en 2 proyectos": the rest of your attention, outside this project. None while
// nothing waits elsewhere.
export function elsewhereLine(projects: readonly ProjectOverview[] | undefined): string | null {
  const { count, projects: where } = waitingElsewhere(projects ?? []);
  if (count === 0) return null;
  return t('shell.elsewhere', { count, where: t('shell.otherProjects', { count: where }) });
}

export type HeldItem = { id: string; title: string; look: Look };

// What an agent is up to, in the menu's order of attention: gone quiet on a lease that ran out,
// working on what it holds, waiting for your answer, or idle.
export type AgentDoing = 'quiet' | 'work' | 'wait' | 'idle';

const ATTENTION: readonly AgentDoing[] = ['quiet', 'work', 'wait', 'idle'];

export type AgentRow = {
  name: string;
  harness: string | null;
  // What it declares it runs as (null before it declares one), whether it declared it in this
  // session, and when its model or effort last changed.
  profile: AgentProfile | null;
  confirmed: boolean;
  changedAt: string | null;
  // What it holds a lease on, then what it left stuck when its lease ran out.
  held: HeldItem[];
  // It went quiet: a lease of its ran out with nobody releasing it.
  quiet: boolean;
  // It holds a lease now.
  working: boolean;
  state: AgentDoing;
  // Since when it is in that state, and the item it is about (none while idle with no past act).
  since: number;
  item: HeldItem | null;
  lastSeen: string;
};

// The harness an agent works through: its MCP client's name, else the one its profile names (a
// command-line agent names it there), else the command line.
export function harnessOf(a: Pick<Agent, 'harness' | 'profile'>): string | null {
  if (a.harness && a.harness.toLowerCase() !== 'cli') return a.harness;
  return a.profile?.harness || a.harness;
}

const DOING: Record<AgentStateName, AgentDoing> = {
  quiet: 'quiet',
  work: 'work',
  wait: 'wait',
  free: 'idle',
};

// The agents of the menu: the connected ones, then any agent gone quiet on an item it left stuck,
// so the menu says where the silence is; what asks for attention first (quiet, working, waiting
// for your answer, idle), the most recently seen first within each.
export function agentRows(
  agents: readonly Agent[],
  items: readonly Item[],
  now: number,
  feed: readonly FeedEvent[] = [],
): AgentRow[] {
  const stuckBy = (name: string) =>
    items.filter((it) => isStuck(it, now) && it.expiredLease?.holder === name);
  const live = liveAgents(agents);
  const gone = agents.filter((a) => !a.live && stuckBy(a.name).length > 0);
  const rows = [...live, ...liveAgents(gone.map((a) => ({ ...a, live: true })))].map(
    (a): AgentRow => {
      const holding = a.holding.map((id): HeldItem => {
        const it = items.find((each) => each.id === id);
        return { id, title: it?.title ?? '', look: it ? lookOf(it, now) : 'working' };
      });
      const stuck = stuckBy(a.name).map(
        (it): HeldItem => ({ id: it.id, title: it.title, look: 'stuck' }),
      );
      const st = agentState(a.name, items, feed, now, a.lastSeen);
      const quiet = stuck.length > 0;
      const working = a.holding.length > 0;
      const state: AgentDoing = working ? 'work' : quiet ? 'quiet' : DOING[st.state];
      return {
        name: a.name,
        harness: harnessOf(a),
        profile: a.profile ?? null,
        confirmed: a.profileConfirmed ?? false,
        changedAt: a.profileChangedAt ?? null,
        held: [...holding, ...stuck.filter((s) => !holding.some((h) => h.id === s.id))],
        quiet,
        working,
        state,
        since: st.since,
        item: st.item ? { id: st.item.id, title: st.item.title, look: lookOf(st.item, now) } : null,
        lastSeen: a.lastSeen,
      };
    },
  );
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        ATTENTION.indexOf(a.row.state) - ATTENTION.indexOf(b.row.state) || a.index - b.index,
    )
    .map(({ row }) => row);
}

// The agents the menu lists, those holding a lease ("trabajando") and the rest, holding none; of
// them, those gone quiet and those with no profile: counted from the menu's own rows, so the pill
// and the menu agree.
export function agentCounts(rows: readonly AgentRow[]): {
  live: number;
  holding: number;
  idle: number;
  quiet: number;
  noProfile: number;
} {
  const holding = rows.filter((a) => a.working).length;
  return {
    live: rows.length,
    holding,
    idle: rows.length - holding,
    quiet: rows.filter((a) => a.quiet).length,
    noProfile: rows.filter((a) => !a.profile).length,
  };
}

export type PillMark = 'working' | 'idle' | 'none' | 'offline';

// The pill's 16 px mark: the working node with its orbit while an agent holds a lease, a ring with
// agents connected, a dashed ring with none; offline while the stream is down (it cannot count).
export function pillMark(connection: Connection, rows: readonly AgentRow[]): PillMark {
  if (connection !== 'live') return 'offline';
  const { live, holding } = agentCounts(rows);
  if (holding > 0) return 'working';
  return live > 0 ? 'idle' : 'none';
}

// The pill's second datum, in grey or in warn: one gone quiet wins over one without a profile,
// which wins over the total ("de 3") beside those working. Never more than two data on the pill.
export type PillExtra = { kind: 'quiet' | 'noProfile' | 'of'; n: number } | null;

export type PillSummary =
  | { kind: 'offline' }
  | { kind: 'none' }
  | { kind: 'working' | 'waiting'; count: number; extra: PillExtra };

// What the pill says (mock §1): what happens, not how many there are. "2 trabajando" before "3
// agentes"; with nobody working, how many wait; nobody connected; or that it cannot tell.
export function pillSummary(connection: Connection, rows: readonly AgentRow[]): PillSummary {
  if (connection !== 'live') return { kind: 'offline' };
  const c = agentCounts(rows);
  if (c.live === 0) return { kind: 'none' };
  const working = c.holding > 0;
  const extra: PillExtra =
    c.quiet > 0
      ? { kind: 'quiet', n: c.quiet }
      : c.noProfile > 0
        ? { kind: 'noProfile', n: c.noProfile }
        : working && c.live > c.holding
          ? { kind: 'of', n: c.live }
          : null;
  return working
    ? { kind: 'working', count: c.holding, extra }
    : { kind: 'waiting', count: c.live, extra };
}
