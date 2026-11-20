import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem, moveItem } from '../app/items.ts';
import { memoryMachine } from '../app/machine.ts';
import { initProject, openProject, type Project } from '../app/project.ts';
import { addRepo } from '../app/repos.ts';
import { tempGitRepo } from '../cli/testing.ts';
import type { Actor } from '../core/item.ts';
import { machineProjects } from './hub.ts';
import type { GitHookInstall, ProjectOverview, ProjectSettings } from './projects.ts';
import { createServer, type OteaServer } from './server.ts';
import { LOCAL_HOST, SESSION_COOKIE, TOKEN } from './testing.ts';

const bot: Actor = { kind: 'agent', name: 'claude' };

function seed(project: Project, titles: string[], waiting: number): void {
  addCollection(project, { name: 'tasks' });
  titles.forEach((title, index) => {
    const { id } = createItem(project, {
      collection: 'tasks',
      title,
      fields: { description: 'Now' },
      actor: bot,
    });
    moveItem(project, { id, to: 'in_progress', actor: bot, channel: 'cli' });
    if (index < waiting) moveItem(project, { id, to: 'review', actor: bot, channel: 'cli' });
  });
}

describe('the projects api', () => {
  const repos: Array<{ dir: string; remove: () => void }> = [];
  let home: string;
  let env: Record<string, string>;
  let here: Project;
  let server: OteaServer;

  const get = async <T>(path: string): Promise<T> =>
    (
      await server.app.request(`/p/${here.identity.id}${path}`, { headers: { host: LOCAL_HOST } })
    ).json() as Promise<T>;
  const post = (path: string, payload: unknown) =>
    Promise.resolve(
      server.app.request(`/p/${here.identity.id}${path}`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          host: LOCAL_HOST,
          origin: `http://${LOCAL_HOST}`,
          cookie: SESSION_COOKIE,
          'content-type': 'application/json',
        },
      }),
    );
  const repo = () => {
    const made = tempGitRepo();
    repos.push(made);
    return made.dir;
  };

  // Two registered projects with items waiting. Making one costs git and migration steps, which a
  // loaded Windows runner stretches to seconds, so the tests that only read or are refused share
  // one; the ones that change a project each get their own.
  // Every project of the home, as otea serve serves them.
  const serveAll = () => createServer(machineProjects(env, memoryMachine()), { token: TOKEN, env });
  const open = () => {
    home = mkdtempSync(join(tmpdir(), 'otea-projects-home-'));
    env = { OTEA_HOME: home };
    here = initProject(repo(), {}, env);
    seed(here, ['Ship the docs', 'Write the notes', 'Tidy'], 2);
    const other = initProject(repo(), {}, env);
    seed(other, ['Fix the login'], 1);
    other.db.close();
    server = serveAll();
    // The server opened its own connection and read the boards anew: so does the test's.
    here.db.close();
    here = openProject(here.root, env);
  };
  const shut = () => {
    server.close();
    here.db.close();
    for (const made of repos.splice(0)) made.remove();
    rmSync(home, { recursive: true, force: true });
  };

  describe('reading, and refusing', () => {
    beforeAll(open);
    afterAll(shut);

    it('GET /api/projects lists every registered project with what waits for you there', async () => {
      const projects = await get<ProjectOverview[]>('/api/projects');
      expect(projects).toHaveLength(2);
      const current = projects.find((project) => project.current);
      expect(current?.id).toBe(here.identity.id);
      expect(current?.waiting.map((item) => item.title)).toEqual([
        'Ship the docs',
        'Write the notes',
      ]);
      expect(current?.withAgents).toBe(1);
      const other = projects.find((project) => !project.current);
      expect(other?.waiting.map((item) => item.title)).toEqual(['Fix the login']);
      // Each says the step it is on in words, never its id (a board's steps are hidden ids).
      expect(other?.waiting.map((item) => item.stateName)).toEqual(['Hacerlo (en revisión)']);
      expect(other?.paths[0]?.missing).toBe(false);
    });

    it('GET /api/project/settings names its paths, repos, gate and storage', async () => {
      const settings = await get<ProjectSettings>('/api/project/settings');
      expect(settings.registered).toBe(true);
      expect(settings.items).toBe(3);
      expect(settings.paths).toHaveLength(1);
      expect(settings.paths[0]?.kind).toBe('repo');
      expect(settings.paths[0]?.repos[0]?.gate).toBe('soft');
      expect(settings.paths[0]?.repos[0]?.remote).toBe(false);
      expect(settings.database.bytes).toBeGreaterThan(0);
      expect(settings.collections.map(({ name }) => name)).toEqual(['Pedidos', 'tasks']);
      expect(settings.collections[1]?.name).toBe('tasks');
    });

    it('refuses to touch a path of another project', async () => {
      const other = (await get<ProjectOverview[]>('/api/projects')).find((p) => !p.current);
      const response = await post('/api/project/paths/forget', { path: other?.paths[0]?.path });
      expect(response.status).toBe(404);
      const unsigned = await server.app.request(`/p/${here.identity.id}/api/project/paths/forget`, {
        method: 'POST',
        body: JSON.stringify({ path: here.root }),
        headers: { host: LOCAL_HOST, 'content-type': 'application/json' },
      });
      expect(unsigned.status).toBe(401);
    });

    it('refuses a folder that does not exist', async () => {
      const nowhere = join(home, 'nowhere');
      mkdirSync(home, { recursive: true });
      expect((await post('/api/project/paths', { path: nowhere })).status).toBe(404);
    });
  });

  describe('changing a project', () => {
    beforeEach(open);
    afterEach(shut);

    it('says a project whose data is gone is unavailable, and keeps listing the rest', async () => {
      const other = (await get<ProjectOverview[]>('/api/projects')).find((p) => !p.current);
      server.close();
      rmSync(join(home, 'data', other?.id ?? ''), { recursive: true, force: true });
      server = serveAll();
      const projects = await get<ProjectOverview[]>('/api/projects');
      const gone = projects.find((project) => !project.current);
      expect(gone?.unavailable).toMatch(/missing/);
      expect(gone?.waiting).toEqual([]);
    });

    it('names each repo as the project does, not by its folder', async () => {
      execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/acme/keys'], {
        cwd: here.root,
      });
      addRepo(here, here.root, 'keys', env);

      const settings = await get<ProjectSettings>('/api/project/settings');
      expect(settings.paths[0]?.repos[0]?.name).toBe('keys');
      // A repo with a remote: pushes leave the machine, so a board that gates none says so.
      expect(settings.paths[0]?.repos[0]?.remote).toBe(true);
    });

    // A board that protects a branch keeps its word only where Otea's pre-push hook runs the
    // check (P2S-R3-1): Publicar offers the hook, and the desk writes it into the project's repos.
    it("writes Otea's pre-push hook into every repo of the project that has none", async () => {
      server.close();
      server = createServer(machineProjects(env, memoryMachine()), {
        token: TOKEN,
        env,
        gitHook: { command: 'node', args: ['/otea/main.ts'] },
      });
      const response = await post('/api/project/git-hook', {});
      expect(response.status).toBe(200);
      const result = (await response.json()) as GitHookInstall;
      expect(result.installed.map(({ repo }) => repo)).toEqual([basename(here.root)]);
      expect(result.refused).toEqual([]);
      const hook = readFileSync(join(here.root, '.git', 'hooks', 'pre-push'), 'utf8');
      expect(hook).toContain('node "/otea/main.ts" check --gate push');
      const settings = await get<ProjectSettings>('/api/project/settings');
      expect(settings.paths[0]?.repos[0]?.gate).toBe('hard');
      // Again, it has nothing left to write.
      const again = (await (await post('/api/project/git-hook', {})).json()) as GitHookInstall;
      expect(again.installed).toEqual([]);
    });

    it("leaves a repo's own pre-push hook alone and says how to add Otea's check to it", async () => {
      server.close();
      server = createServer(machineProjects(env, memoryMachine()), {
        token: TOKEN,
        env,
        gitHook: { command: 'node', args: ['/otea/main.ts'] },
      });
      const own = join(here.root, '.git', 'hooks', 'pre-push');
      writeFileSync(own, '#!/bin/sh\nnpm test\n');
      const result = (await (await post('/api/project/git-hook', {})).json()) as GitHookInstall;
      expect(result.installed).toEqual([]);
      expect(result.refused[0]?.repo).toBe(basename(here.root));
      expect(result.refused[0]?.message).toContain('check --gate push');
      expect(readFileSync(own, 'utf8')).toBe('#!/bin/sh\nnpm test\n');
    });

    it('cannot write a hook when the server was not told how to run Otea', async () => {
      const response = await post('/api/project/git-hook', {});
      expect(response.status).toBe(409);
      expect(existsSync(join(here.root, '.git', 'hooks', 'pre-push'))).toBe(false);
    });

    it('adds a path, relinks a moved one and forgets it, signed in', async () => {
      const added = repo();
      expect((await post('/api/project/paths', { path: added })).status).toBe(201);
      const moved = join(realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-moved-'))), 'repo');
      renameSync(added, moved);
      repos.push({ dir: moved, remove: () => rmSync(moved, { recursive: true, force: true }) });
      let settings = await get<ProjectSettings>('/api/project/settings');
      expect(settings.paths.find((path) => path.path === added)?.missing).toBe(true);

      const relinked = await post('/api/project/paths/relink', { from: added, to: moved });
      expect(relinked.status).toBe(200);
      settings = await get<ProjectSettings>('/api/project/settings');
      expect(settings.paths.map((path) => path.path)).toContain(moved);

      const forgotten = await post('/api/project/paths/forget', { path: moved });
      expect(await forgotten.json()).toMatchObject({ remaining: 1 });
    });
  });
});
