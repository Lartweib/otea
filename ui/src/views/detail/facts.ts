import { turnAgent } from '../../actions.ts';
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

export function factsOf(item: ItemView, type: TypeView | undefined, _now: number): Facts {
  const events = [...item.events].sort((a, b) => a.id - b.id);
  const last = events.findLast((e) => e.type === 'transitioned' && e.data.to === item.state);
  const handed =
    last && isAgentMove(last)
      ? { agent: last.actor.name, reason: reasonOf(last), at: last.at }
      : null;
  const rounds = roundsOf(events, item.evidence, type?.states ?? []);
  const sentBack = rounds.flatMap((r) =>
    r.verdict?.kind === 'sent-back' ? [{ n: r.n, at: r.verdict.at, state: r.to }] : [],
  );
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
  const agent =
    item.lease?.holder ?? item.expiredLease?.holder ?? handed?.agent ?? turnAgent(events) ?? null;
  return {
    agent,
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

export type Stand = { key: MessageKey; agent?: string; round?: number; time?: string };

// The standfirst under the headline: who hands it to you, asks, has gone quiet; your step; done.
export function standOf(o: {
  look: Look;
  agent: string | null;
  round: number;
  question: boolean;
  own: boolean;
  quiet: string | null;
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
