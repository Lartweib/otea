import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initProject, openProject, type Project } from './project.ts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });

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
    expect(project.db.prepare('PRAGMA user_version').get()?.user_version).toBe(6);
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
    git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-m', 'init');
    const worktree = join(tempDir(), 'wt');
    git(repo, 'worktree', 'add', '--quiet', worktree);
    track(initProject(repo));

    expect(track(openProject(worktree)).root).toBe(repo);
  });

  it('uses the directory itself outside git', () => {
    const dir = tempDir();

    expect(track(initProject(dir)).root).toBe(dir);
  });

  it('fails to open with not_found before init', () => {
    const repo = gitRepo();

    expect(() => openProject(repo)).toThrow(expect.objectContaining({ code: 'not_found' }));
  });
});
