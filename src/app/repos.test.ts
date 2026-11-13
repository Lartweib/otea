import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initProject, type Project } from './project.ts';
import { addRepo, listRepos, removeRepo, repoNameAt, UnknownRepo } from './repos.ts';

const ENV = { OTEA_HOME: process.env.OTEA_HOME };

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });
const commit = (repo: string, message = 'init') =>
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-m', message);

describe('repos', () => {
  let folder: string;
  let project: Project;

  // A repo in the product folder, with an origin when given one.
  const repo = (name: string, origin?: string) => {
    const dir = join(folder, name);
    mkdirSync(dir);
    git(dir, 'init', '--quiet');
    if (origin) git(dir, 'remote', 'add', 'origin', origin);
    return dir;
  };

  beforeEach(() => {
    folder = realpathSync.native(mkdtempSync(join(tmpdir(), 'otea-repos-')));
    repo('api', 'https://github.com/acme/api.git');
    repo('web', 'git@github.com:acme/web.git');
    project = initProject(folder, { local: true }, ENV);
  });

  afterEach(() => {
    project.db.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('reads in the repos at the project folder the first time, by their folder names', () => {
    expect(listRepos(project, ENV)).toEqual([
      { name: 'api', identity: 'remote:github.com/acme/api' },
      { name: 'web', identity: 'remote:github.com/acme/web' },
    ]);
  });

  it('knows a clone in another folder, or with its origin in another form, by the repo’s name', () => {
    listRepos(project, ENV);
    const copy = repo('api-copy', 'ssh://git@GitHub.com/acme/api');
    mkdirSync(join(copy, 'src'));

    expect(repoNameAt(project, copy, ENV)).toBe('api');
    expect(repoNameAt(project, join(copy, 'src'), ENV)).toBe('api');
  });

  it('knows a worktree of a repo by the repo’s name', () => {
    const api = join(folder, 'api');
    commit(api);
    listRepos(project, ENV);
    const tree = join(folder, 'api-feature');
    git(api, 'worktree', 'add', '--quiet', '-b', 'feature', tree);

    expect(repoNameAt(project, tree, ENV)).toBe('api');
  });

  it('knows a repo without an origin by its root commit', () => {
    const local = repo('tools');
    commit(local);
    listRepos(project, ENV);
    const clone = join(folder, 'tools-copy');
    git(folder, 'clone', '--quiet', local, clone);
    git(clone, 'remote', 'remove', 'origin');

    expect(repoNameAt(project, clone, ENV)).toBe('tools');
  });

  it('refuses to name a repo it does not know, or cannot tell by anything', () => {
    listRepos(project, ENV);
    const other = repo('other', 'https://github.com/acme/other');
    const bare = repo('bare');

    expect(() => repoNameAt(project, other, ENV)).toThrow(UnknownRepo);
    expect(() => repoNameAt(project, other, ENV)).toThrow(/otea repos add/);
    expect(() => repoNameAt(project, bare, ENV)).toThrow(/no origin remote and no commit/);
    expect(() => repoNameAt(project, folder, ENV)).not.toThrow(UnknownRepo);
  });

  it('leaves out, at the first read, a repo two folders name differently or a name two repos take', () => {
    repo('api-copy', 'https://github.com/acme/api');
    const nested = join(folder, 'old');
    mkdirSync(nested);
    const web = join(nested, 'web');
    mkdirSync(web);
    git(web, 'init', '--quiet');
    git(web, 'remote', 'add', 'origin', 'https://github.com/old/web');

    expect(listRepos(project, ENV)).toEqual([]);
  });

  it('adds a repo under its folder name or a name given, renames it, and forgets it', () => {
    listRepos(project, ENV);
    const other = repo('other', 'https://github.com/acme/other');

    expect(addRepo(project, other, undefined, ENV)).toEqual({
      name: 'other',
      identity: 'remote:github.com/acme/other',
    });
    expect(addRepo(project, other, 'billing', ENV).name).toBe('billing');
    expect(repoNameAt(project, other, ENV)).toBe('billing');
    expect(() => addRepo(project, other, 'api', ENV)).toThrow(/"api" already names another repo/);
    // Repo names match whatever their case in a gate check, so a case apart is no other name.
    expect(() => addRepo(project, other, 'API', ENV)).toThrow(/"api" already names another repo/);
    expect(addRepo(project, other, 'Billing', ENV).name).toBe('Billing');
    expect(removeRepo(project, 'billing', ENV).name).toBe('Billing');
    expect(listRepos(project, ENV).map(({ name }) => name)).toEqual(['api', 'web']);
  });
});
