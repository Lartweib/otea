// What identifies a git repo across moves: its origin URL and its root commits. Either may be
// unknown (no remote, no commit yet, not a repo).
export type RepoFingerprint = { remoteUrl: string | null; rootCommit: string | null };

export type RepoMatch = 'same' | 'different' | 'unknown';

// A trailing slash or `.git` does not make another remote.
function normalizeUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
}

// The same repo when the remote URL or the root commit matches; different when one of them could
// be compared and none matched; unknown when neither could be compared.
export function compareRepos(a: RepoFingerprint, b: RepoFingerprint): RepoMatch {
  const pairs: Array<[string | null, string | null]> = [
    [a.remoteUrl && normalizeUrl(a.remoteUrl), b.remoteUrl && normalizeUrl(b.remoteUrl)],
    [a.rootCommit, b.rootCommit],
  ];
  const comparable = pairs.filter(([x, y]) => x && y);
  if (comparable.length === 0) return 'unknown';
  return comparable.some(([x, y]) => x === y) ? 'same' : 'different';
}
