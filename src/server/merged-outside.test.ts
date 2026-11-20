import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liveBoardOf } from '../app/next.ts';
import { openProject, type Project } from '../app/project.ts';
import { cliAt, declareProfiles, type TempRepo, tempGitRepo } from '../cli/testing.ts';
import { stateOf } from '../core/board/engine.ts';
import { updateItemState } from '../store/queries.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, SESSION_COOKIE, TOKEN } from './testing.ts';

// P1-R3-9: an item merged by hand still read «un agente la integra en main ahora» on the desk;
// only the CLI said "merged outside Otea". The desk asks git too, while the item is in Integrar.
describe('GET /api/items/:id/merged-outside', () => {
  let repo: TempRepo;
  let project: Project;
  let server: OteaServer;
  const BRANCH = 'cambio/1-regar';
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: repo.dir,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
  const change = (file: string, text: string) => {
    writeFileSync(join(repo.dir, file), text);
    git('add', file);
    git('commit', '-q', '-m', file);
  };
  const merged = async () => {
    const response = await server.app.request(
      `/p/${project.identity.id}/api/items/CAM-1/merged-outside`,
      { headers: { host: LOCAL_HOST, cookie: SESSION_COOKIE } },
      { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { merged: unknown }).merged;
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    const otea = cliAt(repo.dir, { OTEA_AGENT: 'quill' });
    const person = cliAt(repo.dir);
    await person('init', '--template', 'none');
    await person('board', 'add', 'Cambios', '--template', 'changes');
    declareProfiles(repo.dir, 'quill');
    await otea(
      'create',
      '--collection',
      'Cambios',
      '--title',
      'Regar',
      '--field',
      'Qué quiero=x',
      '--field',
      `Rama=${BRANCH}`,
    );
    change('a.txt', 'root\n');
    git('branch', '-M', 'main');
    git('checkout', '-q', '-b', BRANCH);
    change('b.txt', 'regar\n');
    git('checkout', '-q', 'main');
    const opened = openProject(repo.dir);
    try {
      const land = liveBoardOf(opened, 'Cambios')?.def.steps.find(
        ({ name }) => name === 'Integrar',
      );
      if (!land) throw new Error('no Integrar');
      updateItemState(
        opened.db,
        'CAM-1',
        stateOf({ step: land.id, phase: 'doing' }),
        '2026-11-19T10:00:00Z',
      );
    } finally {
      opened.db.close();
    }
    project = openProject(repo.dir);
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    project.db.close();
    repo.remove();
  });

  it('says nothing while the branch is not in the base', async () => {
    expect(await merged()).toBeNull();
  });

  it('says the branch is in the base already, merged by hand, while the item is in Integrar', async () => {
    git('merge', '-q', '--no-ff', '-m', 'merge by hand', BRANCH);

    expect(await merged()).toEqual({ branch: BRANCH, base: 'main', land: 'Integrar' });
  });

  // P6-R3-2: only local main held it, and the desk said it was merged outside Otea.
  it('says when only the local base holds the branch, with the push it waits for', async () => {
    git('remote', 'add', 'origin', 'https://example.invalid/regar.git');
    git('update-ref', 'refs/remotes/origin/main', 'main');
    git('merge', '-q', '--ff-only', BRANCH);

    expect(await merged()).toEqual({
      branch: BRANCH,
      base: 'main',
      land: 'Integrar',
      local: { remote: 'origin/main', push: 'origin' },
    });
  });
});
