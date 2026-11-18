import type { DatabaseSync } from 'node:sqlite';
import type { Channel } from '../core/authority.ts';
import { choiceOf, OPTION_CHOSEN, pickableOptions } from '../core/board/choices.ts';
import { isClosed, positionOf, stateOf, waysOf } from '../core/board/engine.ts';
import { type BoardDefinition, DONE, stepById } from '../core/board/model.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import { appendEvent, type ItemRecord, selectEvents } from '../store/queries.ts';

// The person's pick of one of a decision's options (core/board/choices.ts), made with the approval
// out of a review: kept as an option_chosen event before the move, so the step it goes on to reads
// it. Picking the option already chosen, with no new comment, records nothing.

export type ChoiceInput = { option: string; comment?: string };

type Why = 'not_person' | 'not_review' | 'not_forward' | 'no_options' | 'unknown_option';

function refuse(id: string, why: Why, message: string): never {
  throw new OteaError(why === 'not_person' ? 'forbidden' : 'invalid_transition', message, {
    kind: 'choice',
    item: id,
    why,
  });
}

export function recordChoice(
  db: DatabaseSync,
  def: BoardDefinition,
  item: ItemRecord,
  move: { to: string; actor: Actor; channel: Channel; at: string },
  choice: ChoiceInput,
): void {
  const { id } = item;
  if (move.actor.kind !== 'human')
    refuse(id, 'not_person', `Not chosen on ${id}: only the person picks an option`);
  const position = positionOf(item.state);
  if (isClosed(position) || position.phase !== 'review')
    refuse(id, 'not_review', `Not chosen on ${id}: an option is picked when approving a review`);
  const forward = waysOf(def, position.step).map((way) =>
    stateOf(way === DONE ? { closed: DONE } : { step: way, phase: 'doing' }),
  );
  if (!forward.includes(move.to))
    refuse(
      id,
      'not_forward',
      `Not chosen on ${id}: an option goes with an approval, not a send-back`,
    );
  const found = pickableOptions(def, item.fields);
  if (!found) refuse(id, 'no_options', `Not chosen on ${id}: it holds no options to pick from`);
  const letter = choice.option.trim().toUpperCase();
  const option = found.options.find((each) => each.letter === letter);
  if (!option) {
    const letters = found.options.map((each) => each.letter).join(', ');
    refuse(id, 'unknown_option', `Not chosen on ${id}: its options are ${letters}`);
  }
  const comment = choice.comment?.trim() ?? '';
  const last = choiceOf(selectEvents(db, id));
  if (last && last.option === option.letter && !comment) return;
  appendEvent(db, {
    itemId: id,
    type: OPTION_CHOSEN,
    actor: move.actor,
    at: move.at,
    data: {
      option: option.letter,
      name: option.name,
      ...(comment ? { comment } : {}),
      part: found.part,
      step: position.step,
      stepName: stepById(def, position.step)?.name ?? position.step,
      channel: move.channel,
    },
  });
}
