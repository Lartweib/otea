import { describe, expect, it } from 'vitest';
import { compareRepos } from './repo.ts';

const repo = (remoteUrl: string | null, rootCommit: string | null) => ({ remoteUrl, rootCommit });

describe('compareRepos', () => {
  it('matches on the remote URL, ignoring a trailing .git or slash', () => {
    expect(compareRepos(repo('https://h/o/r.git', null), repo('https://h/o/r/', 'c1'))).toBe(
      'same',
    );
  });

  it('matches on the root commit when the remotes differ or are missing', () => {
    expect(compareRepos(repo('https://h/o/a', 'c1'), repo('https://h/o/b', 'c1'))).toBe('same');
    expect(compareRepos(repo(null, 'c1'), repo('https://h/o/b', 'c1'))).toBe('same');
  });

  it('tells repos apart when something compared and nothing matched', () => {
    expect(compareRepos(repo('https://h/o/a', 'c1'), repo('https://h/o/b', 'c2'))).toBe(
      'different',
    );
    expect(compareRepos(repo(null, 'c1'), repo('https://h/o/b', 'c2'))).toBe('different');
  });

  it('is unknown when neither can be compared', () => {
    expect(compareRepos(repo(null, null), repo('https://h/o/b', 'c2'))).toBe('unknown');
    expect(compareRepos(repo('https://h/o/a', null), repo(null, 'c2'))).toBe('unknown');
  });
});
