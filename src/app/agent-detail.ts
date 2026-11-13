import { OteaError } from '../core/errors.ts';
import { findAgent, type ProfileChange, selectProfileChanges } from '../store/queries.ts';
import type { Context } from './context.ts';
import { type Clock, systemClock } from './items.ts';
import { liveBoards } from './next.ts';
import { type AgentPresence, listAgents } from './presence.ts';

// Who does a step or reviews it, as an agent's sheet reads it: you, any agent, one agent by name,
// or (reviewing) nobody.
export type StepRole =
  | { kind: 'you' }
  | { kind: 'any' }
  | { kind: 'none' }
  | { kind: 'agent'; agent: string };

export type AgentStep = {
  board: string;
  step: string;
  name: string;
  doer: StepRole;
  reviewer: StepRole;
};

// One agent as its sheet shows it: its presence, every profile it declared (oldest first) and the
// steps of the live boards with who does and reviews each, so the sheet can say what it may take.
export type AgentDetail = {
  agent: AgentPresence;
  profiles: ProfileChange[];
  steps: AgentStep[];
};

function roleOf(role: unknown): StepRole {
  if (role === 'you' || role === 'none' || role === 'any') return { kind: role };
  if (typeof role === 'object' && role !== null && 'agent' in role) {
    return { kind: 'agent', agent: String(role.agent) };
  }
  return { kind: 'any' };
}

export function agentDetail(ctx: Context, name: string, now: Clock = systemClock): AgentDetail {
  const agent = findAgent(ctx.db, name) && listAgents(ctx.db, now).find((a) => a.name === name);
  if (!agent) throw new OteaError('not_found', `No agent named ${name} in this project`);
  const steps = liveBoards(ctx).flatMap(({ collection, def }) =>
    def.steps.map(
      (step): AgentStep => ({
        board: collection,
        step: step.id,
        name: step.name,
        doer: roleOf(step.doer),
        reviewer: roleOf(step.reviewer),
      }),
    ),
  );
  return { agent, profiles: selectProfileChanges(ctx.db, name), steps };
}
