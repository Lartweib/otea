import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HIERARCHY_YAML } from '../core/testing.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

const PLAYBOOK = '# Agile\n\n## `open`\n\nWork it.\n\n## closed\n\nLeave it.\n';
const EPIC_PLAYBOOK = '# Epics\n\n## open\n\nSplit it into stories first.\n';

describe('type hierarchy', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);
  const errorOf = async (...argv: string[]) => {
    const result = await otea(...argv, '--json');
    return { code: result.code, error: JSON.parse(result.err).error };
  };
  const create = (type: string, ...rest: string[]) =>
    otea('create', '--collection', 'board', '--type', type, '--title', `A ${type}`, ...rest);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local');
    repo.write('.otea/presets/agile/preset.yaml', HIERARCHY_YAML);
    repo.write('.otea/presets/agile/playbook.md', PLAYBOOK);
    repo.write('.otea/presets/agile/epic.md', EPIC_PLAYBOOK);
    await otea('collection', 'add', 'board', '--preset', 'agile');
    await create('epic');
    await create('bug');
  });

  afterEach(() => repo.remove());

  it('refuses a parent whose type does not take the child, with exit 16', async () => {
    await create('story', '--parent', 'BOARD-1');
    await create('epic');

    expect(await errorOf('link', 'BOARD-4', 'parent', 'BOARD-3')).toEqual({
      code: 16,
      error: {
        code: 'parent_type',
        message: 'BOARD-3 is a story, which takes bug as children, not epic',
      },
    });
    expect(
      (
        await errorOf(
          'create',
          '--collection',
          'board',
          '--type',
          'epic',
          '--title',
          'E',
          '--parent',
          'BOARD-2',
        )
      ).code,
    ).toBe(16);
    expect((await otea('link', 'BOARD-2', 'parent', 'BOARD-3')).code).toBe(0);
  });

  it('refuses a type that cannot stand alone without a parent, with exit 16', async () => {
    expect(
      await errorOf('create', '--collection', 'board', '--type', 'story', '--title', 'S'),
    ).toEqual({
      code: 16,
      error: {
        code: 'parent_required',
        message: 'A story needs a parent (an epic); create it with --parent <id>',
      },
    });
  });

  it('prints the preset playbook, then the playbook of each type that has one', async () => {
    const { code, out } = await otea('playbook', '--collection', 'board');

    expect(code).toBe(0);
    expect(out).toBe(`${PLAYBOOK.trimEnd()}\n\n--- Type epic ---\n\n${EPIC_PLAYBOOK.trimEnd()}\n`);
    expect(await json('playbook', '--collection', 'board')).toEqual({
      collection: 'board',
      preset: 'agile',
      playbook: PLAYBOOK,
      types: [{ type: 'epic', playbook: EPIC_PLAYBOOK }],
    });
  });

  it("hints from the playbook of the item's type, falling back to the preset's", async () => {
    await otea('move', 'BOARD-1', 'closed', '--reason', 'Done');

    await create('epic');
    expect((await json('show', 'BOARD-3')).hint).toBe('Your turn: Split it into stories first.');
    expect((await json('show', 'BOARD-2')).hint).toBe('Your turn: Work it.');
    expect((await json('show', 'BOARD-1')).hint).toBe('Closed (discarded): Leave it.');
  });
});
