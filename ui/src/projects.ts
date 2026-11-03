import { hashFor } from './selection.ts';
import type { ProjectOverview, WaitingItem } from './types.ts';

// What the projects inbox shows: the projects with something waiting for you, in the registry's
// order, and what stays out of it (items with agents, projects with nothing open).
export type Inbox = {
  waiting: number;
  groups: ProjectOverview[];
  withAgents: number;
  // The projects that hold the items with agents.
  agentProjects: string[];
  // The projects with nothing open at all.
  idle: string[];
  // The projects whose items could not be read.
  unavailable: ProjectOverview[];
};

export function inboxOf(projects: readonly ProjectOverview[]): Inbox {
  const readable = projects.filter((project) => project.unavailable === undefined);
  const groups = readable.filter((project) => project.waiting.length > 0);
  const agents = readable.filter((project) => project.withAgents > 0);
  return {
    waiting: groups.reduce((sum, project) => sum + project.waiting.length, 0),
    groups,
    withAgents: agents.reduce((sum, project) => sum + project.withAgents, 0),
    agentProjects: agents.map((project) => project.name),
    idle: readable.filter((project) => project.open === 0).map((project) => project.name),
    unavailable: projects.filter((project) => project.unavailable !== undefined),
  };
}

// What waits for you outside the project this server serves: for a line beside the switcher.
export function waitingElsewhere(projects: readonly ProjectOverview[]): {
  count: number;
  projects: number;
} {
  const others = projects.filter((project) => !project.current && project.waiting.length > 0);
  return {
    count: others.reduce((sum, project) => sum + project.waiting.length, 0),
    projects: others.length,
  };
}

// Where a row of the inbox leads: the item here, or in the server that shows its project; nowhere
// when no server shows it.
export function itemHref(project: ProjectOverview, item: WaitingItem): string | undefined {
  if (project.current) return hashFor(item.id);
  return project.served === undefined ? undefined : `${project.served}/${hashFor(item.id)}`;
}

export function projectHref(project: ProjectOverview): string | undefined {
  if (project.current) return '#/';
  return project.served === undefined ? undefined : `${project.served}/`;
}

// The first path of a project that is still there, to name where it lives.
export function whereOf(project: Pick<ProjectOverview, 'paths'>): string | undefined {
  return (project.paths.find((path) => !path.missing) ?? project.paths[0])?.path;
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

// A size in bytes, in the largest unit that keeps it at 1 or more, with one decimal under 10.
export function sizeLabel(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${shown} ${UNITS[unit]}`;
}
