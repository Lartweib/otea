import type { BoardDefinition } from '../core/board/model.ts';
import { TITLE } from '../core/board/model.ts';
import { findState, readFieldInput, stateName, stateNames } from '../core/board/reading.ts';
import { OteaError } from '../core/errors.ts';
import { type ItemRecord, listCollections } from '../store/queries.ts';
import { collectionNamed } from './collections.ts';
import type { Context } from './context.ts';
import { liveBoardOf } from './next.ts';

// What `otea list --state/--field` keeps, named as a reader names it (`--state Refinar`,
// `--field Gravedad=Alta`, in any case) or by the stored ids, as create and update take them.
export type ReaderFilter = {
  collection?: string;
  state?: string;
  fields?: Readonly<Record<string, string>>;
};

type Kept = Pick<ItemRecord, 'collection' | 'state' | 'title' | 'fields'>;
type Test = (item: Kept) => boolean;

// The test of an item on one board; refused, naming what the board has, when the board has no
// such step or field, or no such choice.
function boardTest(def: BoardDefinition | undefined, { state, fields }: ReaderFilter): Test {
  let named: string | undefined;
  if (state !== undefined && def) {
    const found = findState(def, state);
    if (found === undefined)
      throw new OteaError(
        'not_found',
        `${def.name} has no step "${state}"; its steps are ${stateNames(def).join(', ')}`,
      );
    named = stateName(def, found);
  }
  const values = fields && def ? readFieldInput(def, fields) : (fields ?? {});
  // By its step's name, so a discard with a motive is Dropped as well.
  const atState = (item: Kept) =>
    state === undefined || (def ? stateName(def, item.state) === named : item.state === state);
  return (item) =>
    atState(item) &&
    Object.entries(values).every(
      ([key, value]) => (key === TITLE ? item.title : item.fields[key]) === value,
    );
}

// The items a reader's filter keeps, each read against its own board: without a collection, the
// boards that have no such step or field keep none of theirs. Refused when none has it.
export function readerFilter(ctx: Context, filter: ReaderFilter): Test {
  if (filter.state === undefined && filter.fields === undefined) return () => true;
  const { collection } = filter;
  const names =
    collection === undefined
      ? listCollections(ctx.db).map(({ name }) => name)
      : [collectionNamed(ctx.db, collection)];
  const tests = new Map<string, Test>();
  const refusals: unknown[] = [];
  for (const name of names) {
    try {
      tests.set(name, boardTest(liveBoardOf(ctx, name)?.def, filter));
    } catch (error) {
      if (!(error instanceof OteaError)) throw error;
      refusals.push(error);
    }
  }
  const [first] = refusals;
  if (tests.size === 0 && first !== undefined) throw noBoardHas(ctx, names, filter) ?? first;
  return (item) => tests.get(item.collection)?.(item) ?? false;
}

// Across boards, a step none of them has, with the steps they have.
function noBoardHas(ctx: Context, names: string[], { state }: ReaderFilter): OteaError | undefined {
  const defs = names.flatMap((name) => liveBoardOf(ctx, name)?.def ?? []);
  if (state === undefined || defs.length < 2) return undefined;
  if (defs.some((def) => findState(def, state) !== undefined)) return undefined;
  const steps = [...new Set(defs.flatMap(stateNames))].join(', ');
  return new OteaError('not_found', `No board has a step "${state}"; the steps are ${steps}`);
}
