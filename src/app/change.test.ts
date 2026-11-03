import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Channel } from '../core/authority.ts';
import type { Actor } from '../core/item.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, getItem, listItems, moveItem, showItem, updateItem } from './items.ts';
import { OFFICIAL_PRESETS_DIR, requirePreset } from './presets.ts';
import { relayDecision } from './relay.ts';
import { memoryContext } from './testing.ts';
import { validateProject } from './validate.ts';

const claude: Actor = { kind: 'agent', name: 'claude' };
const human: Actor = { kind: 'human', name: 'human' };

const T0 = '2026-01-01T00:00:00.000Z';
const at = () => T0;

const playbook = () => readFileSync(join(OFFICIAL_PRESETS_DIR, 'change', 'playbook.md'), 'utf8');

describe('change preset', () => {
  let ctx: Context;

  const change = (title = 'Rotate session signing keys') =>
    createItem(ctx, { collection: 'changes', type: 'change', title, actor: human }, at).id;
  const repoTask = (parent: string, repo: string) =>
    createItem(
      ctx,
      {
        collection: 'changes',
        type: 'repo_task',
        parent,
        title: `Rotate keys in ${repo}`,
        fields: { repo, branch: 'chg-1/rotate-keys', description: 'Read both keys' },
        actor: claude,
      },
      at,
    ).id;
  const move = (
    id: string,
    to: string,
    actor = claude,
    channel: Channel = 'cli',
    reason?: string,
  ) => moveItem(ctx, { id, to, actor, channel, ...(reason ? { reason } : {}) }, at);
  const decide = (id: string, to: string, reason?: string) => move(id, to, human, 'ui', reason);
  const relay = (id: string, to: string, reason?: string) =>
    relayDecision(
      ctx,
      {
        id,
        to,
        via: 'claude',
        channel: 'cli',
        quote: 'Yes, go ahead',
        ...(reason ? { reason } : {}),
      },
      at,
    );
  const stateOf = (id: string) => getItem(ctx, id, at).state;
  const forbidden = expect.objectContaining({ code: 'forbidden' });

  // A change planned as repo tasks for api and web, the plan approved and the change executing.
  function executing() {
    const id = change();
    const api = repoTask(id, 'api');
    const web = repoTask(id, 'web');
    move(id, 'plan_review');
    decide(api, 'ready');
    decide(web, 'ready');
    decide(id, 'executing');
    return { id, api, web };
  }

  // A repo task carried out to pr_review, its pull request recorded.
  function inReview(id: string) {
    move(id, 'implementing');
    updateItem(ctx, { id, fields: { pr: '#482' }, actor: claude }, at);
    move(id, 'pr_review');
  }

  beforeEach(() => {
    ctx = memoryContext();
    addCollection(ctx, { name: 'changes', preset: 'change' });
  });

  afterEach(() => ctx.db.close());

  it('ships as an official preset with a playbook and two types, and validates clean', () => {
    const preset = requirePreset(ctx.presets, 'change');
    const { api } = executing();
    inReview(api);

    expect(preset).toMatchObject({ origin: 'official', playbook: './playbook.md' });
    expect(preset.types.map(({ name, icon }) => [name, icon])).toEqual([
      ['change', 'layers'],
      ['repo_task', 'git-branch'],
    ]);
    expect(preset.view.columns).toEqual([
      'id',
      'title',
      'type',
      'repo',
      'branch',
      'pr',
      'state',
      'who',
      'age',
    ]);
    expect(ctx.presets.problems).toEqual([]);
    expect(ctx.presets.warnings).toEqual([]);
    expect(validateProject(ctx)).toEqual({ errors: 0, warnings: 0, findings: [] });
  });

  it('starts a change in analysing for the agent, and a proposed repo task for the human', () => {
    const id = change();
    const api = repoTask(id, 'api');

    expect(getItem(ctx, id, at)).toMatchObject({ type: 'change', state: 'analysing' });
    expect(getItem(ctx, id, at).turn).toBe('agent');
    expect(getItem(ctx, api, at)).toMatchObject({
      type: 'repo_task',
      state: 'proposed',
      turn: 'human',
      fields: { repo: 'api', branch: 'chg-1/rotate-keys' },
    });
  });

  it('needs a repo and a branch to propose a repo task', () => {
    const id = change();
    const propose = (fields: Record<string, string>) =>
      createItem(
        ctx,
        { collection: 'changes', type: 'repo_task', parent: id, title: 'X', fields, actor: claude },
        at,
      );

    expect(() => propose({ branch: 'b' })).toThrow('missing required field "repo"');
    expect(() => propose({ repo: 'api' })).toThrow('missing required field "branch"');
  });

  it('declares the hierarchy: repo tasks hang only under a change, never alone', () => {
    const preset = requirePreset(ctx.presets, 'change');
    const id = change();
    const api = repoTask(id, 'api');
    const loose = (parent?: string) =>
      createItem(
        ctx,
        {
          collection: 'changes',
          type: 'repo_task',
          title: 'Loose',
          fields: { repo: 'web', branch: 'b' },
          actor: claude,
          ...(parent ? { parent } : {}),
        },
        at,
      );

    expect(preset.version).toBe(2);
    expect(preset.types.map(({ name, children, root }) => [name, children, root])).toEqual([
      ['change', ['repo_task'], true],
      ['repo_task', [], false],
    ]);
    expect(() => loose()).toThrow(expect.objectContaining({ code: 'parent_required' }));
    expect(() => loose(api)).toThrow(expect.objectContaining({ code: 'parent_type' }));
    expect(() =>
      createItem(
        ctx,
        { collection: 'changes', type: 'change', parent: id, title: 'Nested', actor: human },
        at,
      ),
    ).toThrow(expect.objectContaining({ code: 'parent_type' }));
  });

  it('finds the repo task of a change for one repo by its field', () => {
    const id = change();
    repoTask(id, 'api');
    const web = repoTask(id, 'web');

    const found = listItems(ctx, { parent: id, fields: { repo: 'web' } }, at);

    expect(found.map((item) => item.id)).toEqual([web]);
  });

  it('takes a change from plan to done: repo tasks approved, implemented, reviewed', () => {
    const { id, api, web } = executing();

    for (const task of [api, web]) {
      inReview(task);
      expect(getItem(ctx, task, at)).toMatchObject({ turn: 'human', fields: { pr: '#482' } });
      expect(decide(task, 'approved')).toMatchObject({ turn: 'none', closes: 'done' });
    }
    move(id, 'verify');

    expect(decide(id, 'done')).toMatchObject({ state: 'done', closes: 'done' });
  });

  it('keeps the change out of verify while a repo task is open', () => {
    const { id, api, web } = executing();
    inReview(api);
    decide(api, 'approved');

    expect(() => move(id, 'verify')).toThrow(expect.objectContaining({ code: 'children_open' }));
    decide(web, 'dropped', 'Not needed after all');
    expect(move(id, 'verify').state).toBe('verify');
  });

  it('sends a pull request back to revising with a reason, and the plan back to analysing', () => {
    const { api } = executing();
    inReview(api);

    expect(() => decide(api, 'revising')).toThrow(
      expect.objectContaining({ code: 'reason_required' }),
    );
    expect(decide(api, 'revising', 'Pin the algorithm')).toMatchObject({ turn: 'agent' });
    expect(move(api, 'pr_review').state).toBe('pr_review');

    const other = change('Per-seat billing');
    move(other, 'plan_review');
    expect(decide(other, 'analysing', 'Mobile is missing')).toMatchObject({ turn: 'agent' });
  });

  it('lets the agent take a repo task back to proposed with a reason', () => {
    const { api } = executing();
    move(api, 'implementing');

    expect(move(api, 'proposed', claude, 'cli', 'Needs the billing change first')).toMatchObject({
      state: 'proposed',
      turn: 'human',
    });
  });

  it('never lets the agent approve a plan, a pull request or a change', () => {
    const id = change();
    const api = repoTask(id, 'api');
    move(id, 'plan_review');

    expect(() => move(api, 'ready')).toThrow(forbidden);
    expect(() => move(id, 'executing')).toThrow(forbidden);
    decide(api, 'ready');
    decide(id, 'executing');
    inReview(api);
    for (const channel of ['cli', 'mcp'] as const) {
      expect(() => move(api, 'approved', claude, channel)).toThrow(forbidden);
    }
    expect(() => relay(api, 'approved')).toThrow(forbidden);
    decide(api, 'approved');
    move(id, 'verify');

    expect(() => move(id, 'done')).toThrow(forbidden);
    expect(() => relay(id, 'done')).toThrow(forbidden);
    expect([stateOf(api), stateOf(id)]).toEqual(['approved', 'verify']);
  });

  it('relays approving the plan of one repo task and starting the change', () => {
    const id = change();
    const api = repoTask(id, 'api');
    const web = repoTask(id, 'web');
    move(id, 'plan_review');

    expect(relay(api, 'ready')).toMatchObject({ state: 'ready', turn: 'agent' });
    expect(stateOf(web)).toBe('proposed');
    expect(relay(id, 'executing')).toMatchObject({ state: 'executing' });
    expect(
      showItem(ctx, web, { actor: claude, channel: 'cli' }, at).relayable.map(({ to }) => to),
    ).toEqual(['ready', 'dropped']);
  });

  it('gates a repo task: push while worked on, frozen in review, merge once approved', () => {
    const { id, api } = executing();
    const gates = (item: string) =>
      showItem(ctx, item, { actor: claude, channel: 'cli' }, at).gates;
    const proposed = repoTask(id, 'mobile');

    expect(gates(proposed)).toEqual({ push: false, merge: false });
    expect(gates(api)).toEqual({ push: false, merge: false });
    move(api, 'implementing');
    expect(gates(api)).toEqual({ push: true, merge: false });
    move(api, 'pr_review');
    expect(gates(api)).toEqual({ push: false, merge: false });
    decide(api, 'revising', 'Pin the algorithm');
    expect(gates(api)).toEqual({ push: true, merge: false });
    move(api, 'pr_review');
    decide(api, 'approved');
    expect(gates(api)).toEqual({ push: false, merge: true });
    expect(gates(id)).toBeUndefined();
  });

  it('ships a playbook with the plan, the fields, the review and the relay rules', () => {
    const text = playbook();

    for (const phrase of [
      'otea wait --turn agent --unclaimed',
      'otea claim',
      '--type repo_task --parent <id>',
      '--field repo=api --field branch=',
      'otea list --parent <id> --field repo=api',
      'otea update <id> --field pr=',
      'otea move <id> plan_review',
      'otea move <id> pr_review',
      'otea show <id> --json',
      'otea check --gate push --branch --repo',
      'otea check --gate merge --branch --repo',
      "Merge a pull request only once its repo task's `merge` gate allows it",
      'and then merge it yourself',
      'You never approve your own work',
      'otea relay',
    ]) {
      expect(text).toContain(phrase);
    }
  });
});
