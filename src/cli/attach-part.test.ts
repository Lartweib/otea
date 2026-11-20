import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, declareProfiles, type TempRepo, tempGitRepo } from './testing.ts';

// Diff is a part the agent attaches as a file, not a field it fills: `update --field-file
// "Diff=…"` answered only «no field Diff», so the agent told the person twice the board had no Diff
// (P3C-R3-5). The refusal says it is a part to attach, with the exact command.
describe('a field named after a part to attach', () => {
  let repo: TempRepo;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'quill' });
    const person = cliAt(repo.dir);
    await person('init', '--template', 'none');
    await person('board', 'add', 'Cambios', '--template', 'changes');
    declareProfiles(repo.dir, 'quill');
    await otea(
      'create',
      '--collection',
      'Cambios',
      '--title',
      'Facturas',
      '--field',
      'Qué quiero=x',
    );
    repo.write('cambio 1.diff', 'diff --git a/b.txt b/b.txt\n+facturas\n');
  });

  afterEach(() => repo.remove());

  it('gives the exact otea attach command for --field-file', async () => {
    const refused = await otea('update', 'CAM-1', '--field-file', 'Diff=cambio 1.diff');
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(
      'Diff is a part you attach as a file, not a field: otea attach CAM-1 "cambio 1.diff" --module Diff',
    );
  });

  it('names the command with a file to pick for --field', async () => {
    const refused = await otea('update', 'CAM-1', '--field', 'Diff=x');
    expect(refused.code).not.toBe(0);
    expect(refused.err).toContain(
      'Diff is a part you attach as a file, not a field: otea attach CAM-1 <file> --module Diff',
    );
  });

  // A diff saved as .txt and attached without naming a part went quietly to the log part (P8-R3-5):
  // a file is placed by its extension, so the output says what it reads as, and how to fix it.
  describe('a unified diff saved as .txt, attached without naming a part', () => {
    const diff = [
      'diff --git a/b.txt b/b.txt',
      'index 1111111..2222222 100644',
      '--- a/b.txt',
      '+++ b/b.txt',
      '@@ -1 +1,2 @@',
      ' facturas',
      '+recibos',
      '',
    ].join('\n');
    // An item of a board with one log part (Pruebas) and one code part (Cambios).
    let item: string;

    beforeEach(async () => {
      // The ideas set's second board: Implementación.
      await cliAt(repo.dir)('board', 'add', 'Ideas', '--template', 'ideas');
      const created = await otea(
        'create',
        '--collection',
        'Implementación',
        '--title',
        'Recibos',
        '--field',
        'Qué hay que hacer=x',
        '--json',
      );
      item = JSON.parse(created.out).id;
    });

    it('says it went to the log part, and gives the commands to attach it to the diff part', async () => {
      repo.write('cambio 2.txt', diff);

      const attached = await otea('attach', item, 'cambio 2.txt');

      expect(attached.code).toBe(0);
      expect(attached.out).toContain(
        `"cambio 2.txt" reads as a unified diff, but a .txt goes to Pruebas: Cambios takes a diff saved as .diff. Save it as "cambio 2.diff" and run otea attach ${item} "cambio 2.diff" --module Cambios, then otea detach ${item} 1`,
      );
      repo.write('cambio 4.txt', diff.replace('recibos', 'notas'));
      const json = JSON.parse((await otea('attach', item, 'cambio 4.txt', '--json')).out);
      expect(json.diffPart).toBe('Cambios');
    });

    it('says nothing of a plain log', async () => {
      repo.write('pruebas.txt', 'ok 12 tests\n--- summary\n');

      const attached = await otea('attach', item, 'pruebas.txt');
      expect(attached.code).toBe(0);
      expect(attached.out).not.toContain('unified diff');
    });

    it('says nothing when the part is named', async () => {
      repo.write('cambio 3.txt', diff);

      const attached = await otea('attach', item, 'cambio 3.txt', '--module', 'Pruebas');
      expect(attached.code).toBe(0);
      expect(attached.out).not.toContain('unified diff');
    });

    it('names the diff part too when the board asks which log part', async () => {
      repo.write('cambio 2.txt', diff);

      const refused = await otea('attach', 'CAM-1', 'cambio 2.txt');

      expect(refused.code).not.toBe(0);
      expect(refused.err).toContain(
        '"cambio 2.txt" reads as a unified diff: Diff takes a diff saved as .diff. Save it as "cambio 2.diff" and run otea attach CAM-1 "cambio 2.diff" --module Diff',
      );
    });
  });
});
