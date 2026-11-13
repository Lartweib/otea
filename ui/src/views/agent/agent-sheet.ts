import type { FeedEvent, TurnOf } from '../../activity.ts';
import { type AgentProfile, parseProfile } from '../../presence.ts';
import type { Item } from '../../types.ts';

// An agent's sheet (agents mock §3), worked out from the data alone: its profile and how it
// changed, its last handoffs with the profile of each, and the steps it may take.

// One profile it declared, as GET /api/agents/<name> lists them, oldest first.
export type ProfileChange = { profile: AgentProfile; at: string };

// Who does a step or reviews it (src/app/agent-detail.ts).
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

export type AgentDetail = { profiles: ProfileChange[]; steps: AgentStep[] };

const ROLES = new Set(['you', 'any', 'none']);

function roleOf(raw: unknown): StepRole {
  const r = raw as { kind?: unknown; agent?: unknown } | null;
  if (r?.kind === 'agent' && typeof r.agent === 'string') return { kind: 'agent', agent: r.agent };
  return typeof r?.kind === 'string' && ROLES.has(r.kind)
    ? ({ kind: r.kind } as StepRole)
    : { kind: 'any' };
}

// The server's answer, read defensively: what it cannot read is left out.
export function parseAgentDetail(body: unknown): AgentDetail {
  const b = body as { profiles?: unknown; steps?: unknown } | null;
  const profiles = (Array.isArray(b?.profiles) ? b.profiles : []).flatMap(
    (raw): ProfileChange[] => {
      const each = raw as { profile?: unknown; at?: unknown } | null;
      const profile = parseProfile(each?.profile);
      return profile && typeof each?.at === 'string' ? [{ profile, at: each.at }] : [];
    },
  );
  const steps = (Array.isArray(b?.steps) ? b.steps : []).flatMap((raw): AgentStep[] => {
    const s = raw as Partial<Record<keyof AgentStep, unknown>> | null;
    if (typeof s?.board !== 'string' || typeof s.name !== 'string') return [];
    return [
      {
        board: s.board,
        step: typeof s.step === 'string' ? s.step : s.name,
        name: s.name,
        doer: roleOf(s.doer),
        reviewer: roleOf(s.reviewer),
      },
    ];
  });
  return { profiles, steps };
}

// One line of the profile's story, newest first: it declared one (`from` absent), or went from one
// to another. A harness the client renamed is no change of model or effort, so it is left out.
export type TrailLine = { at: string; from?: AgentProfile; to: AgentProfile };

const sameWork = (a: AgentProfile, b: AgentProfile) => a.model === b.model && a.effort === b.effort;

export function profileTrail(changes: readonly ProfileChange[]): TrailLine[] {
  const lines: TrailLine[] = [];
  let last: AgentProfile | undefined;
  for (const { profile, at } of changes) {
    if (last && sameWork(last, profile)) continue;
    lines.push(last ? { at, from: last, to: profile } : { at, to: profile });
    last = profile;
  }
  return lines.reverse();
}

// A handoff of the agent's, as the sheet lists it: the item, when, which round of it, the profile
// it handed off with, and what became of it: it waits for your review, you sent it back, or it
// went on.
export type Handoff = {
  id: string;
  title: string;
  at: string;
  round: number;
  profile?: AgentProfile;
  status: 'review' | 'back' | 'on';
};

const own = (e: FeedEvent, name: string) =>
  e.actor.kind === 'agent' && e.actor.name === name && typeof e.data.via !== 'string';

export function lastHandoffs(
  name: string,
  feed: readonly FeedEvent[],
  items: readonly Item[],
  turnOf: TurnOf,
  max = 3,
): Handoff[] {
  const sorted = [...feed].sort((a, b) => a.id - b.id);
  const handed = (e: FeedEvent) =>
    e.type === 'transitioned' && turnOf(e.itemId, String(e.data.to)) === 'human';
  const out: Handoff[] = [];
  for (const [i, e] of sorted.entries()) {
    if (!handed(e) || !own(e, name)) continue;
    const item = items.find((it) => it.id === e.itemId);
    const round = sorted
      .slice(0, i + 1)
      .filter((x) => x.itemId === e.itemId && x.actor.kind === 'agent' && handed(x)).length;
    const next = sorted
      .slice(i + 1)
      .find((x) => x.itemId === e.itemId && x.type === 'transitioned');
    const reason = typeof next?.data.reason === 'string' && next.data.reason.trim() !== '';
    const status: Handoff['status'] = !next
      ? 'review'
      : reason && turnOf(e.itemId, String(next.data.to)) === 'agent'
        ? 'back'
        : 'on';
    out.push({
      id: e.itemId,
      title: item?.title ?? e.itemId,
      at: e.at,
      round,
      ...(e.profile ? { profile: e.profile } : {}),
      status,
    });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, max);
}

// What the agent may take (no step asks for a profile): a step any agent does, or one named for
// it; a review by any agent or by it, never of what it did itself. What it may not: your steps,
// and those named for another agent.
export type Eligible = {
  board: string;
  name: string;
  review: boolean;
  can: boolean;
  why: 'any' | 'its' | 'yours' | 'other' | 'notOwn';
  agent?: string;
};

export function eligibility(name: string, steps: readonly AgentStep[]): Eligible[] {
  const out: Eligible[] = [];
  for (const s of steps) {
    const base = { board: s.board, name: s.name };
    const d = s.doer;
    if (d.kind === 'you') out.push({ ...base, review: false, can: false, why: 'yours' });
    else if (d.kind === 'agent' && d.agent !== name)
      out.push({ ...base, review: false, can: false, why: 'other', agent: d.agent });
    else out.push({ ...base, review: false, can: true, why: d.kind === 'agent' ? 'its' : 'any' });
    const r = s.reviewer;
    if (r.kind === 'any' || (r.kind === 'agent' && r.agent === name))
      out.push({ ...base, review: true, can: true, why: 'notOwn' });
  }
  return out.sort((a, b) => Number(b.can) - Number(a.can));
}
