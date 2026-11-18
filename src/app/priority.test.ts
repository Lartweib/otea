import { describe, expect, it } from 'vitest';
import { sequenceIds } from '../core/board/ids.ts';
import type { BoardDefinition } from '../core/board/model.ts';
import { creatures } from '../core/board/testing.ts';
import { createBoard, publishBoard, saveDraft } from './boards.ts';
import type { Context } from './context.ts';
import { createItem, updateItem } from './items.ts';
import { claimItem } from './leases.ts';
import { nextFor } from './next.ts';
import { estimatesOf, estimatesOfItems, pinItems, priorityOf, setOrder } from './priority.ts';
import { memoryContext } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const kiln = { kind: 'agent' as const, name: 'kiln' };
const scout = { kind: 'agent' as const, name: 'scout' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 17, 9, 0, tick++)).toISOString();

// Criaturas with an effort (S, M, L) and a risk (a level) the analysis matrix crosses.
function weighed(): BoardDefinition {
  const def = creatures();
  def.parts.feffort = {
    id: 'feffort',
    name: 'Esfuerzo',
    kind: 'choice',
    hint: '',
    options: [
      { id: 'cs', name: 'S' },
      { id: 'cl', name: 'L' },
    ],
  };
  def.parts.frisk = { id: 'frisk', name: 'Riesgo', kind: 'level', hint: '', options: [] };
  def.anytime = [...def.anytime, 'feffort', 'frisk'];
  def.analysis = { effort: 'feffort', risk: 'frisk' };
  return def;
}

function board(ctx: Context, def: BoardDefinition = weighed()) {
  const record = createBoard(ctx, { name: def.name, lang: 'es' }, now, sequenceIds());
  saveDraft(ctx, record.id, { definition: def, baseVersion: null }, now);
  publishBoard(ctx, record.id, { moves: {}, by: you }, now);
  return def;
}

function creature(ctx: Context, title: string, fields: Record<string, string> = {}) {
  return createItem(
    ctx,
    {
      collection: 'Criaturas',
      title,
      fields: { fdesc: 'Lenta', ...fields },
      actor: you,
      channel: 'ui',
    },
    now,
  );
}

