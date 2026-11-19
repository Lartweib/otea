import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

// --description fills a board's description field whatever the board calls it: Errores asks for
// a Descripción among several long texts.
describe('--description on a board', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    await cliAt(repo.dir)('board', 'add', 'Errores', '--template', 'triage');
  });

  afterEach(() => repo.remove());

  it('fills the Descripción of an Errores bug, on create and on update', async () => {
    const created = await otea(
      'create',
      '--collection',
      'Errores',
      '--title',
      'Se cae',
      '--description',
      'Al abrir el menú',
      '--json',
    );
    expect(created.err).toBe('');
    const { id, fields } = JSON.parse(created.out);
    expect(fields).toContainEqual(
      expect.objectContaining({
        name: 'Descripción',
        value: 'Al abrir el menú',
      }),
    );

    const updated = JSON.parse(
      (await otea('update', id, '--description', 'Al cerrar el menú', '--json')).out,
    );
    expect(updated.fields).toContainEqual(
      expect.objectContaining({
        name: 'Descripción',
        value: 'Al cerrar el menú',
      }),
    );
  });

  // Not every board has a description field (Cambios has none): the help says so (P1-12).
  it.each(['create', 'update'])(
    'says in %s --help that --description needs such a field',
    async (name) => {
      const { out } = await otea(name, '--help');

      expect(out).toContain(
        "--description fills the board's description field, where it has one (Descripción on Errores); a board without one refuses it",
      );
      expect(out).toContain('--field-file');
    },
  );
});
