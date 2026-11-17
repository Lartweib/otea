import { describe, expect, it } from 'vitest';
import { sequenceIds } from '../core/board/ids.ts';
import { creatures } from '../core/board/testing.ts';
import { OteaError } from '../core/errors.ts';
import { insertEvidence } from '../store/queries.ts';
import { createBoard, publishBoard, saveDraft } from './boards.ts';
import type { Context } from './context.ts';
import { createItem } from './items.ts';
import { markOpened, openedFiles } from './opened.ts';
import { memoryContext } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const kiln = { kind: 'agent' as const, name: 'kiln' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 17, 9, 0, tick++)).toISOString();

function creature(ctx: Context, title = 'Tortuga') {
  if (!ctx.db.prepare('SELECT 1 FROM boards').get()) {
    const def = creatures();
    const record = createBoard(ctx, { name: def.name, lang: 'es' }, now, sequenceIds());
    saveDraft(ctx, record.id, { definition: def, baseVersion: null }, now);
    publishBoard(ctx, record.id, { moves: {}, by: you }, now);
  }
  return createItem(
    ctx,
    { collection: 'Criaturas', title, fields: { fdesc: 'Lenta' }, actor: you, channel: 'ui' },
    now,
  );
}

function attach(ctx: Context, id: string) {
  return insertEvidence(ctx.db, {
    itemId: id,
    role: 'after',
    module: 'eart',
    kind: 'image',
    filename: 'a.png',
    contentType: 'image/png',
    size: 1,
    sha256: 'a'.repeat(64),
    caption: null,
    createdAt: now(),
    actor: kiln,
    channel: 'cli',
  });
}

describe('the files the person opened in the reader', () => {
  it('keeps each file opened, on any device, once, in the order opened', () => {
    const ctx = memoryContext();
    const item = creature(ctx);
    const a = attach(ctx, item.id);
    const b = attach(ctx, item.id);
    expect(openedFiles(ctx, item.id)).toEqual([]);

    markOpened(ctx, { id: item.id, evidence: b, actor: you }, now);
    markOpened(ctx, { id: item.id, evidence: a, actor: you }, now);
    markOpened(ctx, { id: item.id, evidence: b, actor: you }, now);

    expect(openedFiles(ctx, item.id)).toEqual([b, a]);
  });

  it('refuses a file of another item, and an agent', () => {
    const ctx = memoryContext();
    const item = creature(ctx);
    const other = creature(ctx, 'Rana');
    const elsewhere = attach(ctx, other.id);
    const mine = attach(ctx, item.id);
    const refused = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        if (error instanceof OteaError) return error.code;
      }
      return 'not refused';
    };

    expect(refused(() => markOpened(ctx, { id: item.id, evidence: elsewhere, actor: you }))).toBe(
      'not_found',
    );
    expect(refused(() => markOpened(ctx, { id: item.id, evidence: mine, actor: kiln }))).toBe(
      'forbidden',
    );
    expect(openedFiles(ctx, item.id)).toEqual([]);
  });
});
