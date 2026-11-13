// What identifies a git repo across moves: its origin URL and its root commits. Either may be
// unknown (no remote, no commit yet, not a repo).
export type RepoFingerprint = { remoteUrl: string | null; rootCommit: string | null };

export type RepoMatch = 'same' | 'different' | 'unknown';

// One remote, however it is written: `host/path` for a remote on a host, in its https, ssh, scp
// (`git@host:path`) or git form, without the user, port or trailing `.git`, the host lowercased
// (the path keeps its case, which a host may tell apart); a local remote by its path, with forward
// slashes and a lowercase drive letter.
export function normalizeRemoteUrl(url: string): string {
  let rest = url.trim().replaceAll('\\', '/');
  let host = '';
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(rest);
  if (scheme) {
    rest = rest.slice(scheme[0].length);
    if (scheme[1]?.toLowerCase() !== 'file') {
      const slash = rest.indexOf('/');
      const authority = slash === -1 ? rest : rest.slice(0, slash);
      host = authority.replace(/^.*@/, '').replace(/:\d*$/, '');
      rest = slash === -1 ? '' : rest.slice(slash);
    }
  } else {
    // An scp-like `[user@]host:path`; a one-letter "host" is a Windows drive.
    const scp = /^(?:[^@/]+@)?([^/:]{2,}):(.*)$/.exec(rest);
    if (scp) {
      host = scp[1] ?? '';
      rest = scp[2] ?? '';
    }
  }
  const path = rest.replace(/\/+$/, '').replace(/\.git$/i, '');
  if (host) return `${host.toLowerCase()}/${path.replace(/^\/+/, '')}`;
  return path.replace(/^\/([a-z]:)/i, '$1').replace(/^[a-z]:/i, (drive) => drive.toLowerCase());
}

// What a project knows a repo by: its origin remote (`remote:<normalized URL>`), or its root
// commits (`root:<sha …>`) when it has no origin; null when it has neither (no remote, no commit).
export function repoIdentity({ remoteUrl, rootCommit }: RepoFingerprint): string | null {
  if (remoteUrl) return `remote:${normalizeRemoteUrl(remoteUrl)}`;
  if (rootCommit) return `root:${rootCommit}`;
  return null;
}

// The same repo when the remote URL or the root commit matches; different when one of them could
// be compared and none matched; unknown when neither could be compared.
export function compareRepos(a: RepoFingerprint, b: RepoFingerprint): RepoMatch {
  const pairs: Array<[string | null, string | null]> = [
    [
      a.remoteUrl && normalizeRemoteUrl(a.remoteUrl),
      b.remoteUrl && normalizeRemoteUrl(b.remoteUrl),
    ],
    [a.rootCommit, b.rootCommit],
  ];
  const comparable = pairs.filter(([x, y]) => x && y);
  if (comparable.length === 0) return 'unknown';
  return comparable.some(([x, y]) => x === y) ? 'same' : 'different';
}
