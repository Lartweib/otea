import type { Item } from '../app/items.ts';
import { liveBoardOf } from '../app/next.ts';
import type { Project } from '../app/project.ts';
import type { BoardDefinition, Part } from '../core/board/model.ts';
import { stateName, valueName } from '../core/board/reading.ts';
import { type EventRecord, findItem } from '../store/queries.ts';

// What --json and MCP give a program: the stored ids, the keys it can send back, with the names a
// person reads beside them. On a board the ids are hidden (todo, f3k9x2ab), so a program never has
// to translate one itself: a state gets its step's name, a field `{ id, name, value }` (a choice
// also its `label`), a move or an event its steps' names.

export type Board = BoardDefinition | undefined;

// The board an item is on, looked up once per collection.
export function boardsOf(project: Project): (collection: string) => Board {
  const known = new Map<string, Board>();
  return (collection) => {
    if (!known.has(collection)) known.set(collection, liveBoardOf(project, collection)?.def);
    return known.get(collection);
  };
}

// The collection of the item an event is about, looked up once per item ('' when it is gone).
export function itemCollections(project: Project): (id: string) => string {
  const known = new Map<string, string>();
  return (id) => {
    let collection = known.get(id);
    if (collection === undefined) {
      collection = findItem(project.db, id)?.collection ?? '';
      known.set(id, collection);
    }
    return collection;
  };
}

const state = (def: Board, id: unknown) =>
  def === undefined ? String(id) : stateName(def, String(id));
const partOf = (def: Board, id: unknown): Part | undefined => def?.parts[String(id)];
const partName = (def: Board, id: unknown) => partOf(def, id)?.name ?? String(id);
const OPTIONS: readonly string[] = ['choice', 'multi'];

type Field = { id: string; name: string; value: unknown; label?: string };

function fieldsData(def: Board, fields: Readonly<Record<string, unknown>>): Field[] {
  return Object.entries(fields).map(([id, value]) => {
    const part = partOf(def, id);
    const field: Field = { id, name: part?.name ?? id, value };
    if (part && OPTIONS.includes(part.kind) && value !== null && value !== undefined)
      field.label = valueName(part, value);
    return field;
  });
}

// An event as its reader says it, its ids replaced by names: what the text prints.
export function readableEvent(def: Board, event: EventRecord): EventRecord {
  if (def === undefined) return event;
  const { data } = event;
  const named = (fields: Record<string, unknown>) => ({ ...event, data: { ...data, ...fields } });
  if (event.type === 'created') return named({ state: state(def, data.state) });
  if (event.type === 'transitioned')
    return named({ from: state(def, data.from), to: state(def, data.to) });
  if (event.type === 'evidence_added' && typeof data.module === 'string')
    return named({ module: partName(def, data.module) });
  if (event.type === 'updated' && data.changes && typeof data.changes === 'object') {
    const changes = Object.fromEntries(
      Object.entries(data.changes as Record<string, { from?: unknown; to?: unknown }>).map(
        ([key, change]) => {
          const part = partOf(def, key);
          if (!part) return [key, change];
          const say = (value: unknown) =>
            value === undefined || value === null ? value : valueName(part, value);
          return [part.name, { from: say(change.from), to: say(change.to) }];
        },
      ),
    );
    return named({ changes });
  }
  return event;
}

// An event with its steps, its field and its evidence module named beside their ids.
export function eventData(def: Board, event: EventRecord): EventRecord {
  const { data } = event;
  const named = (fields: Record<string, unknown>) => ({ ...event, data: { ...data, ...fields } });
  if (event.type === 'created') return named({ stateName: state(def, data.state) });
  if (event.type === 'transitioned')
    return named({ fromName: state(def, data.from), toName: state(def, data.to) });
  if (event.type === 'evidence_added' && typeof data.module === 'string')
    return named({ moduleName: partName(def, data.module) });
  if (event.type === 'updated' && data.changes && typeof data.changes === 'object') {
    const changes = Object.fromEntries(
      Object.entries(data.changes as Record<string, object>).map(([id, change]) => [
        id,
        { name: partName(def, id), ...change },
      ]),
    );
    return named({ changes });
  }
  return event;
}

type Moves = readonly { to: string }[];

// An item, a list row or the whole of show, with its names beside its ids.
export function itemData(
  project: Project,
  item: Item,
  boardOf = boardsOf(project),
): Record<string, unknown> {
  const def = boardOf(item.collection);
  const view = item as Partial<{
    transitions: Moves;
    relayable: Moves;
    missing: readonly string[];
    evidence: readonly { module: string | null }[];
    relations: readonly { collection?: unknown; state?: unknown }[];
    events: readonly EventRecord[];
  }>;
  const moves = (list: Moves) => list.map((move) => ({ ...move, toName: state(def, move.to) }));
  // stateName right after state, where a reader looks for it.
  const out: Record<string, unknown> = Object.fromEntries(
    Object.entries(item).flatMap(([key, value]) =>
      key === 'state'
        ? [
            [key, value],
            ['stateName', state(def, item.state)],
          ]
        : [[key, value]],
    ),
  );
  out.fields = fieldsData(def, item.fields);
  if (view.transitions) out.transitions = moves(view.transitions);
  if (view.relayable) out.relayable = moves(view.relayable);
  if (view.missing) out.missing = view.missing.map((id) => ({ id, name: partName(def, id) }));
  if (view.evidence)
    out.evidence = view.evidence.map((entry) =>
      entry.module === null ? entry : { ...entry, moduleName: partName(def, entry.module) },
    );
  if (view.relations)
    out.relations = view.relations.map((related) => {
      // A list's relations are bare refs (no collection or state): nothing to name.
      const { collection, state: id } = related;
      if (typeof collection !== 'string' || typeof id !== 'string') return related;
      return { ...related, stateName: state(boardOf(collection), id) };
    });
  if (view.events) out.events = view.events.map((event) => eventData(def, event));
  return out;
}
