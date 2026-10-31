import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

// review is on the human's turn and waits for every child: a parent comes back only once they close.
const EPIC = `
preset: epic
preset_version: 1
fields:
  title: { module: text, required: create }
workflow:
  initial: building
  states:
    building: { turn: agent }
    parked: { turn: human }
    review: { turn: human, requires: children_closed }
    done: { turn: none, closes: done, requires: children_closed }
  transitions:
    - { from: building, to: review, by: agent }
    - { from: building, to: parked, by: agent }
    - { from: parked, to: review, by: human }
    - { from: review, to: done, by: human }
`;

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
    await otea('init');
    await otea('collection', 'add', 'epics');
    await otea('collection', 'add', 'parts');
    await otea('create', '--collection', 'epics', '--title', 'Create wolf', '--description', 'D');
    for (const title of ['Body', 'Movement']) {
      await otea('create', '--collection', 'parts', '--title', title, '--description', 'D');
    }
  });

  afterEach(() => repo.remove());

  describe('link', () => {
    it('links two items and prints the relation as a sentence', async () => {
      const result = await otea('link', 'PARTS-1', 'parent', 'EPICS-1');

      expect(result).toMatchObject({ code: 0, out: 'PARTS-1 is a child of EPICS-1\n' });
      expect(await json('link', 'PARTS-1', 'blocks', 'PARTS-2')).toMatchObject({
        kind: 'blocks',
        from: 'PARTS-1',
        to: 'PARTS-2',
        actor: { kind: 'agent', name: 'claude' },
        channel: 'cli',
      });
    });

    it.each([
      [['PARTS-1', 'blocks', 'PARTS-1'], 16, 'self_relation'],
      [['PARTS-1', 'blocks', 'PARTS-9'], 3, 'not_found'],
      [['PARTS-1', 'blocked_by', 'PARTS-2'], 2, 'invalid_relation'],
    ])('refuses %j with exit %i (%s)', async (args, code, error) => {
      expect(await errorOf('link', ...args)).toEqual({ code, error });
    });

    it('refuses a second parent and a cycle with exit 16, and a repeated link with exit 5', async () => {
      await otea('link', 'PARTS-1', 'parent', 'EPICS-1');
      await otea('link', 'PARTS-1', 'blocks', 'PARTS-2');

      expect(await errorOf('link', 'PARTS-1', 'parent', 'PARTS-2')).toEqual({
        code: 16,
        error: 'parent_exists',
      });
      expect(await errorOf('link', 'PARTS-2', 'blocks', 'PARTS-1')).toEqual({
        code: 16,
        error: 'relation_cycle',
      });
      expect(await errorOf('link', 'PARTS-1', 'blocks', 'PARTS-2')).toEqual({
        code: 5,
        error: 'already_exists',
      });
    });
  });

  describe('unlink', () => {
    it('removes a link, and fails with exit 3 when there is none', async () => {
      await otea('link', 'PARTS-1', 'relates', 'PARTS-2');

      expect(await otea('unlink', 'PARTS-2', 'relates', 'PARTS-1')).toMatchObject({
        code: 0,
        out: 'Removed: PARTS-1 relates to PARTS-2\n',
      });
      expect(await errorOf('unlink', 'PARTS-2', 'relates', 'PARTS-1')).toEqual({
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
        'EPICS-1',
      );

      expect(created.relations).toEqual([{ kind: 'parent', id: 'EPICS-1' }]);
      expect(
        await errorOf('create', '--collection', 'parts', '--title', 'X', '--parent', 'EPICS-7'),
      ).toEqual({ code: 3, error: 'not_found' });
      expect(await json('list', '--collection', 'parts')).toHaveLength(3);
    });
  });

  describe('list --parent and show', () => {
    beforeEach(async () => {
      await otea('create', '--collection', 'parts', '--title', 'Fur');
      await otea('move', 'PARTS-3', 'discarded', '--reason', 'Reused the fox fur');
      await otea('link', 'PARTS-2', 'parent', 'EPICS-1');
      await otea('link', 'PARTS-3', 'parent', 'EPICS-1');
      await otea('link', 'PARTS-1', 'blocks', 'PARTS-2');
    });

    it('lists the children of a parent, with their relations in JSON', async () => {
      expect((await otea('list', '--parent', 'EPICS-1')).out).toBe(
        'PARTS-2  todo       agent  Movement\nPARTS-3  discarded  none   Fur\n',
      );
      const [epic] = await json('list', '--collection', 'epics');
      expect(epic.children).toEqual({ total: 2, open: 1, done: 0, discarded: 1 });
    });

    it('shows the children summary and the relations grouped by kind', async () => {
      const parent = (await otea('show', 'EPICS-1')).out;
      const child = (await otea('show', 'PARTS-2')).out;

      expect(parent).toContain(
        [
          'Children: 1 of 2 closed (0 done, 1 discarded)',
          'Relations:',
          '  children',
          '    PARTS-2  todo       agent  Movement',
          '    PARTS-3  discarded  none   Fur',
        ].join('\n'),
      );
      expect(child).toContain(
        [
          'Relations:',
          '  parent',
          '    EPICS-1  todo  agent  Create wolf',
          '  blocked by',
          '    PARTS-1  todo  agent  Body',
        ].join('\n'),
      );
      expect((await json('show', 'PARTS-2')).relations).toMatchObject([
        { kind: 'parent', id: 'EPICS-1', title: 'Create wolf', state: 'todo', turn: 'agent' },
        { kind: 'blocked_by', id: 'PARTS-1', title: 'Body', state: 'todo', turn: 'agent' },
      ]);
    });

    it('records links in the timeline of both items', async () => {
      const events = (await otea('show', 'PARTS-2')).out;

      expect(events).toMatch(/relation_added\s+PARTS-1 blocks PARTS-2/);
    });
  });

  describe('a working state that requires closed children', () => {
    beforeEach(async () => {
      repo.write('.otea/presets/epic/preset.yaml', EPIC);
      await otea('collection', 'add', 'creatures', '--preset', 'epic');
      for (const title of ['Create wolf', 'Body', 'Movement']) {
        await otea('create', '--collection', 'creatures', '--title', title);
      }
      await otea('link', 'CREATURES-2', 'parent', 'CREATURES-1');
      await otea('link', 'CREATURES-3', 'parent', 'CREATURES-1');
      await otea('move', 'CREATURES-3', 'parked');
    });

    it('refuses a move into it with exit 4, listing each open child with its state', async () => {
      const result = await otea('move', 'CREATURES-1', 'review');

      expect(result.code).toBe(4);
      expect(result.err).toContain('CREATURES-2 (building), CREATURES-3 (parked)');
      expect(await errorOf('move', 'CREATURES-1', 'review')).toEqual({
        code: 4,
        error: 'children_open',
      });
    });

    it('refuses a relayed decision into it the same way', async () => {
      await otea('move', 'CREATURES-1', 'parked');

      expect(
        await errorOf('relay', 'CREATURES-1', 'review', '--quote', 'Send it back to me'),
      ).toEqual({ code: 4, error: 'children_open' });
    });

    it('reports the requirement on the move in show --json', async () => {
      const { transitions } = await json('show', 'CREATURES-1');

      expect(transitions).toEqual([
        {
          to: 'review',
          by: 'agent',
          reasonRequired: false,
          turn: 'human',
          requires: 'children_closed',
        },
        { to: 'parked', by: 'agent', reasonRequired: false, turn: 'human' },
      ]);
    });
  });
});
