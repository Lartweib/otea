import { type Brief, DEFAULT_LIMITS, DEFAULT_SUCCESS, writeBrief } from '../core/brief.ts';
import { OteaError } from '../core/errors.ts';
import { timeText } from '../core/time.ts';
import { type Clock, listItems, systemClock } from './items.ts';
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
    items: chosen.map(({ id, title, collection, state, fields }) => ({
      id,
      title,
      collection,
      state,
      fields,
    })),
    relations: listRelations(project),
    isOpen: (id) => byId.get(id)?.closes === undefined,
    limits,
    success,
    writtenAt: timeText(now()),
  });
  return { ...brief, limits, success };
}