describe('the person orders the work', () => {
  it('fixes a board order from the matrix, replacing the earlier one', () => {
    const ctx = memoryContext();
    board(ctx);
    const [a, b, c] = ['A', 'B', 'C'].map((title) => creature(ctx, title));
    setOrder(ctx, { collection: 'Criaturas', ids: [c!.id, a!.id], actor: you }, now);
    expect(priorityOf(ctx.db).get(c!.id)).toEqual({ rank: 1 });
    expect(priorityOf(ctx.db).get(a!.id)).toEqual({ rank: 2 });
    setOrder(ctx, { collection: 'Criaturas', ids: [b!.id], actor: you }, now);
    expect(priorityOf(ctx.db).get(b!.id)).toEqual({ rank: 1 });
    expect(priorityOf(ctx.db).get(c!.id)).toEqual({});
  });

  it('pins items on top after the ones already pinned, and takes them down', () => {
    const ctx = memoryContext();
    board(ctx);
    const [a, b] = ['A', 'B'].map((title) => creature(ctx, title));
    pinItems(ctx, { ids: [b!.id], pinned: true, actor: you }, now);
    pinItems(ctx, { ids: [a!.id, b!.id], pinned: true, actor: you }, now);
    expect(priorityOf(ctx.db).get(b!.id)?.pin).toBe(1);
    expect(priorityOf(ctx.db).get(a!.id)?.pin).toBe(2);
    pinItems(ctx, { ids: [b!.id], pinned: false, actor: you }, now);
    expect(priorityOf(ctx.db).get(b!.id)?.pin).toBeUndefined();
  });

  it('refuses an agent ordering the work, and an item of another board', () => {
    const ctx = memoryContext();
    board(ctx);
    const a = creature(ctx, 'A');
    expect(() => setOrder(ctx, { collection: 'Criaturas', ids: [a.id], actor: kiln }, now)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(() => pinItems(ctx, { ids: [a.id], pinned: true, actor: kiln }, now)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(() => setOrder(ctx, { collection: 'Otra', ids: [a.id], actor: you }, now)).toThrow(
      expect.objectContaining({ code: 'invalid_id' }),
    );
  });
});

describe('otea next reads the order', () => {
  it('offers what it holds, then pinned items, then the fixed order, then the oldest', () => {
    const ctx = memoryContext();
    board(ctx);
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((title) => creature(ctx, title));
    expect(nextFor(ctx, 'kiln', {}, now).item).toBe(a!.id);
    setOrder(ctx, { collection: 'Criaturas', ids: [d!.id, c!.id], actor: you }, now);
    expect(nextFor(ctx, 'scout', {}, now).item).toBe(d!.id);
    pinItems(ctx, { ids: [b!.id], pinned: true, actor: you }, now);
    expect(nextFor(ctx, 'quill', {}, now).item).toBe(b!.id);
    claimItem(ctx, { id: c!.id, actor: kiln }, now);
    expect(nextFor(ctx, 'kiln', {}, now).item).toBe(c!.id);
  });

  it('says why it offers an item first: on top, or its place in the order', () => {
    const ctx = memoryContext();
    board(ctx);
    const [a, b, c] = ['A', 'B', 'C'].map((title) => creature(ctx, title));
    expect(nextFor(ctx, 'kiln', {}, now).text).not.toContain('the person fixed');
    setOrder(ctx, { collection: 'Criaturas', ids: [c!.id, a!.id], actor: you }, now);
    expect(nextFor(ctx, 'scout', {}, now).text).toContain(
      'It is number 1 in the order the person fixed on the Matrix.',
    );
    pinItems(ctx, { ids: [b!.id], pinned: true, actor: you }, now);
    expect(nextFor(ctx, 'quill', {}, now).text).toContain('The person put it on top (number 1).');
  });
});

describe('estimates', () => {
  it('says which role values an agent set, until the person sets them', () => {
    const ctx = memoryContext();
    const def = board(ctx);
    const a = creature(ctx, 'A', { frisk: 'high' });
    claimItem(ctx, { id: a.id, actor: scout }, now);
    const updated = updateItem(ctx, { id: a.id, fields: { feffort: 'cl' }, actor: scout }, now);
    expect(estimatesOf(ctx, updated, def)).toEqual({ feffort: 'scout' });
    const mine = updateItem(ctx, { id: a.id, fields: { feffort: 'cs' }, actor: you }, now);
    expect(estimatesOf(ctx, mine, def)).toEqual({});
  });
});

describe('the agent is asked to estimate', () => {
  it('names the empty role fields in the next text, and says nothing once they are set', () => {
    const ctx = memoryContext();
    board(ctx);
    const a = creature(ctx, 'A', { frisk: 'low' });
    const text = nextFor(ctx, 'kiln', {}, now).text;
    expect(text).toContain(`estimate them (otea update ${a.id} --field "Esfuerzo=…")`);
    updateItem(ctx, { id: a.id, fields: { feffort: 'cs' }, actor: you }, now);
    expect(nextFor(ctx, 'scout', {}, now).text).not.toContain('Estimate');
  });
});

describe('estimates of a whole list', () => {
  it('reads every item of a 500-item board in a fixed number of queries, within budget', () => {
    const ctx = memoryContext();
    const def = board(ctx);
    const items = Array.from({ length: 500 }, (_, n) => {
      const item = creature(ctx, `C${n}`);
      if (n % 2 === 1) return item;
      return updateItem(ctx, { id: item.id, fields: { feffort: 'cl' }, actor: scout }, now);
    });
    const prepare = ctx.db.prepare.bind(ctx.db);
    let queries = 0;
    ctx.db.prepare = ((sql: string) => {
      queries += 1;
      return prepare(sql);
    }) as typeof ctx.db.prepare;
    const started = performance.now();

    const estimates = estimatesOfItems(ctx, items, () => def);

    expect(performance.now() - started).toBeLessThan(1000);
    expect(queries).toBeLessThanOrEqual(2);
    expect(estimates.get(items[0]!.id)).toEqual({ feffort: 'scout' });
    expect(estimates.get(items[1]!.id)).toBeUndefined();
    expect([...estimates.keys()]).toHaveLength(250);
  });
});
