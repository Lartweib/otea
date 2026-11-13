import { turnAgent } from '../../actions.ts';
import { mainPath } from '../../derive/path.ts';
import { leftFor } from '../../derive/toca.ts';
import { relayOf } from '../../format.ts';
import type { MessageKey } from '../../i18n/i18n.ts';
import type { Look } from '../../lanes/looks.ts';
import { roundsOf } from '../../rounds.ts';
import type { ItemEvent, ItemView, TypeView } from '../../types.ts';

// What the sheet reads from the open item's own history (SPEC §10.3): who handed it over and what
// they said, the round, your last notes, a question, your own step, the rounds you sent back.

export type Handed = { agent: string; reason: string; at: string };

export type Facts = {
  // The agent that has it, or had it last.
  agent: string | null;
  // You took the stuck item in hand (Retomar or Reasignar) and no agent has claimed it since: agent
  // is whom you left it for, or none.
  left: boolean;
  handed: Handed | null;
  round: number;
  question: boolean;
  own: boolean;
  mine: { reason: string; at: string; round: number } | null;
  answered: { reason: string; at: string } | null;
  visited: string[];
  // The rounds you sent back, oldest first, with the state the agent had handed it to.
  sentBack: { n: number; at: string; state: string }[];
};

const reasonOf = (e: ItemEvent) => (typeof e.data.reason === 'string' ? e.data.reason : '');

const isAgentMove = (e: ItemEvent) =>
  e.type === 'transitioned' && e.actor.kind === 'agent' && !relayOf(e);

const isYourMove = (e: ItemEvent) =>
  e.type === 'transitioned' && (e.actor.kind === 'human' || !!relayOf(e));

const asks = (reason: string) => reason.trim().endsWith('?');

// Your send-backs: a move of yours from a step on your turn back to an agent's (not forward along
// the main path), other than an answer to the question the agent just asked; each at the step it
// left, in the round it ended.
function sentBackOf(events: readonly ItemEvent[], type: TypeView | undefined): Facts['sentBack'] {
  const turn = new Map((type?.states ?? []).map((s) => [s.name, s.turn]));
  const path = type ? mainPath(type) : [];
  const forward = (from: string, to: string) =>
    path.includes(from) && path.indexOf(to) > path.indexOf(from);
  const out: Facts['sentBack'] = [];
  let handed = 0;
  let before: ItemEvent | undefined;
  for (const e of events) {
    if (e.type !== 'transitioned') continue;
    const from = String(e.data.from);
    const to = String(e.data.to);
    if (isAgentMove(e)) {
      if (turn.get(to) === 'human') handed++;
    } else if (turn.get(from) === 'human' && turn.get(to) === 'agent' && !forward(from, to)) {
      const answers = !!before && isAgentMove(before) && asks(reasonOf(before));
      if (!answers) out.push({ n: Math.max(1, handed), at: e.at, state: from });
    }
    before = e;
  }
  return out;
}

export function factsOf(item: ItemView, type: TypeView | undefined, _now: number): Facts {
  const events = [...item.events].sort((a, b) => a.id - b.id);
  const last = events.findLast((e) => e.type === 'transitioned' && e.data.to === item.state);
  const handed =
    last && isAgentMove(last)
      ? { agent: last.actor.name, reason: reasonOf(last), at: last.at }
      : null;
  const rounds = roundsOf(events, item.evidence, type?.states ?? []);
  const sentBack = sentBackOf(events, type);
  const yours = events.filter((e) => isYourMove(e) && reasonOf(e) !== '');
  const lastBack = [...sentBack].reverse()[0];
  const mineEvent = lastBack
    ? yours.findLast((e) => e.at === lastBack.at && !asks(reasonOf(e)))
    : undefined;
  // What you answered: your move with words right after an agent's question.
  let answered: Facts['answered'] = null;
  for (let i = 1; i < events.length; i++) {
    const before = events.slice(0, i).findLast((e) => e.type === 'transitioned') as
      | ItemEvent
      | undefined;
    const e = events[i] as ItemEvent;
    if (isYourMove(e) && reasonOf(e) && before && isAgentMove(before) && asks(reasonOf(before)))
      answered = { reason: reasonOf(e), at: e.at };
  }
  if (answered && last && last.at !== answered.at) answered = null;
  const visited: string[] = [];
  for (const e of events) {
    const s = e.type === 'created' ? e.data.state : e.type === 'transitioned' ? e.data.to : null;
    if (typeof s === 'string' && !visited.includes(s)) visited.push(s);
  }
  const question = item.turn === 'human' && !!handed && asks(handed.reason);
  const moved = events.some((e) => e.type === 'transitioned');
  const own =
    item.turn === 'human' &&
    item.createdBy.kind === 'human' &&
    !!type &&
    item.state === type.initial &&
    !handed &&
    !(moved && events.findLast((e) => e.type === 'transitioned')?.actor.kind === 'agent');
  const left = leftFor(events);
  const agent =
    item.lease?.holder ??
    item.expiredLease?.holder ??
    (left === undefined ? (handed?.agent ?? turnAgent(events) ?? null) : left);
  return {
    agent,
    left: left !== undefined,
    handed,
    round: Math.max(1, rounds.length),
    question,
    own,
    mine:
      mineEvent && lastBack
        ? { reason: reasonOf(mineEvent), at: mineEvent.at, round: lastBack.n }
        : null,
    answered,
    visited,
    sentBack,
  };
}

