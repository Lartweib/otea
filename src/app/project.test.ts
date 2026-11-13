import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../store/database.ts';
import { migrate } from '../store/migrations.ts';
import { getBoardRecord, listBoardSummaries } from './boards.ts';
import { addCollection } from './collections.ts';
import { createItem } from './items.ts';
import { addPathToProject, initProject, openProject, type Project } from './project.ts';

// The temporary Otea home the test setup gives this file.
const ENV = { OTEA_HOME: process.env.OTEA_HOME };

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });
const commit = (repo: string) =>
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-m', 'init');

describe('project', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  });

  function tempDir(): string {
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-project-')));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function gitRepo(): string {
    const dir = tempDir();
    git(dir, 'init', '--quiet');
    return dir;
  }

  function track(project: Project): Project {
    cleanups.push(() => project.db.close());
    return project;
  }

  const exclude = (repo: string) => readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8');

  it('initializes .otea at the repo root and excludes it', () => {
    const repo = gitRepo();

    const project = track(initProject(repo, { local: true }));

    expect(project.root).toBe(repo);
    expect(project.db.prepare('PRAGMA user_version').get()?.user_version).toBe(14);
    expect(project.presets.presets.has('tasks')).toBe(true);
    expect(exclude(repo).split(/\r?\n/)).toContain('.otea/');
  });

  describe('identity', () => {
    it('is created on init, named after the folder', () => {
      const repo = gitRepo();

      const { identity } = track(initProject(repo, { local: true }));

      expect(identity).toEqual({
        id: expect.stringMatching(/^otea-project-[a-z0-9-]+-[a-z2-7]{6}$/),
        name: basename(repo),
      });
    });

    it('stays the same on every later open', () => {
      const repo = gitRepo();
      const { identity } = track(initProject(repo, { local: true }));

      expect(track(openProject(repo, ENV)).identity).toEqual(identity);
      expect(track(initProject(repo, { local: true })).identity).toEqual(identity);
    });

    it('is backfilled into a database from before identities', () => {
      const dir = tempDir();
      mkdirSync(join(dir, '.otea'));
      const old = openDatabase(join(dir, '.otea', 'otea.db'));
      migrate(old, 7);
      old.close();

      const project = track(openProject(dir, ENV));

      expect(project.identity.name).toBe(basename(dir));
      expect(project.db.prepare('SELECT * FROM project').all()).toEqual([
        { ...project.identity, icon: null, repos_read: 0 },
      ]);
    });
  });

  it('resolves the root from a subdirectory', () => {
    const repo = gitRepo();
    const nested = join(repo, 'src', 'deep');
    mkdirSync(nested, { recursive: true });

    expect(track(initProject(nested, { local: true })).root).toBe(repo);
  });

  it('is idempotent', () => {
    const repo = gitRepo();
    initProject(repo, { local: true }).db.close();
    const before = exclude(repo);

    track(initProject(repo, { local: true }));

    expect(exclude(repo)).toBe(before);
  });

  it('resolves every worktree to the same root', () => {
    const repo = gitRepo();
    commit(repo);
    const worktree = join(tempDir(), 'wt');
    git(repo, 'worktree', 'add', '--quiet', worktree);
    track(initProject(repo, { local: true }));

    expect(track(openProject(worktree, ENV)).root).toBe(repo);
  });

  describe('boards on open', () => {
    it('reads every collection on a preset as a published board, items on its steps', () => {
      const repo = gitRepo();
      const first = initProject(repo, { local: true });
      addCollection(first, { name: 'Work', preset: 'tasks' });
      let id = '';
      try {
        id = createItem(first, {
          collection: 'Work',
          title: 'Paint',
          fields: { priority: 'high' },
          actor: { kind: 'agent', name: 'kiln' },
        }).id;
        first.db.prepare("UPDATE items SET state = 'in_progress' WHERE id = ?").run(id);
      } finally {
        first.db.close();
      }

      const project = track(openProject(repo, ENV));

      const boards = listBoardSummaries(project);
      const work = boards.find(({ collection }) => collection === 'Work');
      expect(work?.status).toBe('live');
      const item = project.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
      expect(item?.state).toBe('todo');
      expect(item?.type).toBe('item');
      expect(JSON.parse(String(item?.fields))).toMatchObject({ priority: 'high' });
      expect(project.presets.presets.get(work?.id ?? '')?.name).toBe(work?.id);
    });

    it('reads a change collection as Cambios divided into Tareas de repo', () => {
      const repo = gitRepo();
      const first = initProject(repo, { local: true });
      addCollection(first, { name: 'Cambios', preset: 'change' });
      first.db.close();

      const project = track(openProject(repo, ENV));

      const names = listBoardSummaries(project).map(({ name }) => name);
      expect(names).toEqual(expect.arrayContaining(['Cambios', 'Tareas de repo']));
    });

    it('makes a blueprint blocks connection a wait on the blocked board, then forgets the blueprint', () => {
      const repo = gitRepo();
      const first = initProject(repo, { local: true });
      addCollection(first, { name: 'work', preset: 'tasks' });
      addCollection(first, { name: 'bugs', preset: 'bug-triage' });
      const blueprint = join(first.dataDir, 'blueprint.yaml');
      writeFileSync(
        blueprint,
        [
          'name: product',
          'boards:',
          '  - name: work',
          '    preset: tasks',
          '  - name: bugs',
          '    preset: bug-triage',
          'connections:',
          '  - bugs.bug blocks work.task',
          '',
        ].join('\n'),
      );
      first.db.close();

      const project = track(openProject(repo, ENV));

      const work = listBoardSummaries(project).find(({ name }) => name === 'work');
      const def = getBoardRecord(project, work?.id ?? '').live?.definition;
      expect(def?.steps.find(({ id }) => id === 'todo')?.waits).toEqual(['blockers']);
      const bugs = listBoardSummaries(project).find(({ name }) => name === 'bugs');
      const bugDef = getBoardRecord(project, bugs?.id ?? '').live?.definition;
      expect(bugDef?.steps.every(({ waits }) => waits.length === 0)).toBe(true);
      expect(existsSync(blueprint)).toBe(false);
    });

    it('gives the project its Pedidos board once, in Spanish', () => {
      const repo = gitRepo();
      initProject(repo, { local: true }).db.close();
      openProject(repo, ENV).db.close();

      const project = track(openProject(repo, ENV));

      const builtin = listBoardSummaries(project).filter((board) => board.builtin);
      expect(builtin.map(({ name, status }) => ({ name, status }))).toEqual([
        { name: 'Pedidos', status: 'live' },
      ]);
    });
  });

  it('uses the directory itself outside git', () => {
    const dir = tempDir();

    expect(track(initProject(dir, { local: true })).root).toBe(dir);
  });

  it('fails to open with not_found before init', () => {
    const repo = gitRepo();

    expect(() => openProject(repo, { OTEA_HOME: tempDir() })).toThrow(
      expect.objectContaining({
        code: 'not_found',
        message: expect.not.stringContaining('--join'),
      }),
    );
  });

  describe('a project in a folder above the repos', () => {
    // A product folder that is not a repo, with the git repo api/ inside and the project at the top.
    function productFolder(): { product: string; api: string } {
      const product = tempDir();
      const api = join(product, 'api');
      mkdirSync(api);
      git(api, 'init', '--quiet');
      commit(api);
      track(initProject(product, { local: true }));
      return { product, api };
    }

    it('is found from a subfolder of a repo inside it', () => {
      const { product, api } = productFolder();
      const src = join(api, 'src');
      mkdirSync(src);

      expect(track(openProject(src, ENV)).root).toBe(product);
    });

    it('is found from a worktree of a repo inside it', () => {
      const { product, api } = productFolder();
      const worktree = join(tempDir(), 'wt');
      git(api, 'worktree', 'add', '--quiet', worktree);

      expect(track(openProject(worktree, ENV)).root).toBe(product);
    });

    it('gives way to a nearer project', () => {
      const { api } = productFolder();
      track(initProject(api, { here: true, local: true }));

      expect(track(openProject(join(api), ENV)).root).toBe(api);
    });

    it('is not found from a folder outside it', () => {
      productFolder();

      expect(() => openProject(tempDir(), ENV)).toThrow(
        expect.objectContaining({ code: 'not_found' }),
      );
    });

    it('makes init inside a repo refuse without --here', () => {
      const { product, api } = productFolder();

      expect(() => initProject(api, { local: true })).toThrow(
        expect.objectContaining({
          code: 'already_exists',
          message: expect.stringContaining(product),
        }),
      );
      expect(existsSync(join(api, '.otea'))).toBe(false);
    });

    it('lets init --here create a project at the repo', () => {
      const { api } = productFolder();

      expect(track(initProject(api, { here: true, local: true })).root).toBe(api);
      expect(exclude(api).split(/\r?\n/)).toContain('.otea/');
    });

    it('reuses the project when init runs again in its folder', () => {
      const { product } = productFolder();

      expect(track(initProject(product, { local: true })).root).toBe(product);
    });
  });

  describe('OTEA_PROJECT', () => {
    it('overrides discovery', () => {
      const repo = gitRepo();
      track(initProject(repo, { local: true }));
      const other = tempDir();
      track(initProject(other, { local: true }));

      expect(track(openProject(repo, { ...ENV, OTEA_PROJECT: other })).root).toBe(other);
    });

    it('fails with not_found when it names a folder without a project', () => {
      const repo = gitRepo();
      track(initProject(repo, { local: true }));
      const empty = tempDir();

      expect(() => openProject(repo, { ...ENV, OTEA_PROJECT: empty })).toThrow(
        expect.objectContaining({ code: 'not_found', message: expect.stringContaining(empty) }),
      );
    });
  });

  describe('common storage', () => {
    // Each test gets its own home, so registrations never leak between tests.
    function home(): { OTEA_HOME: string } {
      return { OTEA_HOME: tempDir() };
    }

    it('keeps the data in the Otea home and leaves the repo untouched', () => {
      const env = home();
      const repo = gitRepo();

      const project = track(initProject(repo, {}, env));

      expect(project).toMatchObject({ root: repo, storage: 'common' });
      expect(project.dataDir).toBe(join(env.OTEA_HOME, 'data', project.identity.id));
      expect(existsSync(join(project.dataDir, 'otea.db'))).toBe(true);
      expect(existsSync(join(repo, '.otea'))).toBe(false);
      expect(exclude(repo)).not.toContain('.otea/');
      expect(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' })).toBe(
        '',
      );
    });

    it('is found from a subfolder and from a worktree of the repo', () => {
      const env = home();
      const repo = gitRepo();
      commit(repo);
      const { identity } = track(initProject(repo, {}, env));
      const src = join(repo, 'src');
      mkdirSync(src);
      const worktree = join(tempDir(), 'wt');
      git(repo, 'worktree', 'add', '--quiet', worktree);

      expect(track(openProject(src, env)).identity).toEqual(identity);
      expect(track(openProject(worktree, env)).identity).toEqual(identity);
    });

    it('reuses the project when init runs again in the repo', () => {
      const env = home();
      const repo = gitRepo();
      const { identity } = track(initProject(repo, {}, env));

      expect(track(initProject(repo, {}, env)).identity).toEqual(identity);
    });

    it('lets another repo join it, by id or by name, sharing the data', () => {
      const env = home();
      const a = gitRepo();
      const b = gitRepo();
      const c = gitRepo();
      const first = track(initProject(a, {}, env));
      addCollection(first, { name: 'tasks' });

      const joined = track(initProject(b, { join: first.identity.id }, env));
      track(initProject(c, { join: first.identity.name }, env));

      expect(joined).toMatchObject({ root: b, identity: first.identity, dataDir: first.dataDir });
      const names = track(openProject(c, env))
        .db.prepare('SELECT name FROM collections ORDER BY name')
        .all();
      expect(names).toEqual([{ name: 'Pedidos' }, { name: 'tasks' }]);
    });

    it('keeps a folder in one project only', () => {
      const env = home();
      const a = gitRepo();
      const b = gitRepo();
      const first = track(initProject(a, {}, env));
      const second = track(initProject(b, {}, env));

      expect(() => initProject(b, { join: first.identity.id }, env)).toThrow(
        expect.objectContaining({ code: 'already_exists' }),
      );
      expect(() => addPathToProject(a, second.identity.id, env)).toThrow(
        expect.objectContaining({ code: 'already_exists' }),
      );
      expect(track(initProject(b, { join: second.identity.id }, env)).identity).toEqual(
        second.identity,
      );
    });

    it('refuses to join a folder holding a local project, or an unknown project', () => {
      const env = home();
      const a = gitRepo();
      const local = gitRepo();
      const { identity } = track(initProject(a, {}, env));
      track(initProject(local, { local: true }, env));

      expect(() => initProject(local, { join: identity.id }, env)).toThrow(
        expect.objectContaining({ code: 'already_exists' }),
      );
      expect(() => initProject(gitRepo(), { join: 'nope' }, env)).toThrow(
        expect.objectContaining({ code: 'not_found' }),
      );
    });

    it('links any folder with addPathToProject', () => {
      const env = home();
      const repo = gitRepo();
      const { identity } = track(initProject(repo, {}, env));
      const notes = tempDir();

      expect(addPathToProject(notes, identity.id, env)).toMatchObject({
        path: notes,
        kind: 'folder',
      });
      expect(track(openProject(notes, env)).identity).toEqual(identity);
    });

    it('covers the repos inside a product folder, and init there refuses without --here', () => {
      const env = home();
      const product = tempDir();
      const api = join(product, 'api');
      mkdirSync(api);
      git(api, 'init', '--quiet');
      const { identity } = track(initProject(product, {}, env));

      expect(track(openProject(api, env)).identity).toEqual(identity);
      expect(() => initProject(api, {}, env)).toThrow(
        expect.objectContaining({
          code: 'already_exists',
          message: expect.stringContaining(product),
        }),
      );
      expect(track(initProject(api, { here: true, local: true }, env)).storage).toBe('local');
      expect(track(openProject(api, env)).root).toBe(api);
    });

    it('gives way to a nearer local project, and wins over a farther one', () => {
      const env = home();
      const product = tempDir();
      const api = join(product, 'api');
      mkdirSync(api);
      git(api, 'init', '--quiet');
      track(initProject(product, { local: true }, env));

      const nearer = track(initProject(api, { here: true }, env));

      expect(track(openProject(api, env)).identity).toEqual(nearer.identity);
      expect(track(openProject(product, env)).storage).toBe('local');
    });

    it('is named by id in OTEA_PROJECT', () => {
      const env = home();
      const { identity } = track(initProject(gitRepo(), {}, env));

      expect(track(openProject(tempDir(), { ...env, OTEA_PROJECT: identity.id })).identity).toEqual(
        identity,
      );
    });

    it('fails with not_found when its data is gone', () => {
      const env = home();
      const repo = gitRepo();
      const project = initProject(repo, {}, env);
      project.db.close();
      rmSync(project.dataDir, { recursive: true, force: true });

      expect(() => openProject(repo, env)).toThrow(
        expect.objectContaining({ code: 'not_found', message: expect.stringContaining('missing') }),
      );
    });
  });
});
