import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { JoinFacts, PromptKind } from '../core/agent-prompts.ts';
import { listBoardSummaries } from './boards.ts';
import type { Context } from './context.ts';
import { listItems, systemClock } from './items.ts';
import { liveBoardOf } from './next.ts';
import { listAgents } from './presence.ts';

// A project as the prompts read it: its folder too, when known.
type Place = Context & { root?: string };

// Whether the project's folder is a git repository: a plain folder (a page kept by someone who
// never uses git) gets prompts with no repository, history, CI or worktree in them.
function isRepo({ root }: Place): boolean {
  return root === undefined || existsSync(join(root, '.git'));
}

// The project as an agent joining it reads it: each published board of the person's (Pedidos
// aside) with the steps an agent does and how many items wait for an agent with nobody holding
// them, and the names of the agents working now.
export function joinFacts(ctx: Place, now = systemClock): JoinFacts {
  const boards = listBoardSummaries(ctx)
    .filter(
      ({ builtin, liveVersion, collection }) => !builtin && liveVersion !== null && collection,
    )
    .flatMap(({ collection }) => {
      const live = collection ? liveBoardOf(ctx, collection) : undefined;
      if (!collection || !live) return [];
      const agentSteps = live.def.steps
        .filter(({ doer }) => doer === 'any')
        .map(({ name }) => name);
      const waiting = listItems(ctx, { collection, turn: 'agent' }, now).filter(
        ({ lease }) => !lease,
      ).length;
      return [{ name: live.def.name, agentSteps, waiting }];
    });
  // Working: connected now, or holding an item while Otea cannot tell its session ended: a long
  // step runs with no wait and no otea call. Its name is taken either way.
  const working = listAgents(ctx.db, now)
    .filter(({ live, holding, sessionEnded }) => live || (holding.length > 0 && !sessionEnded))
    .map(({ name }) => name);
  // Nobody works there now: the one joining has nobody to join.
  return {
    boards,
    working,
    ...(working.length === 0 ? { first: true } : {}),
    repo: isRepo(ctx),
  };
}

// The facts a prompt of the moment is written from: the join prompt reads the whole project; the
// others only whether it is a git repository.
export function promptFacts(ctx: Place, moment: PromptKind, now = systemClock): JoinFacts {
  if (moment === 'join') return joinFacts(ctx, now);
  return { boards: [], working: [], repo: isRepo(ctx) };
}

// The moment a project is in: no board of its own yet is a first contact, any board makes a new
// agent one more to join it.
export function promptKindOf(ctx: Context): PromptKind {
  return listBoardSummaries(ctx).some(({ builtin }) => !builtin) ? 'join' : 'start';
}
