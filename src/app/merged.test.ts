import { describe, expect, it } from 'vitest';
import { cambios, step, tareasDeRepo } from '../core/board/testing.ts';
import { insertEvidence, selectEvents, updateItemState } from '../store/queries.ts';
import { checkGate } from './gates.ts';
import { createItem, requireItem } from './items.ts';
import { markMerged, mergedOf, reopenItem } from './merged.ts';
import {
  approveItem,
  boardBlockOf,
  handoffItem,
  itemNextText,
  nextFor,
  rowFactsOf,
} from './next.ts';
import { declareProfile } from './profile.ts';
import { linkItems } from './relations.ts';
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
  return { ctx, id: task.id, parent: parent.id };
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

  it('refuses a merge the forge says has not happened, or of another branch', () => {
    const { ctx, id } = repoTask();
    updateItemState(ctx.db, id, 'done', now());
    const pr = 'https://github.com/o/r/pull/7';
    const mark = (forge: { state: string; head: string }) =>
      markMerged(ctx, { id, actor: quill, channel: 'cli', pr, forge }, now);

    expect(() => mark({ state: 'OPEN', head: 'feat/x' })).toThrow(
      `Not marked ${id} merged: its PR ${pr} is open, not merged. Merge it first, then otea merged ${id} --pr ${pr}.`,
    );
    expect(() => mark({ state: 'MERGED', head: 'feat/y' })).toThrow(
      `Not marked ${id} merged: its PR ${pr} merges feat/y, not ${id}'s branch feat/x.`,
    );
    expect(mergedOf(ctx, id)).toBeUndefined();
    expect(mark({ state: 'MERGED', head: 'feat/x' })).toMatchObject({ pr, branch: 'feat/x' });
  });

  it('gives a closed item’s row its doer and whether its branch was merged', () => {
    const { ctx, id } = repoTask();
    expect(rowFactsOf(ctx, requireItem(ctx.db, id))).toEqual({});
    updateItemState(ctx.db, id, 'done', now());
    expect(rowFactsOf(ctx, requireItem(ctx.db, id))).toEqual({ merge: 'waiting' });
    markMerged(ctx, { id, actor: quill, channel: 'cli' }, now);
    expect(rowFactsOf(ctx, requireItem(ctx.db, id))).toEqual({ merge: 'merged' });
  });

  it('tells the agent how to record the merge while the branch waits', () => {
    const { ctx, id } = repoTask();
    updateItemState(ctx.db, id, 'done', now());
    expect(itemNextText(ctx, requireItem(ctx.db, id), 'quill', now)).toContain(
      `Its branch feat/x may be merged now; once it is, otea merged ${id} --pr <url>.`,
    );
  });

  it('on a board with a land step, names the doer, not the lander, and says it was merged there', () => {
    const ctx = memoryContext();
    const def = tareasDeRepo();
    def.steps.push(step('sland', 'Integrar', { reviewer: 'none' }));
    publishAs(ctx, def, 'brt', now);
    publishAs(ctx, cambios(), 'bcam', now);
    const parent = createItem(
      ctx,
      { collection: 'Cambios', title: 'Nube', fields: { fwhat: 'x' }, actor: you },
      now,
    );
    const { id } = createItem(
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
    expect(requireItem(ctx.db, id).state).toBe('sland');
    const lander = { kind: 'agent' as const, name: 'lander' };
    handoffItem(ctx, { id, actor: lander, channel: 'cli' }, now);

    expect(boardBlockOf(ctx, requireItem(ctx.db, id))?.closedBy).toEqual({
      doer: 'quill',
      reviewer: you,
    });
    // Its row names the doer, not the lander, and says nothing of a merge it had in Integrar.
    expect(rowFactsOf(ctx, requireItem(ctx.db, id))).toEqual({ doer: 'quill' });
    const text = itemNextText(ctx, requireItem(ctx.db, id), 'quill', now);
    expect(text).toContain('Its branch feat/x was merged in Integrar.');
    expect(text).not.toContain('may be merged now');
  });

  // P3C-R2-5: «lo hizo» showed the profile the agent had last, not the one it delivered under.
  it('names the profile the doer handed the work off under, not the one it has since', () => {
    const ctx = memoryContext();
    const def = tareasDeRepo();
    def.steps.push(step('sland', 'Integrar', { reviewer: 'none' }));
    publishAs(ctx, def, 'brt', now);
    publishAs(ctx, cambios(), 'bcam', now);
    const parent = createItem(
      ctx,
      { collection: 'Cambios', title: 'Nube', fields: { fwhat: 'x' }, actor: you },
      now,
    );
    const { id } = createItem(
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
    const as = (model: string) =>
      declareProfile(
        ctx.db,
        { agent: 'quill', channel: 'cli', given: 'claude-code', model, effort: 'high' },
        now,
      );
    as('claude-haiku-4-5');
    handoffItem(ctx, { id, actor: quill, channel: 'cli' }, now);
    approveItem(ctx, { id, actor: you, channel: 'ui' }, now);
    as('claude-sonnet-4-5');
    handoffItem(ctx, { id, actor: quill, channel: 'cli' }, now);

    expect(rowFactsOf(ctx, requireItem(ctx.db, id))).toEqual({
      doer: 'quill',
      doerProfile: {
        harness: 'claude-code',
        model: 'claude-haiku-4-5',
        effort: 'high',
        family: 'haiku',
      },
    });
  });

  it('tells the lander it merges in the land step, with no review to freeze the branch', () => {
    const ctx = memoryContext();
    const def = tareasDeRepo();
    def.steps.push(step('sland', 'Integrar', { reviewer: 'none' }));
    const guard = def.parts.fbranch?.guard;
    if (guard) guard.push = ['simpl', 'sland'];
    publishAs(ctx, def, 'brt', now);
    publishAs(ctx, cambios(), 'bcam', now);
    const parent = createItem(
      ctx,
      { collection: 'Cambios', title: 'Nube', fields: { fwhat: 'x' }, actor: you },
      now,
    );
    const { id } = createItem(
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
    updateItemState(ctx.db, id, 'sland', now());

    const text = itemNextText(ctx, requireItem(ctx.db, id), 'quill', now);
    expect(text).toContain(
      '  feat/x in api: you may push while you do Integrar; it is merged here, in Integrar.',
    );
    expect(text).not.toContain('While it is reviewed');
  });
});

describe('merge order', () => {
  // ENT-1 blocks ENT-2: ENT-2's merge is approved only once ENT-1's branch is in, not merely Done,
  // or ENT-2 could merge first.
  it('refuses to approve an item while what blocks it is Done but not merged', () => {
    const ctx = memoryContext();
    const def = tareasDeRepo();
    const impl = def.steps.find(({ id }) => id === 'simpl');
    if (impl) impl.waits = ['blockers'];
    publishAs(ctx, def, 'brt', now);
    publishAs(ctx, cambios(), 'bcam', now);
    const parent = createItem(
      ctx,
      { collection: 'Cambios', title: 'Nube', fields: { fwhat: 'x' }, actor: you },
      now,
    );
    const task = (title: string, branch: string) =>
      createItem(
        ctx,
        {
          collection: 'Tareas de repo',
          title,
          fields: { frepo: 'api', fbranch: branch },
          parent: parent.id,
          actor: you,
        },
        now,
      ).id;
    const first = task('API', 'feat/a');
    const second = task('Web', 'feat/b');
    linkItems(ctx, { kind: 'blocks', id: first, other: second, actor: you, channel: 'ui' }, now);
    updateItemState(ctx.db, first, 'done', now());
    updateItemState(ctx.db, second, 'simpl__review', now());

    expect(() => approveItem(ctx, { id: second, actor: you, channel: 'ui' }, now)).toThrow(
      `Not approved ${second}: ${first} (Tareas de repo, Done, not merged yet) blocks it and is not merged yet.`,
    );
    markMerged(ctx, { id: first, actor: quill, channel: 'cli' }, now);
    expect(approveItem(ctx, { id: second, actor: you, channel: 'ui' }, now).item.state).toBe(
      'done',
    );
  });
});

describe('reopening a Done item whose branch is not merged', () => {
  // ENT-1 merged first; ENT-2's PR now conflicts with main. The agent must fix its branch, which
  // stays frozen while ENT-2 is Done: reopening sends it back to the step that pushes the branch,
  // and through review again.
  it('takes it back to the step that pushes its branch, with why, for another round', () => {
    const { ctx, id } = repoTask();
    updateItemState(ctx.db, id, 'simpl', now());
    updateItemState(ctx.db, id, 'done', now());
    expect(checkGate(ctx, 'push', { branch: 'feat/x', repo: 'api' }).items[0]?.text).toBe(
      `push refused: ${id} is Done; nothing is pushed to a closed item's branch. If its PR cannot merge as it is (a conflict), reopen it: otea reopen ${id} --reason "…" takes it back to Implementar, and through review again.`,
    );

    const reopened = reopenItem(
      ctx,
      { id, actor: quill, channel: 'cli', reason: 'the PR conflicts with main after API-1' },
      now,
    );
    expect(reopened.item.state).toBe('simpl');
    expect(reopened.text).toBe(
      `Reopened ${id}: it is in Implementar again. Fix its branch there and hand it off: it goes through review again before it is Done.`,
    );
    expect(checkGate(ctx, 'push', { branch: 'feat/x', repo: 'api' }).allowed).toBe(true);
    const text = itemNextText(ctx, requireItem(ctx.db, id), 'quill', now);
    expect(text).toContain('\nReopened: "the PR conflicts with main after API-1"\n  by quill, ');
    expect(text).toContain(', after it was Done\n');
    expect(boardBlockOf(ctx, requireItem(ctx.db, id))?.sentBack).toMatchObject({
      note: 'the PR conflicts with main after API-1',
      reopened: true,
    });
    const moved = selectEvents(ctx.db, id).findLast(({ type }) => type === 'transitioned');
    expect(moved?.data).toMatchObject({
      from: 'done',
      to: 'simpl',
      reason: 'the PR conflicts with main after API-1',
    });
  });

  it('refuses without a reason, off Done, and once the branch is merged', () => {
    const { ctx, id } = repoTask();
    updateItemState(ctx.db, id, 'simpl', now());
    expect(() => reopenItem(ctx, { id, actor: quill, channel: 'cli', reason: 'x' }, now)).toThrow(
      `${id} is not Done: only a Done item whose branch is not merged yet reopens`,
    );
    updateItemState(ctx.db, id, 'done', now());
    expect(() => reopenItem(ctx, { id, actor: quill, channel: 'cli', reason: ' ' }, now)).toThrow(
      `Reopening ${id} needs a reason: why its branch must change`,
    );
    markMerged(ctx, { id, actor: quill, channel: 'cli' }, now);
    expect(() => reopenItem(ctx, { id, actor: quill, channel: 'cli', reason: 'x' }, now)).toThrow(
      `${id} is merged already: its branch is in, so a further change is new work, not ${id}`,
    );
  });

  it('refuses an item an agent already merged in its land step, and never offers it', () => {
    const ctx = memoryContext();
    const def = tareasDeRepo();
    def.steps.push(step('sland', 'Integrar', { reviewer: 'none' }));
    publishAs(ctx, def, 'brt', now);
    publishAs(ctx, cambios(), 'bcam', now);
    const parent = createItem(
      ctx,
      { collection: 'Cambios', title: 'Nube', fields: { fwhat: 'x' }, actor: you },
      now,
    );
    const { id } = createItem(
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
    updateItemState(ctx.db, id, 'sland', now());
    handoffItem(ctx, { id, actor: quill, channel: 'cli' }, now);
    expect(requireItem(ctx.db, id).state).toBe('done');

    expect(() => reopenItem(ctx, { id, actor: quill, channel: 'cli', reason: 'x' }, now)).toThrow(
      `${id} was merged in Integrar already: its branch is in, so a further change is new work, not ${id}`,
    );
    expect(requireItem(ctx.db, id).state).toBe('done');
    expect(checkGate(ctx, 'push', { branch: 'feat/x', repo: 'api' }).items[0]?.text).toBe(
      `push refused: ${id} is Done; nothing is pushed to a closed item's branch.`,
    );
    expect(itemNextText(ctx, requireItem(ctx.db, id), 'quill', now)).not.toContain('otea reopen');
  });

  it('names the Done items that wait to be merged when next has nothing to take', () => {
    const { ctx, id } = repoTask();
    updateItemState(ctx.db, id, 'done', now());
    const idle = nextFor(ctx, 'quill', { collection: 'Tareas de repo' }, now);
    expect(idle.item).toBeNull();
    expect(idle.text).toContain(
      `Waiting to be merged\n  ${id} (feat/x) is Done: merge its PR, then otea merged ${id} --pr <url>.`,
    );
    markMerged(ctx, { id, actor: quill, channel: 'cli' }, now);
    expect(nextFor(ctx, 'quill', { collection: 'Tareas de repo' }, now).text).not.toContain(
      'Waiting to be merged',
    );
  });

  it('offers the merges before the step of the parent that waits for them', () => {
    const { ctx, id, parent } = repoTask();
    updateItemState(ctx.db, id, 'done', now());
    updateItemState(ctx.db, parent, 'sexec', now());

    const first = nextFor(ctx, 'quill', {}, now);
    expect(first.item).toBeNull();
    expect(first.text).toBe(
      [
        `Merge first: ${parent} waits for its parts to be merged.`,
        '',
        'Waiting to be merged',
        `  ${id} (feat/x) is Done: merge its PR, then otea merged ${id} --pr <url>.`,
        '',
        'Then run otea next again.',
      ].join('\n'),
    );
    markMerged(ctx, { id, actor: quill, channel: 'cli' }, now);
    expect(nextFor(ctx, 'quill', {}, now).item).toBe(parent);
  });

  it('holds the parent back until its parts are merged, not only Done', () => {
    const { ctx, id, parent } = repoTask();
    updateItemState(ctx.db, id, 'done', now());
    updateItemState(ctx.db, parent, 'sexec', now());

    expect(() =>
      handoffItem(ctx, { id: parent, actor: quill, channel: 'cli', note: 'todo junto' }, now),
    ).toThrow(`Not handed off ${parent}: its part ${id} (Done, not merged yet) is not merged yet.`);
    markMerged(ctx, { id, actor: quill, channel: 'cli' }, now);
    expect(
      handoffItem(ctx, { id: parent, actor: quill, channel: 'cli', note: 'todo junto' }, now).item
        .state,
    ).toBe('sexec__review');
  });

  it('keeps the list of merges under the item it offers', () => {
    const { ctx, id, parent } = repoTask();
    updateItemState(ctx.db, id, 'done', now());
    const other = createItem(
      ctx,
      {
        collection: 'Tareas de repo',
        title: 'Web',
        fields: { frepo: 'api', fbranch: 'feat/web' },
        parent,
        actor: you,
      },
      now,
    );
    updateItemState(ctx.db, other.id, 'simpl', now());

    const offered = nextFor(ctx, 'quill', {}, now);
    expect(offered.item).toBe(other.id);
    expect(offered.text).toContain(
      `\n\nWaiting to be merged\n  ${id} (feat/x) is Done: merge its PR, then otea merged ${id} --pr <url>.`,
    );
  });

  it('tells the agent on a Done item how to reopen it when its PR cannot merge', () => {
    const { ctx, id } = repoTask();
    updateItemState(ctx.db, id, 'done', now());
    expect(itemNextText(ctx, requireItem(ctx.db, id), 'quill', now)).toContain(
      `If its PR cannot merge as it is (a conflict), otea reopen ${id} --reason "…" takes it back to Implementar.`,
    );
  });
});
