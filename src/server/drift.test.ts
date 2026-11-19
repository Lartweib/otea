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

// A clone without Otea's hook can push to a branch while the person reviews it (P3C-R3-1): the
// desk asks the remote, and says so before the person approves, naming who pushed what.
describe('GET /api/items/:id/drift', () => {
  let repo: TempRepo;
  let remote: TempRepo;
  let teammate: TempRepo;
  let project: Project;
  let server: OteaServer;
  const BRANCH = 'feat/bill-102';
  const gitAt =
    (dir: string, name = 't') =>
    (...args: string[]) =>
      execFileSync('git', ['-c', `user.name=${name}`, '-c', 'user.email=t@t', ...args], {
        cwd: dir,
        stdio: 'pipe',
        encoding: 'utf8',
      }).trim();
  const git = (...args: string[]) => gitAt(repo.dir)(...args);
  const drift = async () => {
    const response = await server.app.request(
      `/p/${project.identity.id}/api/items/CAM-1/drift`,
      { headers: { host: LOCAL_HOST, cookie: SESSION_COOKIE } },
      { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { drift: unknown }).drift;
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    remote = tempGitRepo();
    teammate = tempGitRepo();
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
      'Facturas',
      '--field',
      'Qué quiero=x',
      '--field',
      `Rama=${BRANCH}`,
    );
    const bare = join(remote.dir, 'origin.git');
    execFileSync('git', ['init', '-q', '--bare', bare]);
    execFileSync('git', ['--git-dir', bare, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
    writeFileSync(join(repo.dir, 'a.txt'), 'root\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'root');
    git('branch', '-M', 'main');
    git('remote', 'add', 'origin', bare);
    git('push', '-q', '--no-verify', 'origin', 'main');
    git('checkout', '-q', '-b', BRANCH);
    writeFileSync(join(repo.dir, 'b.txt'), 'facturas\n');
    git('add', 'b.txt');
    git('commit', '-q', '-m', 'facturas');
    git('push', '-q', '--no-verify', '-u', 'origin', BRANCH);
    const opened = openProject(repo.dir);
    try {
      const doit = liveBoardOf(opened, 'Cambios')?.def.steps.find(({ name }) => name === 'Hacerlo');
      if (!doit) throw new Error('no Hacerlo');
      updateItemState(
        opened.db,
        'CAM-1',
        stateOf({ step: doit.id, phase: 'doing' }),
        '2026-11-18T10:00:00Z',
      );
    } finally {
      opened.db.close();
    }
    writeFileSync(join(repo.dir, 'facturas.diff'), 'diff --git a/b.txt b/b.txt\n+facturas\n');
    expect((await otea('claim', 'CAM-1')).code).toBe(0);
    expect((await otea('attach', 'CAM-1', 'facturas.diff')).code).toBe(0);
    const handed = await otea('handoff', 'CAM-1', '--note', 'facturas');
    expect(handed.code, handed.err).toBe(0);
    project = openProject(repo.dir);
    server = createServer(project, { token: TOKEN });
  });

  afterEach(() => {
    project.db.close();
    repo.remove();
    remote.remove();
    teammate.remove();
  });

  it('says nothing while the remote branch is the one handed off', async () => {
    expect(await drift()).toBeNull();
  });

  it('names the commits pushed to the branch after the handoff, and who pushed them', async () => {
    const handed = git('rev-parse', '--short=7', BRANCH);
    gitAt(teammate.dir)('clone', '-q', join(remote.dir, 'origin.git'), 'clone');
    const diego = gitAt(join(teammate.dir, 'clone'), 'Diego');
    diego('checkout', '-q', BRANCH);
    writeFileSync(join(teammate.dir, 'clone', 'c.txt'), 'never reviewed\n');
    diego('add', 'c.txt');
    diego('commit', '-q', '-m', 'quick fix');
    diego('push', '-q', '--no-verify', 'origin', BRANCH);
    const pushed = diego('rev-parse', '--short=7', 'HEAD');

    expect(await drift()).toEqual({
      branch: BRANCH,
      handed,
      now: pushed,
      added: [{ commit: pushed, author: 'Diego' }],
    });
  });

  it('says nothing when it cannot reach the remote', async () => {
    git('remote', 'set-url', 'origin', join(remote.dir, 'gone.git'));
    expect(await drift()).toBeNull();
  });
});
