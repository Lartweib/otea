import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getItem } from '../app/items.ts';
import { itemNextText, liveBoardOf } from '../app/next.ts';
import { openProject } from '../app/project.ts';
import { boardText } from '../core/board/next.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

const CHANGE_PLAYBOOK = readFileSync(
  new URL('../../presets/change/playbook.md', import.meta.url),
  'utf8',
);

// A preset a board cannot say (a state waits for closed children): its collection stays on it.
const NOTES = (playbook: boolean) =>
  [
    'preset: notes',
    'preset_version: 1',
    ...(playbook ? ['playbook: ./playbook.md'] : []),
    'fields:',
    '  title: { module: text, required: create }',
    'workflow:',
    '  initial: open',
    '  states:',
    '    open: { turn: agent }',
    '    closed: { turn: none, closes: done, requires: children_closed }',
    '  transitions:',
    '    - { from: open, to: closed, by: human }',
    '',
  ].join('\n');

// What agents read about a board before acting: `otea board`, and the hint of `otea show`.
describe('board', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  // Reads the project the way the CLI does, then closes it.
  const read = <T>(use: (project: ReturnType<typeof openProject>) => T): T => {
    const project = openProject(repo.dir);
    try {
      return use(project);
    } finally {
      project.db.close();
    }
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init', '--local');
  });

  afterEach(() => repo.remove());

  it("prints a published board's own words and each step's instructions", async () => {
    await otea('collection', 'add', 'work');

    const { code, out } = await otea('board', 'work');

    const def = read((project) => liveBoardOf(project, 'work')?.def);
    expect(code).toBe(0);
    expect(def).toBeDefined();
    expect(out).toBe(`${boardText(def ?? ({} as never))}\n`);
    expect(out).toContain('1. En curso: any agent does it; the person reviews it');
  });

  it('prints the board, its version and the text with --json', async () => {
    await otea('collection', 'add', 'work');

    const guide = await json('board', 'work');

    expect(guide).toMatchObject({ kind: 'board', collection: 'work', version: 1 });
    expect(guide.text).toContain('work: steps for each Tarea');
  });

  it('prints the playbook of a collection still on a preset', async () => {
    await otea('collection', 'add', 'changes', '--preset', 'change');

    expect((await otea('board', 'changes')).out).toContain(CHANGE_PLAYBOOK.trimEnd());
    expect(await json('board', 'changes')).toMatchObject({
      kind: 'preset',
      collection: 'changes',
      preset: 'change',
      playbook: CHANGE_PLAYBOOK,
    });
  });

  it('says so when the preset has no playbook', async () => {
    repo.write('.otea/presets/notes/preset.yaml', NOTES(false));
    await otea('collection', 'add', 'notes', '--preset', 'notes');

    expect((await otea('board', 'notes')).out).toBe(
      'The notes preset of collection "notes" has no playbook.\n',
    );
    expect((await json('board', 'notes')).playbook).toBeNull();
  });

  it('indexes the boards without a name, each with how to read it', async () => {
    await otea('collection', 'add', 'work');
    await otea('collection', 'add', 'changes', '--preset', 'change');

    const { code, out } = await otea('board');

    expect(code).toBe(0);
    expect(out).toBe(
      [
        'Read the board you work in before acting:',
        '  Pedidos  board          otea board Pedidos',
        '  work     board          otea board work',
        '  changes  preset change  otea board changes',
        '',
      ].join('\n'),
    );
    const { collections } = await json('board');
    expect(
      collections.map(({ name, board }: { name: string; board: string | null }) => [
        name,
        board === null,
      ]),
    ).toEqual([
      ['Pedidos', false],
      ['work', false],
      ['changes', true],
    ]);
  });

  it('quotes a board name with spaces in the command', async () => {
    await otea('collection', 'add', 'my work');

    expect((await json('board')).collections[1].command).toBe('otea board "my work"');
  });

  it('fails with not_found for an unknown collection', async () => {
    const { code, err } = await otea('board', 'nope', '--json');

    expect(code).toBe(3);
    expect(JSON.parse(err)).toEqual({
      error: { code: 'not_found', message: 'Collection "nope" not found' },
    });
  });

  describe('show', () => {
    it("says what to do now on a board in next's own words", async () => {
      await otea('collection', 'add', 'tasks');
      await otea('create', '--collection', 'tasks', '--title', 'Docs', '--description', 'For v1');

      const hint = (await json('show', 'TASKS-1', '--as', 'quill')).hint;

      expect(hint).toBe(
        read((project) => itemNextText(project, getItem(project, 'TASKS-1'), 'quill')),
      );
      expect(hint).toContain('Your turn: do this step.');
      expect((await otea('show', 'TASKS-1')).out).toContain(
        '\nNext:\n  TASKS-1 · Tarea · En curso, round 1\n  Your turn: do this step.\n',
      );
    });

    it('uses the section of the playbook that names the state on a preset', async () => {
      repo.write('.otea/presets/notes/preset.yaml', NOTES(true));
      repo.write('.otea/presets/notes/playbook.md', '# Notes\n\n## `open`\n\nWrite it down.\n');
      await otea('collection', 'add', 'notes', '--preset', 'notes');
      await otea('create', '--collection', 'notes', '--title', 'Idea');

      expect((await json('show', 'NOTES-1')).hint).toBe('Your turn: Write it down.');
    });
  });
});
