import { OPTION_CHOSEN } from '../../../../src/core/board/choices.ts';
import { isClosed, positionOf } from '../../../../src/core/board/engine.ts';
import { MERGED } from '../../../../src/core/board/merged.ts';
import { type BoardDefinition, stepById } from '../../../../src/core/board/model.ts';
import {
  NOTE_ANSWERED,
  NOTE_LEFT,
  type NoteEvent,
  notesOf,
} from '../../../../src/core/board/notes.ts';
import { POINT_PROVED } from '../../../../src/core/board/proofs.ts';
import {
  legacyAsks,
  QUESTION_ANSWERED,
  QUESTION_ASKED,
} from '../../../../src/core/board/questions.ts';
import { stateName } from '../../../../src/core/board/reading.ts';
import { describeEvent, formatTime, momentParts, relayOf } from '../../format.ts';
import { type PlainKey, t } from '../../i18n/i18n.ts';
import type { AgentProfile } from '../../presence.ts';
import { fieldWord, keptStateWord, valueWord } from '../../preset-words.ts';
import { profilePair } from '../../profile-words.ts';
import { isSetAside, SET_ASIDE_LIFTED } from '../../set-aside.ts';
import type { ItemEvent, TypeView } from '../../types.ts';

// The item's history as the sheet's lane says it (SPEC §10.3, mock:638-649, 2736-2739): newest
// first, a dot per event (yours blue, agents ink, a ring when an agent relayed your words), the
// words of what happened, any quote, who did it.

// A note to the agent at work is one line (its answer folds into it): a hollow blue dot, yours but
// moving nothing; `open` while it waits for the answer.
export type HistoryLine = {
  id: number;
  dot: 'you' | 'agent' | 'relay' | 'note';
  open?: boolean;
  when: string;
  text: string;
  quote?: string;
  who: string;
  // The profile the agent wrote it with; none on yours, nor on your decision an agent relayed.
  profile?: AgentProfile;
};

// Why a set-aside lifted (src/app/set-aside.ts LiftCause): what it waited for closed, or what the
// person did.
const LIFT_WHY: Record<string, PlainKey> = {
  parts: 'sheet.h.unaside.parts',
  blockers: 'sheet.h.unaside.blockers',
  note: 'sheet.h.unaside.note',
  answer: 'sheet.h.unaside.answer',
  order: 'sheet.h.unaside.order',
  pin: 'sheet.h.unaside.pin',
  resume: 'sheet.h.unaside.resume',
};

const reasonOf = (e: ItemEvent) =>
  typeof e.data.reason === 'string' && e.data.reason !== '' ? e.data.reason : undefined;

export function whenOf(iso: string, now: number): string {
  const { day, time } = momentParts(iso, now);
  if (!day) return `${t('sheet.h.today')} ${time}`;
  const [today = ''] = formatTime(new Date(now).toISOString()).split(' ');
  const [date = ''] = formatTime(iso).split(' ');
  const yesterday = Date.parse(`${today}T00:00:00`) - Date.parse(`${date}T00:00:00`) <= 86_400_000;
  return yesterday ? `${t('sheet.h.yesterday')} ${time}` : `${day} ${time}`;
}

