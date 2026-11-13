import {
  type ItemTrail,
  modelPerformance,
  PERIOD_HINT,
  type PerformanceReport,
  parsePeriod,
} from '../core/board/performance.ts';
import { OteaError } from '../core/errors.ts';
import { selectEvents, selectItems } from '../store/queries.ts';
import { getCollection } from './collections.ts';
import type { Context } from './context.ts';
import { type Clock, systemClock } from './items.ts';
import { liveBoards } from './next.ts';

// How each model performs on the project's live boards (core/board/performance.ts), read by the
// server's /api/performance, the Rendimiento view and otea stats alike.

export type PerformanceInput = {
  // A board by its name, in any case; every live board when left out.
  board?: string | undefined;
  // A period back from now (7d, 30d, 12h) or all; all when left out.
  since?: string | undefined;
};

export type PerformanceView = PerformanceReport & {
  // The boards read, by name, and the time the period starts at (null for all of it).
  boards: string[];
  since: string | null;
};

export function performanceOf(
  ctx: Context,
  input: PerformanceInput,
  now: Clock = systemClock,
): PerformanceView {
  const period = parsePeriod(input.since ?? 'all', now());
  if (!period) throw new OteaError('invalid_fields', `--since takes ${PERIOD_HINT}`);
  const only = input.board === undefined ? undefined : getCollection(ctx.db, input.board).name;
  const boards = liveBoards(ctx).filter(({ collection }) => !only || collection === only);
  if (only && boards.length === 0) {
    throw new OteaError('not_found', `Board "${only}" is not published yet`);
  }
  const trails = boards.flatMap(({ collection, def }) =>
    selectItems(ctx.db, { collection }).map(
      (item): ItemTrail => ({
        item: item.id,
        board: collection,
        def,
        events: selectEvents(ctx.db, item.id),
        start: { initial: def.steps[0]?.id ?? item.state, createdAt: item.createdAt },
      }),
    ),
  );
  return {
    ...modelPerformance(trails, period),
    boards: boards.map(({ collection }) => collection),
    since: period.since ?? null,
  };
}
