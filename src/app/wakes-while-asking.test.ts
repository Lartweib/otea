import { describe, expect, it } from 'vitest';
import { sequenceIds } from '../core/board/ids.ts';
import { creatures } from '../core/board/testing.ts';
import { insertEvidence } from '../store/queries.ts';
import { createBoard, publishBoard, saveDraft } from './boards.ts';
import type { Context } from './context.ts';
import { createItem } from './items.ts';
import { claimItem, releaseItem } from './leases.ts';
import { approveItem, handoffItem, offerableTo } from './next.ts';
import { leaveNote, replyNote } from './notes.ts';
import { askQuestion, wakesWhileAsking } from './questions.ts';
import { linkItems } from './relations.ts';
import { resumeItem } from './restart.ts';
import { memoryContext } from './testing.ts';

// P7-R3-9: while its own question waited for the person, an agent held four parents whose parts
// had closed, for about 15 minutes, and the desk said it was doing them; Retomar and a note on
// another item did not wake it either. While an agent's question waits, its wait still wakes for
// an item it holds that became its work again, and for the person's note or Retomar on agent work.

const you = { kind: 'human' as const, name: 'fede' };
const kiln = { kind: 'agent' as const, name: 'kiln' };
const quill = { kind: 'agent' as const, name: 'quill' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 20, 9, 0, tick++)).toISOString();

// Criaturas whose Animar waits for the item's parts, on the same board.
function board(ctx: Context): void {
  const def = creatures();
  def.steps = def.steps.map((s) => (s.id === 'sanimate' ? { ...s, waits: ['parts' as const] } : s));
  def.split = { board: 'same', always: false };
  const record = createBoard(ctx, { name: def.name, lang: 'es' }, now, sequenceIds());
  saveDraft(ctx, record.id, { definition: def, baseVersion: null }, now);
  publishBoard(ctx, record.id, { moves: {}, by: you }, now);
}

function creature(ctx: Context, title: string) {
  return createItem(
    ctx,
    { collection: 'Criaturas', title, fields: { fdesc: 'Lenta' }, actor: you, channel: 'ui' },
    now,
  );
}

function attachArt(ctx: Context, id: string) {
  insertEvidence(ctx.db, {
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
    actor: quill,
    channel: 'cli',
  });
}

// An item standing in Animar's doing, the agents' work.
function animating(ctx: Context, title: string) {
  const item = creature(ctx, title);
  attachArt(ctx, item.id);
  handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);
  approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
  return item;
}

// kiln asks the person about an item of its own, so its wait waits for the answer.
function asks(ctx: Context) {
  const asked = animating(ctx, 'Pregunta');
  claimItem(ctx, { id: asked.id, actor: kiln }, now);
  askQuestion(ctx, { id: asked.id, text: '¿Con musgo?', actor: kiln, channel: 'cli' }, now);
  return asked;
}

// Whether kiln's wait, while its question waits, wakes for the item.
const wakes = (ctx: Context, item: { id: string; createdAt: string; collection: string }) =>
  (wakesWhileAsking(ctx, 'kiln')?.(item) ?? false) && offerableTo(ctx, 'kiln', now)(item);

describe('a wait while the agent’s own question waits for the person', () => {
  it('wakes for an item it holds once its parts close after it asked', () => {
    const ctx = memoryContext();
    board(ctx);
    const parent = animating(ctx, 'Padre');
    claimItem(ctx, { id: parent.id, actor: kiln }, now);
    const part = creature(ctx, 'Parte');
    linkItems(
      ctx,
      { id: part.id, kind: 'parent', other: parent.id, actor: you, channel: 'ui' },
      now,
    );
    asks(ctx);
    expect(wakes(ctx, parent)).toBe(false);

    attachArt(ctx, part.id);
    handoffItem(ctx, { id: part.id, actor: quill, channel: 'cli' }, now);
    approveItem(ctx, { id: part.id, actor: you, channel: 'ui', way: 'Done' }, now);

    expect(wakes(ctx, parent)).toBe(true);
  });

  it('still does not wake for work that was already free when it asked', () => {
    const ctx = memoryContext();
    board(ctx);
    const free = animating(ctx, 'Libre');
    const held = animating(ctx, 'Suya');
    claimItem(ctx, { id: held.id, actor: kiln }, now);
    asks(ctx);

    expect(wakes(ctx, free)).toBe(false);
    expect(wakes(ctx, held)).toBe(false);
  });

  it('wakes for the person’s note on agent work, until it acts on that item', () => {
    const ctx = memoryContext();
    board(ctx);
    const free = animating(ctx, 'Libre');
    asks(ctx);

    leaveNote(ctx, { id: free.id, text: 'Hazla ya', actor: you, channel: 'ui' }, now);
    expect(wakes(ctx, free)).toBe(true);

    replyNote(ctx, { id: free.id, note: 1, text: 'Voy', actor: kiln, channel: 'cli' }, now);
    expect(wakes(ctx, free)).toBe(false);
  });

  it('wakes for Retomar on an item set aside before it asked', () => {
    const ctx = memoryContext();
    board(ctx);
    const aside = animating(ctx, 'Apartada');
    claimItem(ctx, { id: aside.id, actor: kiln }, now);
    releaseItem(ctx, { id: aside.id, actor: kiln, later: true }, now);
    asks(ctx);
    expect(wakes(ctx, aside)).toBe(false);

    resumeItem(ctx, { id: aside.id, actor: you, channel: 'ui' }, now);

    expect(wakes(ctx, aside)).toBe(true);
  });
});
