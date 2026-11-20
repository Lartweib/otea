import { describe, expect, it } from 'vitest';
import { compareRepos, repoIdentity } from './repo.ts';

const repo = (remoteUrl: string | null, rootCommit: string | null) => ({ remoteUrl, rootCommit });

describe('compareRepos', () => {
  // Same on the remote URL (a trailing .git or slash, https or ssh alike) or on the root commit
  // when the remotes differ or are missing; different when something compared and nothing
  // matched; unknown when neither can be compared.
  it.each([
    [repo('https://h/o/r.git', null), repo('https://h/o/r/', 'c1'), 'same'],
    [repo('https://h/o/a', 'c1'), repo('https://h/o/b', 'c1'), 'same'],
    [repo(null, 'c1'), repo('https://h/o/b', 'c1'), 'same'],
    [repo('https://h/o/a', 'c1'), repo('https://h/o/b', 'c2'), 'different'],
    [repo(null, 'c1'), repo('https://h/o/b', 'c2'), 'different'],
    [repo(null, null), repo('https://h/o/b', 'c2'), 'unknown'],
    [repo('https://h/o/a', null), repo(null, 'c2'), 'unknown'],
    [repo('git@github.com:acme/api.git', null), repo('https://github.com/acme/api', null), 'same'],
  ])('compares %j with %j as %s', (a, b, expected) => {
    expect(compareRepos(a, b)).toBe(expected);
  });
});

describe('repoIdentity', () => {
  it('names the same remote alike in its https, ssh and scp forms', () => {
    const forms = [
      'https://github.com/acme/api.git',
      'https://GitHub.com/acme/api',
      'http://github.com/acme/api/',
      'https://user:token@github.com/acme/api.git',
      'ssh://git@github.com/acme/api.git',
      'ssh://git@GITHUB.COM:22/acme/api',
      'git@github.com:acme/api.git',
      'github.com:acme/api',
      'git://github.com/acme/api.git',
    ];
    for (const url of forms) {
      expect(repoIdentity(repo(url, 'c1')), url).toBe('remote:github.com/acme/api');
    }
  });

  it('keeps the case of the path, which a host may tell apart', () => {
    expect(repoIdentity(repo('https://h.io/Acme/Api', null))).toBe('remote:h.io/Acme/Api');
  });

  it('names a local remote by its path, whatever its slashes or drive letter case', () => {
    expect(repoIdentity(repo('D:\\work\\remotes\\api.git', null))).toBe(
      'remote:d:/work/remotes/api',
    );
    expect(repoIdentity(repo('file:///D:/work/remotes/api.git', null))).toBe(
      'remote:d:/work/remotes/api',
    );
    expect(repoIdentity(repo('/srv/git/api.git/', null))).toBe('remote:/srv/git/api');
    expect(repoIdentity(repo('file:///srv/git/api', null))).toBe('remote:/srv/git/api');
  });

  it('falls back to the root commit without an origin, and is null with neither', () => {
    expect(repoIdentity(repo(null, 'c1 c2'))).toBe('root:c1 c2');
    expect(repoIdentity(repo(null, null))).toBeNull();
  });
});
