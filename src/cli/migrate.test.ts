import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeServeFile } from './serve-file.ts';
import { type Cli, cliAt, presetCollection, type TempRepo, tempGitRepo } from './testing.ts';

describe('migrate', () => {
  let repo: TempRepo;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local');
    presetCollection(repo.dir, 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'Kept');
  });

  afterEach(() => repo.remove());

  it('moves a local project into common storage and says how to undo it', async () => {
    const { code, out } = await otea('migrate', '--to', 'common');

    expect(code).toBe(0);
    expect(out).toContain('Copied and verified the database into');
    expect(out).toContain('items 1');
    expect(out).toMatch(/Moved .*\.otea to .*\.otea\.migrated-\d{8}-\d{6} \(a backup/);
    expect(out).toContain(`otea projects forget ${repo.dir}`);
    expect(existsSync(join(repo.dir, '.otea'))).toBe(false);
    expect(JSON.parse((await otea('projects', 'current', '--json')).out).storage).toBe('common');
    expect((await otea('list')).out).toContain('Kept');
  });

  it('says there is nothing to do on a second run', async () => {
    await otea('migrate', '--to', 'common');

    const { code, out } = await otea('migrate', '--to', 'common');

    expect(code).toBe(0);
    expect(out).toContain('already in common storage');
  });

  it('refuses while otea serve runs on the project', async () => {
    writeServeFile(join(repo.dir, '.otea'), { port: 4475, pid: process.pid });

    const { code, err } = await otea('migrate', '--to', 'common');

    expect(code).toBe(18);
    expect(err).toContain('stop it first');
    expect(existsSync(join(repo.dir, '.otea', 'otea.db'))).toBe(true);
  });

  it('needs --to common', async () => {
    expect((await otea('migrate')).code).toBe(2);
    expect((await otea('migrate', '--to', 'local')).code).toBe(2);
  });
});
