import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject } from '../app/project.ts';
import { publishAs } from '../app/testing.ts';
import { creatures } from '../core/board/testing.ts';
import { type Cli, cliAt, declareProfiles, type TempRepo, tempGitRepo } from './testing.ts';

// A step that hands a branch hands work on it: a branch with no commits over its base has nothing
// for the review to see (AGENTS3-3).
describe('handoff of a branch', () => {
  let repo: TempRepo;
  let otea: Cli;
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo.dir, stdio: 'ignore' });

  beforeEach(async () => {
    repo = tempGitRepo();
    git('checkout', '--quiet', '-b', 'main');
    git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      'start',
    );
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    declareProfiles(repo.dir, 'claude');
    const def = creatures();
    def.parts.fbranch = { id: 'fbranch', name: 'Rama', kind: 'branch', hint: '', options: [] };
    const concept = def.steps.find(({ id }) => id === 'sconcept');
    if (concept) concept.hand = [{ ref: 'fbranch', req: 'always', fresh: false }];
    const project = openProject(repo.dir);
    try {
      publishAs(project, def, 'bcri');
    } finally {
      project.db.close();
    }
    await otea(
      'create',
      '--collection',
      'Criaturas',
      '--title',
      'Tortuga',
      '--field',
      'Descripción=con musgo',
    );
    await otea('claim', 'CRI-1');
    git('branch', 'cri-1/tortuga');
    await otea('update', 'CRI-1', '--field', 'Rama=cri-1/tortuga');
  });

  afterEach(() => repo.remove());

  it('refuses a branch with no commits over its base, and takes it once it holds the work', async () => {
    const empty = await otea('handoff', 'CRI-1');
    expect(empty.code).not.toBe(0);
    expect(empty.err).toContain('Rama cri-1/tortuga has no commits over main');
    expect(empty.err).toContain('Commit your work on cri-1/tortuga');

    git('checkout', '--quiet', 'cri-1/tortuga');
    writeFileSync(join(repo.dir, 'tortuga.txt'), 'musgo\n');
    git('add', 'tortuga.txt');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'tortuga');

    const handed = await otea('handoff', 'CRI-1');
    expect(handed.err).not.toContain('no commits');
    expect(handed.code).toBe(0);
  });

  it('says nothing about a branch this checkout does not have', async () => {
    await otea('update', 'CRI-1', '--field', 'Rama=elsewhere/branch');
    const handed = await otea('handoff', 'CRI-1');
    expect(handed.code).toBe(0);
  });
});
