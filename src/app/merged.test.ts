import { describe, expect, it } from 'vitest';
import { cambios, tareasDeRepo } from '../core/board/testing.ts';
import { insertEvidence, updateItemState } from '../store/queries.ts';
import { createItem, requireItem } from './items.ts';
import { markMerged, mergedOf } from './merged.ts';
import { approveItem, boardBlockOf, handoffItem, itemNextText } from './next.ts';
import { memoryContext, publishAs } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const quill = { kind: 'agent' as const, name: 'quill' };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 16, 9, 0, tick++)).toISOString();

function repoTask() {
  const ctx = memoryContext();
  publishAs(ctx, tareasDeRepo(), 'brt', now);
  publishAs(ctx, cambios(), 'bcam', now);
  const parent = createItem(
    ctx,
    { collection: 'Cambios', title: 'Nube', fields: { fwhat: 'x' }, actor: you },
    now,
  );
  const task = createItem(
    ctx,
    {
      collection: 'Tareas de repo',
      title: 'API',
      fields: { frepo: 'api', fbranch: 'feat/x' },
      parent: parent.id,
      actor: you,
    },
    now,
  );
  return { ctx, id: task.id };
}

describe('marking a Done item merged', () => {
  it('records that its branch was merged, with the PR and commit, once it is Done', () => {
    const { ctx, id } = repoTask();
    expect(() => markMerged(ctx, { id, actor: quill, channel: 'cli' }, now)).toThrowError(
      `${id} is not Done yet: mark it merged once it is Done and its branch is in`,
    );
    updateItemState(ctx.db, id, 'done', now());

    const merged = markMerged(
      ctx,
      { id, actor: quill, channel: 'cli', pr: 'https://github.com/o/r/pull/7', commit: 'abc1234' },
      now,
    );
    expect(merged).toMatchObject({
      by: 'quill',
      pr: 'https://github.com/o/r/pull/7',
      commit: 'abc1234',
      branch: 'feat/x',
    });
    expect(mergedOf(ctx, id)).toEqual(merged);
    expect(boardBlockOf(ctx, requireItem(ctx.db, id))?.merged).toEqual(merged);
    expect(itemNextText(ctx, requireItem(ctx.db, id), 'quill', now)).toContain(
      'Its branch feat/x was merged (abc1234).',
    );
    expect(() => markMerged(ctx, { id, actor: quill, channel: 'cli' }, now)).toThrowError(
      `${id} is marked merged already`,
    );
  });

  it('tells the agent how to record the merge while the branch waits', () => {
    const { ctx, id } = repoTask();
    updateItemState(ctx.db, id, 'done', now());
    expect(itemNextText(ctx, requireItem(ctx.db, id), 'quill', now)).toContain(
      `Its branch feat/x may be merged now; once it is, otea merged ${id} --pr <url>.`,
    );
  });

  it('says who did a closed item and who approved it', () => {
    const { ctx, id } = repoTask();
    updateItemState(ctx.db, id, 'simpl', now());
    insertEvidence(ctx.db, {
      itemId: id,
      role: 'after',
      module: 'ecode',
      kind: 'diff',
      filename: 'a.diff',
      contentType: 'text/x-diff',
      size: 1,
      sha256: 'a'.repeat(64),
      caption: null,
      createdAt: now(),
      actor: quill,
      channel: 'cli',
    });
    handoffItem(ctx, { id, actor: quill, channel: 'cli' }, now);
    approveItem(ctx, { id, actor: you, channel: 'ui' }, now);

    expect(boardBlockOf(ctx, requireItem(ctx.db, id))?.closedBy).toEqual({
      doer: 'quill',
      reviewer: you,
    });
  });
});
