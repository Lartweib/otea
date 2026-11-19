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

// P1-R3-1: a «Rama» named another item's branch, next to a diff from the agent's own checkout; the
// desk showed both with no warning. Once handed off, it says when the attached diff does not come
// from the tip handed off on the branch, before the person approves.
describe('GET /api/items/:id/diff-tip', () => {
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
  const offTip = async () => {
    const response = await server.app.request(
      `/p/${project.identity.id}/api/items/CAM-1/diff-tip`,
      { headers: { host: LOCAL_HOST, cookie: SESSION_COOKIE } },
      { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { off: unknown }).off;
  };
  // Hands CAM-1 off with the diff given, as the agent attached it.
  const handOff = async (diff: string) => {
    const otea = cliAt(repo.dir, { OTEA_AGENT: 'quill' });
    writeFileSync(join(repo.dir, 'regar.diff'), diff);
    expect((await otea('claim', 'CAM-1')).code).toBe(0);
    expect((await otea('attach', 'CAM-1', 'regar.diff')).code).toBe(0);
    const handed = await otea('handoff', 'CAM-1', '--note', 'regar');
    expect(handed.code, handed.err).toBe(0);
    project = openProject(repo.dir);
    server = createServer(project, { token: TOKEN });
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
    const opened = openProject(repo.dir);
    try {
      const doit = liveBoardOf(opened, 'Cambios')?.def.steps.find(({ name }) => name === 'Hacerlo');
      if (!doit) throw new Error('no Hacerlo');
      updateItemState(
        opened.db,
        'CAM-1',
        stateOf({ step: doit.id, phase: 'doing' }),
        '2026-11-19T10:00:00Z',
      );
    } finally {
      opened.db.close();
    }
  });

  afterEach(() => {
    project.db.close();
    repo.remove();
  });

  it('says nothing when the diff is the one of the tip handed off', async () => {
    await handOff(git('diff', 'main...HEAD'));
    expect(await offTip()).toBeNull();
  });

  it('names the files whose change is not the one on the tip handed off', async () => {
    const tip = git('rev-parse', '--short=7', 'HEAD');
    // A diff made in another checkout, on another branch: b.txt as it is there.
    git('checkout', '-q', '-b', 'probe/badge', 'main');
    change('b.txt', 'otra cosa\n');
    change('c.txt', 'solo aquí\n');
    const elsewhere = git('diff', 'main...HEAD');
    git('checkout', '-q', BRANCH);

    await handOff(elsewhere);
    expect(await offTip()).toEqual({ branch: BRANCH, tip, files: ['b.txt', 'c.txt'] });
  });

  it('says nothing of a diff that names no blobs, which it cannot tell', async () => {
    await handOff('diff --git a/b.txt b/b.txt\n+regar\n');
    expect(await offTip()).toBeNull();
  });
});
