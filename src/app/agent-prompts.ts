import type { JoinFacts, PromptKind } from '../core/agent-prompts.ts';
import { listBoardSummaries } from './boards.ts';
import type { Context } from './context.ts';
import { listItems, systemClock } from './items.ts';
import { liveBoardOf } from './next.ts';
import { listAgents } from './presence.ts';

// The project as an agent joining it reads it: each published board of the person's (Pedidos
// aside) with the steps an agent does and how many items wait for an agent with nobody holding
// them, and the names of the agents listening now.
export function joinFacts(ctx: Context, now = systemClock): JoinFacts {
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
  const agents = listAgents(ctx.db, now);
  const listening = agents.filter(({ listening: heard }) => heard).map(({ name }) => name);
  // No agent was ever seen: the one joining is the project's first, and connects.
  return { boards, listening, ...(agents.length === 0 ? { first: true } : {}) };
}

// The moment a project is in: no board of its own yet is a first contact, any board makes a new
// agent one more to join it.
export function promptKindOf(ctx: Context): PromptKind {
  return listBoardSummaries(ctx).some(({ builtin }) => !builtin) ? 'join' : 'start';
}
