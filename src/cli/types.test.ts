import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIXED_YAML } from '../core/testing.ts';
import { type Cli, cliAt, type TempRepo, tempGitRepo } from './testing.ts';

describe('item types', () => {
  let repo: TempRepo;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init');
    repo.write('.otea/presets/work/preset.yaml', MIXED_YAML);
    await otea('collection', 'add', 'work', '--preset', 'work');
    await otea('collection', 'add', 'tasks');
  });

  afterEach(() => repo.remove());

  const create = (...argv: string[]) => otea('create', '--collection', 'work', ...argv);

  it('creates an item of the type given with --type', async () => {
    const bug = await json(
      'create',
      ...['--collection', 'work', '--type', 'bug', '--title', 'Crash', '--field', 'severity=high'],
    );

    expect(bug).toMatchObject({ id: 'WORK-1', type: 'bug', state: 'reported', turn: 'human' });
  });

  it('needs --type when the preset has several types, and a known one', async () => {
    const untyped = await create('--title', 'Crash');
    const unknown = await create('--type', 'epic', '--title', 'Crash');

    expect(untyped.code).toBe(8);
    expect(untyped.err).toContain('Preset work has several types; give one of: bug, impr');
    expect(unknown.code).toBe(8);
    expect(unknown.err).toContain('Unknown type "epic" in preset work (types: bug, impr)');
  });

  it('does not need --type for a preset without types', async () => {
    const task = await json('create', '--collection', 'tasks', '--title', 'Docs');

    expect(task.type).toBe('item');
  });

  describe('with an item of each type', () => {
    beforeEach(async () => {
      await create('--type', 'bug', '--title', 'Crash', '--field', 'severity=high');
      await create('--type', 'impr', '--title', 'Boot', '--field', 'pitch=Cache it');
    });

    it('lists the type of each item, and filters by it', async () => {
      expect((await otea('list')).out).toBe(
        'WORK-1  bug   reported  human  Crash\nWORK-2  impr  idea      human  Boot\n',
      );
      expect((await json('list', '--type', 'impr')).map(({ id }: { id: string }) => id)).toEqual([
        'WORK-2',
      ]);
    });

    it('shows the type and the moves of its own workflow', async () => {
      const { out } = await otea('show', 'WORK-2');

      expect(out).toContain('state: idea  turn: human  type: impr  collection: work');
      expect(out).toContain('Agent can relay to: planned');
    });

    it('moves an item along the workflow of its type', async () => {
      expect((await otea('move', 'WORK-2', 'dropped', '--reason', 'Not now')).out).toBe(
        'WORK-2  impr  dropped  none  Boot\n',
      );
      expect((await otea('move', 'WORK-1', 'dropped', '--reason', 'X')).code).toBe(4);
    });
  });
});
