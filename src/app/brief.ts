import type { BoardDefinition } from '../core/board/model.ts';
import { fieldsByName, stateName } from '../core/board/reading.ts';
import { type Brief, DEFAULT_LIMITS, DEFAULT_SUCCESS, writeBrief } from '../core/brief.ts';
import { OteaError } from '../core/errors.ts';
import { timeText } from '../core/time.ts';
import { type Clock, listItems, systemClock } from './items.ts';
import { liveBoardOf } from './next.ts';
import type { Project } from './project.ts';
import { listRelations } from './relations.ts';

// limits and success default to the brief's own when not given; an empty list leaves the section out.
export type BriefRequest = {
  ids: readonly string[];
  limits?: readonly string[];
  success?: readonly string[];
};

// The brief, with the limits and success lines it was written with (the defaults, when none were
// given), so an editor can start from them.
export type WrittenBrief = Brief & { limits: readonly string[]; success: readonly string[] };

// The fields by name, choices by name; the description keeps its key, as the brief leads with it.
function namedFields(
  def: BoardDefinition,
  fields: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { description, ...rest } = fields;
  return {
    ...(description === undefined ? {} : { description }),
    ...fieldsByName(def, rest),
  };
}

// A brief for the chosen items, read from the project as they stand now.
export function briefFor(
  project: Project,
  request: BriefRequest,
  now: Clock = systemClock,
): WrittenBrief {
  if (request.ids.length === 0) {
    throw new OteaError('invalid_id', 'A brief needs at least one item');
  }
  const items = listItems(project, {}, now);
  const byId = new Map(items.map((item) => [item.id, item]));
  const chosen = [...new Set(request.ids)].map((id) => {
    const item = byId.get(id);
    if (!item) throw new OteaError('not_found', `Item "${id}" not found`);
    return item;
  });
  const limits = request.limits ?? DEFAULT_LIMITS;
  const success = request.success ?? DEFAULT_SUCCESS;
  const brief = writeBrief({
    project: project.identity.name,
    items: chosen.map(({ id, title, collection, state, fields }) => {
      // On a board, its step and its fields by name, never the hidden ids under them.
      const def = liveBoardOf(project, collection)?.def;
      if (!def) return { id, title, collection, state, fields };
      return {
        id,
        title,
        collection,
        state: stateName(def, state),
        fields: namedFields(def, fields),
      };
    }),
    relations: listRelations(project),
    isOpen: (id) => byId.get(id)?.closes === undefined,
    limits,
    success,
    writtenAt: timeText(now()),
  });
  return { ...brief, limits, success };
}
