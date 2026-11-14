import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { archiveBoard } from '../app/board-archive.ts';
import { openProject } from '../app/project.ts';
import { publishAs } from '../app/testing.ts';
import { errores } from '../core/board/testing.ts';
import { EXIT_CODES } from './exit-codes.ts';
import { type Cli, cliAt, declareProfiles, tempGitRepo } from './testing.ts';

// An archived board, as an agent meets it: its items gone from next and list, readable with show,
// and every write refused with its own exit code (board_archived), saying the person restores it.
describe('an archived board from the CLI', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  let id: string;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local', '--template', 'none');
    declareProfiles(repo.dir, 'claude');
    const project = openProject(repo.dir);
    try {
      publishAs(project, errores(), 'berr');
    } finally {
      project.db.close();
    }
    const created = await otea(
      'create',
      '--collection',
      'Errores',
      '--title',
      'Faro',
      '--field',
      'Pasos=abrir',
      '--json',
    );
    id = JSON.parse(created.out).id;
    const again = openProject(repo.dir);
    try {
      archiveBoard(again, 'berr', { by: { kind: 'human', name: 'human' } });
    } finally {
      again.db.close();
    }
  });

  afterEach(() => repo.remove());

  it('leaves its items out of list and next, and still shows them', async () => {
    expect((await otea('list', '--json')).out).not.toContain(id);
    expect((await otea('next', '--json')).out).not.toContain(id);
    const shown = await otea('show', id);
    expect(shown.code).toBe(0);
    expect(shown.out).toContain('archived');
  });

  it('refuses every write with exit 21, board_archived', async () => {
    for (const argv of [
      ['claim', id],
      ['update', id, '--title', 'Otro'],
      ['handoff', id],
      ['create', '--collection', 'Errores', '--title', 'Nuevo', '--field', 'Pasos=x'],
    ]) {
      const result = await otea(...argv, '--json');
      expect(result.code, argv.join(' ')).toBe(EXIT_CODES.board_archived);
      expect(JSON.parse(result.err).error.code).toBe('board_archived');
    }
    expect(EXIT_CODES.board_archived).toBe(21);
    const claim = await otea('claim', id);
    expect(claim.err).toMatch(/archived board: it is read-only/);
  });
});
