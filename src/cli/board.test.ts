import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getItem } from '../app/items.ts';
import { itemNextText, liveBoardOf } from '../app/next.ts';
import { openProject } from '../app/project.ts';
import { AGENT_GUIDE } from '../core/agent-guide.ts';
import { boardText } from '../core/board/next.ts';
import { listedTemplates } from '../core/board/templates.ts';
import { type Cli, cliAt, presetCollection, tempGitRepo } from './testing.ts';

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
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local', '--template', 'none');
  });

  afterEach(() => repo.remove());

  it("prints a published board's own words and each step's instructions", async () => {
    presetCollection(repo.dir, 'work');

    const { code, out } = await otea('board', 'work');

    const def = read((project) => liveBoardOf(project, 'work')?.def);
    expect(code).toBe(0);
    expect(def).toBeDefined();
    expect(out).toBe(`${AGENT_GUIDE}\n\n${boardText(def ?? ({} as never))}\n`);
    expect(out).toContain(
      '1. Completar: any agent does it\n\n2. Hacerlo: any agent does it; the person reviews it',
    );
  });

  it('prints the board, its version and the text with --json', async () => {
    presetCollection(repo.dir, 'work');

    const guide = await json('board', 'work');

    expect(guide).toMatchObject({ kind: 'board', collection: 'work', version: 1 });
    expect(guide.text).toContain('work: steps for each Tarea');
  });

  it('indexes the boards without a name, each with how to read it', async () => {
    presetCollection(repo.dir, 'work');
    presetCollection(repo.dir, 'changes', 'change');

    const { code, out } = await otea('board');

    expect(code).toBe(0);
    expect(out).toBe(
      [
        AGENT_GUIDE,
        '',
        'Read the board you work in before acting:',
        '  Pedidos         board  otea board Pedidos',
        '  work            board  otea board work',
        '  changes         board  otea board changes',
        '  Tareas de repo  board  otea board "Tareas de repo"',
        '',
      ].join('\n'),
    );
    const { boards } = await json('board');
    expect(
      boards.map(({ name, board }: { name: string; board: string | null }) => [
        name,
        board === null,
      ]),
    ).toEqual([
      ['Pedidos', false],
      ['work', false],
      ['changes', false],
      ['Tareas de repo', false],
    ]);
  });

  it('quotes a board name with spaces in the command', async () => {
    presetCollection(repo.dir, 'my work');

    expect((await json('board')).boards[1].command).toBe('otea board "my work"');
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
      presetCollection(repo.dir, 'tasks');
      await otea('create', '--collection', 'tasks', '--title', 'Docs', '--description', 'For v1');

      const hint = (await json('show', 'TASKS-1', '--as', 'quill')).hint;

      expect(hint).toBe(
        read((project) => itemNextText(project, getItem(project, 'TASKS-1'), 'quill')),
      );
      expect(hint).toContain('Your turn: do this step.');
      expect((await otea('show', 'TASKS-1')).out).toContain(
        '\nNext:\n  TASKS-1 · Tarea · Hacerlo, round 1\n  Your turn: do this step.\n',
      );
    });
  });
});

describe('board add', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local');
  });

  afterEach(() => repo.remove());

  it('creates and publishes a board from a template, in the project language', async () => {
    const { code, out } = await otea('board', 'add', 'Bugs del juego', '--template', 'bugs');

    expect(code).toBe(0);
    expect(out).toMatch(
      /^Published board "Bugs del juego" v1 from template bugs \(ids [A-Z0-9]+-<n>\)\n$/,
    );
    const { boards } = JSON.parse((await otea('board', '--json')).out);
    expect(boards.map(({ name }: { name: string }) => name)).toContain('Bugs del juego');
    expect((await otea('board', 'Bugs del juego')).out).toContain('Bugs del juego: steps for each');
  });

  it('starts blank without a template, naming its items with --item', async () => {
    const added = JSON.parse(
      (await otea('board', 'add', 'Recados', '--item', 'Recado', '--json')).out,
    );

    expect(added).toMatchObject({ version: 1, record: { collection: 'Recados' } });
    expect((await otea('create', '--collection', 'Recados', '--title', 'Pan')).code).toBe(0);
  });

  it('refuses a taken name and an unknown template', async () => {
    await otea('board', 'add', 'Recados');

    expect((await otea('board', 'add', 'recados')).code).toBe(5);
    expect((await otea('board', 'add', 'Otro', '--template', 'nope')).code).toBe(3);
  });

  it('makes every board of a template set, the name naming the first', async () => {
    const { code, out } = await otea('board', 'add', 'Cambios web', '--template', 'repos');

    expect(code).toBe(0);
    expect(out).toBe('Published boards "Cambios web", "Tareas de repo" from template repos\n');
    const { boards } = JSON.parse((await otea('board', '--json')).out);
    const names = boards.map(({ name }: { name: string }) => name);
    expect(names).toEqual(expect.arrayContaining(['Cambios web', 'Tareas de repo']));
  });

  it('refuses a template that only comes as part of a set, as Studio never offers it', async () => {
    expect((await otea('board', 'add', 'Sueltos', '--template', 'repotasks')).code).toBe(3);
  });

  it('lists in its help the templates Studio offers, sets too', async () => {
    const { out } = await otea('board', 'add', '--help');

    const keys = listedTemplates('en').map(({ key }) => key);
    expect(out).toContain(`(${keys.join(', ')})`);
  });

  it('names a related item’s step on its own board in otea show', async () => {
    presetCollection(repo.dir, 'work');
    await otea('create', '--collection', 'work', '--title', 'A');
    await otea('create', '--collection', 'work', '--title', 'B');
    await otea('link', 'WORK-1', 'blocks', 'WORK-2');
    const project = openProject(repo.dir);
    const state = getItem(project, 'WORK-2').state;
    project.db.close();
    const { out } = await otea('show', 'WORK-1');
    const row = out.split('\n').find((line) => line.includes('WORK-2')) ?? '';
    expect(row).not.toContain(` ${state} `);
    expect(row).toMatch(/WORK-2\s+(Completar|Hacerlo)/);
    // A list carries bare relation refs: it still lists.
    expect((await otea('list')).code).toBe(0);
  });
});
