import { isStuck } from '../derive/toca.ts';
import type { Connection } from '../hooks.ts';
import { t } from '../i18n/i18n.ts';
import { type Look, lookOf } from '../lanes/looks.ts';
import { type Agent, liveAgents } from '../presence.ts';
import { projectHref, waitingElsewhere, whereOf } from '../projects.ts';
import type { Item, ProjectOverview, ProjectView } from '../types.ts';

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

export type AgentRow = {
  name: string;
  harness: string | null;
  // What it holds a lease on, then what it left stuck when its lease ran out.
  held: HeldItem[];
  // It went quiet: a lease of its ran out with nobody releasing it.
  quiet: boolean;
  // It holds a lease now.
  working: boolean;
  lastSeen: string;
};

// The agents of the menu: the connected ones, the most recently seen first, then any agent gone
// quiet on an item it left stuck, so the menu says where the silence is.
export function agentRows(
  agents: readonly Agent[],
  items: readonly Item[],
  now: number,
): AgentRow[] {
  const stuckBy = (name: string) =>
    items.filter((it) => isStuck(it, now) && it.expiredLease?.holder === name);
  const live = liveAgents(agents);
  const gone = agents.filter((a) => !a.live && stuckBy(a.name).length > 0);
  return [...live, ...liveAgents(gone.map((a) => ({ ...a, live: true })))].map((a) => {
    const holding = a.holding.map((id): HeldItem => {
      const it = items.find((each) => each.id === id);
      return { id, title: it?.title ?? '', look: it ? lookOf(it, now) : 'working' };
    });
    const stuck = stuckBy(a.name).map(
      (it): HeldItem => ({ id: it.id, title: it.title, look: 'stuck' }),
    );
    return {
      name: a.name,
      harness: a.harness,
      held: [...holding, ...stuck.filter((s) => !holding.some((h) => h.id === s.id))],
      quiet: stuck.length > 0,
      working: a.holding.length > 0,
      lastSeen: a.lastSeen,
    };
  });
}

// The agents the menu lists, those holding a lease ("trabajando") and the rest, holding none (one
// gone quiet says so in its row): counted from the menu's own rows, so the pill and the menu agree.
export function agentCounts(rows: readonly AgentRow[]): {
  live: number;
  holding: number;
  idle: number;
} {
  const holding = rows.filter((a) => a.working).length;
  return { live: rows.length, holding, idle: rows.length - holding };
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