export function historyOf(
  events: readonly ItemEvent[],
  type: TypeView | undefined,
  word: (state: string) => string,
  now: number,
  board?: BoardDefinition,
): HistoryLine[] {
  const states = new Map((type?.states ?? []).map((s) => [s.name, s]));
  const fieldWords = {
    field: (key: string) => fieldWord(type, key) ?? key,
    value: (key: string, value: string) => valueWord(type, key, value),
  };
  // A state the type still has reads by its name today; one deleted since, by the name its event
  // kept when it was written (`stateName`, `toName`). An event written before names were kept
  // reads by the board's step of that id, or says the step is gone; off a board, as stored.
  const named = (state: string, kept: unknown) => {
    if (states.has(state)) return word(state);
    if (typeof kept === 'string' && kept !== '') return keptStateWord(kept);
    if (!board) return word(state);
    const position = positionOf(state);
    if (isClosed(position)) return word(state);
    return stepById(board, position.step)
      ? keptStateWord(stateName(board, state))
      : t('sheet.h.goneStep');
  };
  const sorted = [...events]
    .filter(({ type }) => type !== NOTE_ANSWERED)
    .sort((a, b) => a.id - b.id);
  const notes = new Map(notesOf(events as unknown as NoteEvent[]).map((note) => [note.note, note]));
  const handedTo = new Set<string>();
  // Before Otea read the item onto its board, its states were a preset's: their names are not
  // the board's words, so those lines say what happened without them.
  const reading = sorted.findLastIndex(
    (e) => e.type === 'transitioned' && e.data.reason === 'migrate',
  );
  const before = (i: number, state: unknown) => i < reading && !states.has(String(state));
  const lines = sorted.map((e, i): HistoryLine => {
    const relay = relayOf(e);
    const human = e.actor.kind === 'human';
    const who = human || relay ? t('sheet.d.youLower') : e.actor.name;
    const base = {
      id: e.id,
      when: whenOf(e.at, now),
      who,
      dot: (relay ? 'relay' : human ? 'you' : 'agent') as HistoryLine['dot'],
      ...(!human && !relay && e.profile ? { profile: e.profile } : {}),
    };
    const reason = reasonOf(e);
    if (e.type === NOTE_LEFT) {
      const note = notes.get(Number(e.data.note));
      const said = [
        note?.anchor ? t('notes.h.on', { file: note.anchor.filename }) : null,
        note?.answer
          ? t('notes.h.answered', {
              agent: note.answer.by,
              time: momentParts(note.answer.at, now).time,
            })
          : null,
      ].filter(Boolean);
      return {
        ...base,
        dot: 'note',
        open: !note?.answer,
        text: t('notes.h.left'),
        quote: String(e.data.text ?? ''),
        who: said.join(' · '),
      };
    }
    // An agent's question (otea ask) and your answer: neither moves the item.
    if (e.type === QUESTION_ASKED)
      return { ...base, text: t('sheet.h.askedYou'), quote: String(e.data.text ?? '') };
    // One given in the chat says which agent noted it (otea answer, P4-R2-2).
    if (e.type === QUESTION_ANSWERED) {
      const text = relay
        ? t('sheet.h.answeredInChat', { via: relay.via })
        : t('sheet.h.youAnswered');
      return { ...base, text, quote: String(e.data.text ?? '') };
    }
    // The option you picked of a decision's, with your comment.
    if (e.type === OPTION_CHOSEN) {
      const option = `${String(e.data.option ?? '')} · ${String(e.data.name ?? '')}`;
      const comment = typeof e.data.comment === 'string' && e.data.comment.trim();
      return {
        ...base,
        text: t('sheet.h.chose', { option }),
        ...(comment ? { quote: comment } : {}),
      };
    }
    if (e.type === 'created' && before(i, e.data.state)) {
      return { ...base, text: t(human ? 'sheet.h.createdYouBefore' : 'sheet.h.createdBefore') };
    }
    if (
      e.type === 'transitioned' &&
      !relay &&
      e.data.reason !== 'migrate' &&
      before(i, e.data.to)
    ) {
      const q = reason ? { quote: reason } : {};
      return { ...base, text: t(human ? 'sheet.h.movedYouBefore' : 'sheet.h.movedBefore'), ...q };
    }
    if (e.type === 'created') {
      const state = named(String(e.data.state), e.data.stateName);
      return { ...base, text: t(human ? 'sheet.h.createdYou' : 'sheet.h.created', { state }) };
    }
    if (e.type === 'transitioned') {
      const to = String(e.data.to);
      const state = named(to, e.data.toName);
      const target = states.get(to);
      // Otea reading a preset's item onto its board: no one moved it, and "migrate" is a marker.
      if (e.data.reason === 'migrate') {
        const note = typeof e.data.note === 'string' && e.data.note.trim() ? e.data.note : null;
        return {
          ...base,
          who: 'Otea',
          dot: 'agent',
          text: t('sheet.h.migrated', { state }),
          ...(note ? { quote: note } : {}),
        };
      }
      // A publish, or its undo, placing the item: the board moved it, and its reason is a marker.
      if (e.data.reason === 'publish')
        return {
          ...base,
          text: t('sheet.h.published', { version: String(e.data.board_version ?? ''), state }),
        };
      if (e.data.reason === 'restore') return { ...base, text: t('sheet.h.restored', { state }) };
      if (relay) {
        return {
          ...base,
          text: t('sheet.h.relayed', { via: relay.via, state }),
          ...(relay.quote ? { quote: relay.quote } : {}),
        };
      }
      const q = reason ? { quote: reason } : {};
      const from = positionOf(String(e.data.from ?? ''));
      // A closed board item taken back to a step (otea reopen): its reason is why.
      if (board && isClosed(from) && !isClosed(positionOf(to)))
        return {
          ...base,
          text: t(human ? 'sheet.h.reopenedYou' : 'sheet.h.reopened', { state }),
          ...q,
        };
      if (!human) {
        if (target?.closes === 'discarded')
          return { ...base, text: t('sheet.h.agentDiscarded', { state }), ...q };
        if (target?.turn === 'none')
          return { ...base, text: t('sheet.h.agentClosed', { state }), ...q };
        // An agent reviewing another's work approves it on or sends it back: it hands nothing off.
        if (!isClosed(from) && from.phase === 'review') {
          const back = backTo(from.step, to, board);
          return back
            ? { ...base, text: t('sheet.h.agentSentBack', { state: named(back, '') }), ...q }
            : { ...base, text: t('sheet.h.agentApproved', { state }), ...q };
        }
        if (target?.turn === 'human') {
          // "Again" only for a step it was handed in before: a later step is a first handoff.
          const again = handedTo.has(to);
          handedTo.add(to);
          const asked = legacyAsks(reason);
          const key = asked ? 'sheet.h.asked' : again ? 'sheet.h.handedAgain' : 'sheet.h.handed';
          return { ...base, text: t(key, { state }), ...q };
        }
        // Its own step handed off to another agent's review: a handoff, not a plain move.
        const next = positionOf(to);
        if (
          board &&
          !isClosed(from) &&
          from.phase === 'doing' &&
          !isClosed(next) &&
          next.phase !== 'doing'
        ) {
          const step = stepById(board, next.step)?.name ?? state;
          return { ...base, text: t('sheet.h.handedReview', { step }), ...q };
        }
        return { ...base, text: t('sheet.h.moved', { state }), ...q };
      }
      if (target?.closes === 'discarded')
        return { ...base, text: t('sheet.h.discarded', { state }), ...q };
      if (target?.turn === 'none') return { ...base, text: t('sheet.h.closed', { state }), ...q };
      // Your own step on a board, handed off: you did it, so it is no approval.
      if (
        board &&
        !isClosed(from) &&
        from.phase === 'doing' &&
        stepById(board, from.step)?.doer === 'you'
      )
        return { ...base, text: t('sheet.h.delivered', { state }), ...q };
      // Out of a board's review, the steps say whether it went back (your note is its why) or on
      // (your note goes with the approval); elsewhere, a reason marks a send-back.
      const reviewed = !isClosed(from) && from.phase === 'review' ? from.step : undefined;
      const back = reviewed ? backTo(reviewed, to, board) !== undefined : !!reason;
      if (target?.turn === 'agent' && back)
        return { ...base, text: t('sheet.h.sentBack', { state }), ...q };
      if (target?.turn === 'agent')
        return { ...base, text: t('sheet.h.approved', { state }), ...q };
      return { ...base, text: t('sheet.h.youMoved', { state }), ...q };
    }
    if (e.type === 'claimed') {
      const previous = e.data.previous;
      return {
        ...base,
        text:
          typeof previous === 'string'
            ? t('sheet.h.claimedOver', { previous })
            : t('sheet.h.claimed'),
      };
    }
    if (e.type === 'released') {
      if (isSetAside(e)) return { ...base, text: t('sheet.h.setAside') };
      if (human && e.data.cause === 'restart') return { ...base, text: t('sheet.h.restarted') };
      if (human && e.data.cause === 'reassign')
        return { ...base, text: t('sheet.h.reassigned', { agent: String(e.data.next) }) };
      return { ...base, text: t('sheet.h.released') };
    }
    // Back for the agents after a set-aside, and why. What it waited for closing is nobody's act
    // on this item: that line names nobody.
    if (e.type === SET_ASIDE_LIFTED) {
      const key = LIFT_WHY[String(e.data.cause)];
      const text = key ? t('sheet.h.unaside', { why: t(key) }) : t('sheet.h.unasideBare');
      if (e.data.cause !== 'parts' && e.data.cause !== 'blockers') return { ...base, text };
      const { profile: _byNobody, ...line } = base;
      return { ...line, dot: 'agent', who: '', text };
    }
    if (e.type === 'evidence_added') {
      const caption = typeof e.data.caption === 'string' ? { quote: e.data.caption } : {};
      return {
        ...base,
        text: t('sheet.h.attached', { file: String(e.data.filename) }),
        ...caption,
      };
    }
    if (e.type === 'evidence_detached')
      return { ...base, text: t('sheet.h.detached', { file: String(e.data.filename) }) };
    // A checklist point ticked with its proof (otea tick, attach --point): the point and what
    // shows it holds, a file, a log line or a passing test.
    if (e.type === POINT_PROVED) {
      const part = String(e.data.part ?? '');
      const file = String(e.data.file ?? '');
      const proof =
        e.data.kind === 'log'
          ? t('sheet.h.proofLog', { line: String(e.data.line ?? ''), file })
          : e.data.kind === 'test'
            ? t('sheet.h.proofTest', { test: String(e.data.test ?? ''), file })
            : file;
      return {
        ...base,
        text: t('sheet.h.proved', {
          point: fieldWords.value(part, String(e.data.point ?? '')),
          part: fieldWords.field(part),
          proof,
        }),
      };
    }
    // otea merged: that the Done item's branch is in, with its pull request when given.
    if (e.type === MERGED) {
      const branch = String(e.data.branch ?? '');
      const pr = typeof e.data.pr === 'string' && e.data.pr !== '' ? { quote: e.data.pr } : {};
      return {
        ...base,
        text: t(human ? 'sheet.h.mergedYou' : 'sheet.h.merged', { branch }),
        ...pr,
      };
    }
    return { ...base, text: describeEvent(e, fieldWords, { you: human }) };
  });
  return withProfileChanges(sorted, lines).reverse();
}

