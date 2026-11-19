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
});
