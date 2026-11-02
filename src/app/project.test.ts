import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initProject, openProject, type Project } from './project.ts';

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

    const project = track(initProject(repo));

    expect(project.root).toBe(repo);
    expect(project.db.prepare('PRAGMA user_version').get()?.user_version).toBe(7);
    expect(project.presets.presets.has('tasks')).toBe(true);
    expect(exclude(repo).split(/\r?\n/)).toContain('.otea/');
  });

  it('resolves the root from a subdirectory', () => {
    const repo = gitRepo();
    const nested = join(repo, 'src', 'deep');
    mkdirSync(nested, { recursive: true });

    expect(track(initProject(nested)).root).toBe(repo);
  });

  it('is idempotent', () => {
    const repo = gitRepo();
    initProject(repo).db.close();
    const before = exclude(repo);

    track(initProject(repo));

    expect(exclude(repo)).toBe(before);
  });

  it('resolves every worktree to the same root', () => {
    const repo = gitRepo();
    commit(repo);
    const worktree = join(tempDir(), 'wt');
    git(repo, 'worktree', 'add', '--quiet', worktree);
    track(initProject(repo));

    expect(track(openProject(worktree, {})).root).toBe(repo);
  });

  it('uses the directory itself outside git', () => {
    const dir = tempDir();

    expect(track(initProject(dir)).root).toBe(dir);
  });

  it('fails to open with not_found before init', () => {
    const repo = gitRepo();

    expect(() => openProject(repo, {})).toThrow(expect.objectContaining({ code: 'not_found' }));
  });

  describe('a project in a folder above the repos', () => {
    // A product folder that is not a repo, with the git repo api/ inside and the project at the top.
    function productFolder(): { product: string; api: string } {
      const product = tempDir();
      const api = join(product, 'api');
      mkdirSync(api);
      git(api, 'init', '--quiet');
      commit(api);
      track(initProject(product));
      return { product, api };
    }

    it('is found from a subfolder of a repo inside it', () => {
      const { product, api } = productFolder();
      const src = join(api, 'src');
      mkdirSync(src);

      expect(track(openProject(src, {})).root).toBe(product);
    });

    it('is found from a worktree of a repo inside it', () => {
      const { product, api } = productFolder();
      const worktree = join(tempDir(), 'wt');
      git(api, 'worktree', 'add', '--quiet', worktree);

      expect(track(openProject(worktree, {})).root).toBe(product);
    });

    it('gives way to a nearer project', () => {
      const { api } = productFolder();
      track(initProject(api, { here: true }));

      expect(track(openProject(join(api), {})).root).toBe(api);
    });

    it('is not found from a folder outside it', () => {
      productFolder();

      expect(() => openProject(tempDir(), {})).toThrow(
        expect.objectContaining({ code: 'not_found' }),
      );
    });

    it('makes init inside a repo refuse without --here', () => {
      const { product, api } = productFolder();

      expect(() => initProject(api)).toThrow(
        expect.objectContaining({
          code: 'already_exists',
          message: expect.stringContaining(product),
        }),
      );
      expect(existsSync(join(api, '.otea'))).toBe(false);
    });

    it('lets init --here create a project at the repo', () => {
      const { api } = productFolder();

      expect(track(initProject(api, { here: true })).root).toBe(api);
      expect(exclude(api).split(/\r?\n/)).toContain('.otea/');
    });

    it('reuses the project when init runs again in its folder', () => {
      const { product } = productFolder();

      expect(track(initProject(product)).root).toBe(product);
    });
  });

  describe('OTEA_PROJECT', () => {
    it('overrides discovery', () => {
      const repo = gitRepo();
      track(initProject(repo));
      const other = tempDir();
      track(initProject(other));

      expect(track(openProject(repo, { OTEA_PROJECT: other })).root).toBe(other);
    });

    it('fails with not_found when it names a folder without a project', () => {
      const repo = gitRepo();
      track(initProject(repo));
      const empty = tempDir();

      expect(() => openProject(repo, { OTEA_PROJECT: empty })).toThrow(
        expect.objectContaining({ code: 'not_found', message: expect.stringContaining(empty) }),
      );
    });
  });
});
