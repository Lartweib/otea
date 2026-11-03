import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addProjectPath,
  forgetProjectPath,
  listProjects,
  openRegistry,
  oteaHome,
  projectAt,
  registerProject,
  relinkProjectPath,
} from './home.ts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });

// A repo with one commit, so it has a root commit to be recognized by. The message names the path:
// two empty commits made in the same second by the same author would otherwise be the same commit.
function repoAt(path: string, remote?: string): string {
  mkdirSync(path, { recursive: true });
  git(path, 'init', '--quiet');
  git(path, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-m', path);
  if (remote) git(path, 'remote', 'add', 'origin', remote);
  return path;
}

describe('home', () => {
  let dir: string;

  beforeEach(() => {
    dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-registry-')));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('oteaHome', () => {
    it('is OTEA_HOME when set', () => {
      expect(oteaHome({ OTEA_HOME: dir })).toBe(dir);
    });

    it('is set by the test setup for every test file', () => {
      expect(process.env.OTEA_HOME).toContain('otea-home-');
    });

    it('refuses the real home folder inside tests', () => {
      expect(() => homedir()).toThrow(/OTEA_HOME/);
      expect(() => oteaHome({})).toThrow(/OTEA_HOME/);
    });
  });

  describe('registry', () => {
    let registry: DatabaseSync;
    let product: string;
    let api: string;

    beforeEach(() => {
      registry = openRegistry({ OTEA_HOME: join(dir, 'home') });
      product = join(dir, 'Product');
      api = join(product, 'api');
      mkdirSync(join(api, 'src'), { recursive: true });
      registerProject(registry, {
        id: 'product-aaaaaa',
        name: 'Product',
        storage: 'common',
        dataDir: join(dir, 'home', 'data', 'product-aaaaaa'),
      });
    });

    afterEach(() => registry.close());

    it('is created in OTEA_HOME', () => {
      expect(existsSync(join(dir, 'home', 'registry.db'))).toBe(true);
    });

    it('finds the project of the nearest linked folder', () => {
      registerProject(registry, { id: 'api-bbbbbb', name: 'api', storage: 'local', dataDir: api });
      addProjectPath(registry, 'product-aaaaaa', product, 'folder');
      addProjectPath(registry, 'api-bbbbbb', api, 'repo');

      expect(projectAt(registry, product)?.id).toBe('product-aaaaaa');
      expect(projectAt(registry, join(api, 'src'))).toEqual({
        id: 'api-bbbbbb',
        name: 'api',
        storage: 'local',
        dataDir: api,
      });
      expect(projectAt(registry, dir)).toBeUndefined();
    });

    it('links several paths to one project', () => {
      const web = join(dir, 'web');
      mkdirSync(web);
      addProjectPath(registry, 'product-aaaaaa', api, 'repo');
      addProjectPath(registry, 'product-aaaaaa', web, 'repo');

      expect(projectAt(registry, api)?.id).toBe('product-aaaaaa');
      expect(projectAt(registry, web)?.id).toBe('product-aaaaaa');
    });

    it('refuses a path that is already linked', () => {
      addProjectPath(registry, 'product-aaaaaa', product, 'folder');

      expect(() => addProjectPath(registry, 'product-aaaaaa', product, 'repo')).toThrow(
        expect.objectContaining({ code: 'already_exists' }),
      );
    });

    it('keeps the real path and compares by its key', () => {
      const linked = addProjectPath(registry, 'product-aaaaaa', product, 'folder');

      expect(linked.path).toBe(product);
      if (process.platform === 'win32' || process.platform === 'darwin') {
        expect(linked.pathKey).toBe(product.replaceAll('\\', '/').toLowerCase());
        expect(projectAt(registry, product.toUpperCase())?.id).toBe('product-aaaaaa');
      }
    });

    it('keeps its data when opened again', () => {
      addProjectPath(registry, 'product-aaaaaa', product, 'folder');
      registry.close();
      registry = openRegistry({ OTEA_HOME: join(dir, 'home') });

      expect(projectAt(registry, api)?.id).toBe('product-aaaaaa');
    });
  });

  // Each test runs a dozen git commands, slow on a busy Windows machine.
  describe('relink and forget', { timeout: 30_000 }, () => {
    let registry: DatabaseSync;

    beforeEach(() => {
      registry = openRegistry({ OTEA_HOME: join(dir, 'home') });
      registerProject(registry, {
        id: 'app-aaaaaa',
        name: 'app',
        storage: 'common',
        dataDir: join(dir, 'home', 'data', 'app-aaaaaa'),
      });
    });

    afterEach(() => registry.close());

    const pathsOf = () => listProjects(registry)[0]?.paths ?? [];

    it('follows a repo that moved, recognized by the root commit recorded when it was linked', () => {
      const old = repoAt(join(dir, 'old'));
      addProjectPath(registry, 'app-aaaaaa', old, 'repo');
      const moved = join(dir, 'moved');
      renameSync(old, moved);

      expect(pathsOf()).toEqual([{ path: old, kind: 'repo', missing: true }]);
      const relinked = relinkProjectPath(registry, old, moved);

      expect(relinked).toMatchObject({ from: old, match: 'same', link: { path: moved } });
      expect(pathsOf()).toEqual([{ path: moved, kind: 'repo', missing: false }]);
      expect(projectAt(registry, moved)?.id).toBe('app-aaaaaa');
    });

    it('recognizes a fresh clone by its remote URL', () => {
      const old = repoAt(join(dir, 'old'), 'https://example.com/o/app.git');
      addProjectPath(registry, 'app-aaaaaa', old, 'repo');
      const clone = repoAt(join(dir, 'clone'), 'https://example.com/o/app');

      expect(relinkProjectPath(registry, old, clone).match).toBe('same');
    });

    it('refuses another repo unless forced', () => {
      const old = repoAt(join(dir, 'old'), 'https://example.com/o/app');
      addProjectPath(registry, 'app-aaaaaa', old, 'repo');
      const other = repoAt(join(dir, 'other'), 'https://example.com/o/other');

      expect(() => relinkProjectPath(registry, old, other)).toThrow(
        expect.objectContaining({ code: 'different_repo' }),
      );
      expect(relinkProjectPath(registry, old, other, true).match).toBe('different');
    });

    it('relinks plain folders, which cannot be checked', () => {
      const old = join(dir, 'notes');
      mkdirSync(old);
      addProjectPath(registry, 'app-aaaaaa', old, 'folder');
      const next = join(dir, 'notes-2');
      mkdirSync(next);

      expect(relinkProjectPath(registry, old, next).match).toBe('unknown');
    });

    it('refuses an unlinked old path, a missing new one and one linked already', () => {
      const a = repoAt(join(dir, 'a'));
      const b = repoAt(join(dir, 'b'));
      addProjectPath(registry, 'app-aaaaaa', a, 'repo');
      addProjectPath(registry, 'app-aaaaaa', b, 'repo');

      expect(() => relinkProjectPath(registry, join(dir, 'c'), a)).toThrow(
        expect.objectContaining({ code: 'not_found' }),
      );
      expect(() => relinkProjectPath(registry, a, join(dir, 'gone'))).toThrow(
        expect.objectContaining({ code: 'not_found' }),
      );
      expect(() => relinkProjectPath(registry, a, b, true)).toThrow(
        expect.objectContaining({ code: 'already_exists' }),
      );
    });

    it('forgets a path, even a missing one, and keeps the project', () => {
      const a = repoAt(join(dir, 'a'));
      const b = repoAt(join(dir, 'b'));
      addProjectPath(registry, 'app-aaaaaa', a, 'repo');
      addProjectPath(registry, 'app-aaaaaa', b, 'repo');
      rmSync(b, { recursive: true, force: true });

      expect(forgetProjectPath(registry, b)).toMatchObject({ link: { path: b }, remaining: 1 });
      expect(forgetProjectPath(registry, a).remaining).toBe(0);
      expect(listProjects(registry)).toEqual([
        expect.objectContaining({ id: 'app-aaaaaa', paths: [] }),
      ]);
      expect(projectAt(registry, a)).toBeUndefined();
      expect(() => forgetProjectPath(registry, a)).toThrow(
        expect.objectContaining({ code: 'not_found' }),
      );
    });
  });
});