// On a published board the step engine says the round, and whose turn it is: your own step, or,
// on the agent's turn, the holder (live or run out), else the agent you left a stuck item for,
// else the step's own agent (none when any agent may take it).
export function boardFactsOf(
  read: Facts,
  item: Pick<ItemView, 'turn' | 'lease' | 'expiredLease'>,
  board: { agent: string | null; round: number },
  own: boolean,
): Facts {
  const round = board.round > 0 ? board.round : read.round;
  if (own) return { ...read, round, own: true, question: false };
  if (item.turn !== 'agent') return { ...read, round };
  const holder = item.lease?.holder ?? item.expiredLease?.holder;
  if (holder) return { ...read, round, agent: holder, left: false };
  return read.left ? { ...read, round } : { ...read, round, agent: board.agent, left: false };
}

// Whom the standfirst names: the agent that handed it to you, else the agent that has it. On a
// board's agent turn (`boardAgentTurn`) the agent that handed it on is done with it; the step waits
// for its holder, its own agent, or the one you left it for (boardFactsOf).
export function standAgentOf(facts: Facts, boardAgentTurn: boolean): string | null {
  if (facts.left || boardAgentTurn) return facts.agent;
  return facts.handed?.agent ?? facts.agent;
}

export type Stand = { key: MessageKey; agent?: string; round?: number; time?: string };

// The standfirst under the headline: who hands it to you, asks, has gone quiet; your step; done.
export function standOf(o: {
  look: Look;
  agent: string | null;
  round: number;
  question: boolean;
  own: boolean;
  quiet: string | null;
  // You left the stuck item for `agent` (Reasignar) and no agent has taken it since.
  left?: boolean;
}): Stand {
  const a = o.agent ? { agent: o.agent } : {};
  const r = o.round > 1;
  switch (o.look) {
    case 'yours':
      if (o.own) return { key: 'sheet.stand.own' };
      if (!o.agent) return { key: 'sheet.stand.yours' };
      if (o.question) return { key: 'sheet.stand.asks', ...a };
      return r
        ? { key: 'sheet.stand.handedRound', ...a, round: o.round }
        : { key: 'sheet.stand.handed', ...a };
    case 'stuck':
      if (!o.agent) return { key: 'sheet.stand.waitsAgent' };
      return o.quiet
        ? { key: 'sheet.stand.stuck', ...a, time: o.quiet }
        : { key: 'sheet.stand.stuckNow', ...a };
    case 'queued':
      if (!o.agent) return { key: 'sheet.stand.waitsAgent' };
      if (o.left) return { key: 'sheet.stand.left', ...a };
      return r
        ? { key: 'sheet.stand.waitsRound', ...a, round: o.round }
        : { key: 'sheet.stand.waits', ...a };
    case 'waiting':
      return { key: 'sheet.stand.kids' };
    case 'working':
      if (!o.agent) return { key: 'sheet.stand.waitsAgent' };
      return r
        ? { key: 'sheet.stand.workingRound', ...a, round: o.round }
        : { key: 'sheet.stand.working', ...a };
    case 'done':
      return o.agent ? { key: 'sheet.stand.doneBy', ...a } : { key: 'sheet.stand.done' };
    case 'dropped':
      return { key: 'sheet.stand.dropped' };
  }
}