// Where a review's move sends the item back, when it does: a doing step no later than the one
// reviewed (on a board, by the steps' order; off one, only the same step).
function backTo(reviewed: string, to: string, board?: BoardDefinition): string | undefined {
  const target = positionOf(to);
  if (isClosed(target) || target.phase !== 'doing') return undefined;
  if (target.step === reviewed) return to;
  if (!board) return undefined;
  const order = board.steps.map(({ id }) => id);
  const at = order.indexOf(target.step);
  return at !== -1 && at < order.indexOf(reviewed) ? to : undefined;
}

// An agent that acts on the item with another profile than its last one here gets a line of its
// own just before that action: "Switched to sonnet · medium" (the harness too when that changed).
// Its first profile on the item says nothing; each agent is compared only with itself. The line's
// id sits between its event's and the one before, so it stays unique and in order.
function withProfileChanges(sorted: readonly ItemEvent[], lines: HistoryLine[]): HistoryLine[] {
  const last = new Map<string, AgentProfile>();
  return sorted.flatMap((e, i) => {
    const line = lines[i] as HistoryLine;
    if (e.actor.kind !== 'agent' || !e.profile) return [line];
    const before = last.get(e.actor.name);
    last.set(e.actor.name, e.profile);
    if (!before || sameProfile(before, e.profile)) return [line];
    const words = [profilePair(e.profile.model, e.profile.effort)];
    if (before.harness !== e.profile.harness && e.profile.harness) words.unshift(e.profile.harness);
    const change: HistoryLine = {
      id: e.id - 0.5,
      dot: 'agent',
      when: line.when,
      text: t('sheet.h.profileChanged', { profile: words.join(' · ') }),
      who: e.actor.name,
      profile: e.profile,
    };
    return [change, line];
  });
}

const sameProfile = (a: AgentProfile, b: AgentProfile) =>
  a.harness === b.harness && a.model === b.model && a.effort === b.effort;
