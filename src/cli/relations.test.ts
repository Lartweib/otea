import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

describe('relations', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);
  const errorOf = async (...argv: string[]) => {
    const result = await otea(...argv, '--json');
    return { code: result.code, error: JSON.parse(result.err).error.code as string };
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local');
    await otea('collection', 'add', 'parts');
    await otea('collection', 'add', 'bugs');
    for (const title of ['Create wolf', 'Body', 'Movement']) {
      await otea('create', '--collection', 'parts', '--title', title, '--description', 'D');
    }
    await otea('create', '--collection', 'bugs', '--title', 'Wolf clips', '--description', 'D');
  });

  afterEach(() => repo.remove());

  describe('link', () => {
    it('links two items and prints the relation as a sentence', async () => {
      const result = await otea('link', 'PARTS-2', 'parent', 'PARTS-1');

      expect(result).toMatchObject({ code: 0, out: 'PARTS-2 is a child of PARTS-1\n' });
      expect(await json('link', 'PARTS-2', 'blocks', 'PARTS-3')).toMatchObject({
        kind: 'blocks',
        from: 'PARTS-2',
        to: 'PARTS-3',
        actor: { kind: 'agent', name: 'claude' },
        channel: 'cli',
      });
    });

    it.each([
      [['PARTS-2', 'blocks', 'PARTS-2'], 16, 'self_relation'],
      [['PARTS-2', 'blocks', 'PARTS-9'], 3, 'not_found'],
      [['PARTS-2', 'blocked_by', 'PARTS-3'], 2, 'invalid_relation'],
    ])('refuses %j with exit %i (%s)', async (args, code, error) => {
      expect(await errorOf('link', ...args)).toEqual({ code, error });
    });

    it('refuses a second parent and a cycle with exit 16, and a repeated link with exit 5', async () => {
      await otea('link', 'PARTS-2', 'parent', 'PARTS-1');
      await otea('link', 'PARTS-2', 'blocks', 'PARTS-3');

      expect(await errorOf('link', 'PARTS-2', 'parent', 'PARTS-3')).toEqual({
        code: 16,
        error: 'parent_exists',
      });
      expect(await errorOf('link', 'PARTS-3', 'blocks', 'PARTS-2')).toEqual({
        code: 16,
        error: 'relation_cycle',
      });
      expect(await errorOf('link', 'PARTS-2', 'blocks', 'PARTS-3')).toEqual({
        code: 5,
        error: 'already_exists',
      });
    });
  });

  describe('a parent in another collection', () => {
    it('is refused with exit 16, pointing to blocks and implements', async () => {
      const result = await otea('link', 'PARTS-2', 'parent', 'BUGS-1');

      expect(result.code).toBe(16);
      expect(result.err).toContain('Link PARTS-2 blocks BUGS-1 to make BUGS-1 wait');
      expect(await errorOf('link', 'PARTS-2', 'parent', 'BUGS-1')).toEqual({
        code: 16,
        error: 'parent_across_boards',
      });
    });

    it('is refused on create --parent, creating nothing', async () => {
      expect(
        await errorOf('create', '--collection', 'bugs', '--title', 'X', '--parent', 'PARTS-1'),
      ).toEqual({ code: 16, error: 'parent_across_boards' });
      expect(await json('list', '--collection', 'bugs')).toHaveLength(1);
    });
  });

  describe('unlink', () => {
    it('removes a link, and fails with exit 3 when there is none', async () => {
      await otea('link', 'PARTS-2', 'relates', 'PARTS-3');

      expect(await otea('unlink', 'PARTS-3', 'relates', 'PARTS-2')).toMatchObject({
        code: 0,
        out: 'Removed: PARTS-2 relates to PARTS-3\n',
      });
      expect(await errorOf('unlink', 'PARTS-3', 'relates', 'PARTS-2')).toEqual({
        code: 3,
        error: 'not_found',
      });
    });
  });

  describe('create --parent', () => {
    it('creates the item as a child, and nothing for a missing parent', async () => {
      const created = await json(
        'create',
        '--collection',
        'parts',
        '--title',
        'Animation',
        '--parent',
        'PARTS-1',
      );

      expect(created.relations).toEqual([{ kind: 'parent', id: 'PARTS-1' }]);
      expect(
        await errorOf('create', '--collection', 'parts', '--title', 'X', '--parent', 'PARTS-7'),
      ).toEqual({ code: 3, error: 'not_found' });
      expect(await json('list', '--collection', 'parts')).toHaveLength(4);
    });
  });

  describe('list --parent and show', () => {
    beforeEach(async () => {
      await otea('create', '--collection', 'parts', '--title', 'Fur');
      await otea(
        'relay',
        'PARTS-4',
        'dropped',
        '--quote',
        'Drop it',
        '--reason',
        'Reused the fox fur',
      );
      await otea('link', 'PARTS-3', 'parent', 'PARTS-1');
      await otea('link', 'PARTS-4', 'parent', 'PARTS-1');
      await otea('link', 'PARTS-2', 'blocks', 'PARTS-3');
    });

    it('lists the children of a parent, with their relations in JSON', async () => {
      expect((await otea('list', '--parent', 'PARTS-1')).out).toBe(
        'PARTS-3  Hacerlo  agent  Movement\nPARTS-4  Dropped  none   Fur\n',
      );
      const [epic] = await json('list', '--collection', 'parts');
      expect(epic.children).toEqual({ total: 2, open: 1, done: 0, discarded: 1 });
    });

    it('shows the children summary and the relations grouped by kind', async () => {
      const parent = (await otea('show', 'PARTS-1')).out;
      const child = (await otea('show', 'PARTS-3')).out;

      expect(parent).toContain(
        [
          'Children: 1 of 2 closed (0 done, 1 discarded)',
          'Relations:',
          '  children',
          '    PARTS-3  Hacerlo  agent  Movement',
          '    PARTS-4  Dropped  none   Fur',
        ].join('\n'),
      );
      expect(child).toContain(
        [
          'Relations:',
          '  parent',
          '    PARTS-1  Hacerlo  agent  Create wolf',
          '  blocked by',
          '    PARTS-2  Hacerlo  agent  Body',
        ].join('\n'),
      );
      expect((await json('show', 'PARTS-3')).relations).toMatchObject([
        { kind: 'parent', id: 'PARTS-1', title: 'Create wolf', state: 'todo', turn: 'agent' },
        { kind: 'blocked_by', id: 'PARTS-2', title: 'Body', state: 'todo', turn: 'agent' },
      ]);
    });

    it('records links in the timeline of both items', async () => {
      const events = (await otea('show', 'PARTS-3')).out;

      expect(events).toMatch(/relation_added\s+PARTS-2 blocks PARTS-3/);
    });
  });
});
