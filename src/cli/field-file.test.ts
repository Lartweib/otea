import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

// A long or multi-line field value comes from a file or from stdin (--field-file), so an agent
// leaves no helper file in the repo and needs no shell quoting (P2S-R2-5).
describe('--field-file', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  const ANSWER = 'Una tabla:\n\n- con dos columnas\n- y "comillas"';

  const needOf = async (cli: Cli, id: string) => {
    const { fields } = JSON.parse((await cli('show', id, '--json')).out);
    return fields.find((field: { name: string }) => field.name === 'Qué necesitas')?.value;
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local');
    const made = await otea(
      'create',
      '--collection',
      'Pedidos',
      '--title',
      'Una tabla',
      '--field',
      'Qué necesitas=x',
    );
    expect(made.code).toBe(0);
  });

  afterEach(() => repo.remove());

  it('sets a field to what a file holds, without its BOM or its last line break', async () => {
    repo.write('answer.md', `\uFEFF${ANSWER}\r\n`);

    const { code, err } = await otea(
      'update',
      'PED-1',
      '--field-file',
      `Qué necesitas=${join(repo.dir, 'answer.md')}`,
    );

    expect(err).toBe('');
    expect(code).toBe(0);
    expect(await needOf(otea, 'PED-1')).toBe(ANSWER);
  });

  it('reads the value from stdin with -', async () => {
    const piped = cliAt(
      repo.dir,
      { OTEA_AGENT: 'claude' },
      undefined,
      undefined,
      undefined,
      `${ANSWER}\n`,
    );

    const { code } = await piped('update', 'PED-1', '--field-file', 'Qué necesitas=-');

    expect(code).toBe(0);
    expect(await needOf(otea, 'PED-1')).toBe(ANSWER);
  });

  it('takes it on create too', async () => {
    repo.write('answer.md', ANSWER);

    const made = await otea(
      'create',
      '--collection',
      'Pedidos',
      '--title',
      'Otra',
      '--field-file',
      'Qué necesitas=answer.md',
    );

    expect(made.err).toBe('');
    expect(await needOf(otea, 'PED-2')).toBe(ANSWER);
  });

  it('says which file is missing', async () => {
    const { code, err } = await otea('update', 'PED-1', '--field-file', 'Qué necesitas=nope.md');

    expect(code).toBe(3);
    expect(err).toContain(`No file at ${join(repo.dir, 'nope.md')}`);
  });

  it('refuses a field given twice, by --field and --field-file', async () => {
    repo.write('answer.md', ANSWER);

    const { code, err } = await otea(
      'update',
      'PED-1',
      '--field',
      'Qué necesitas=y',
      '--field-file',
      'Qué necesitas=answer.md',
    );

    expect(code).toBe(2);
    expect(err).toContain('given twice');
  });

  it('shows an example when a field has no =, and when --value is tried', async () => {
    const bare = await otea('update', 'PED-1', '--field', 'Qué necesitas');
    expect(bare.code).toBe(2);
    expect(bare.err).toContain('--field "Qué necesitas=<value>"');
    expect(bare.err).toContain('--field-file "Qué necesitas=<file>"');

    const value = await otea('update', 'PED-1', '--field', 'Qué necesitas', '--value', 'y');
    expect(value.code).toBe(2);
    expect(value.err).toContain('There is no --value');
    expect(value.err).toContain('--field "<name>=<value>"');
  });
});
