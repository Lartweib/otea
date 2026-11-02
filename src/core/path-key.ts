// The form a real path is compared in: forward slashes, and lowercase where the file system usually
// ignores case (Windows, macOS).
export function pathKey(realPath: string, platform: NodeJS.Platform): string {
  const slashed = realPath.replaceAll('\\', '/');
  return platform === 'win32' || platform === 'darwin' ? slashed.toLowerCase() : slashed;
}

function contains(outer: string, inner: string): boolean {
  if (inner === outer) return true;
  return inner.startsWith(outer.endsWith('/') ? outer : `${outer}/`);
}

// The entry whose path is `key` or the nearest folder above it, so a nested path wins over its parent.
export function longestContaining<T extends { pathKey: string }>(
  entries: readonly T[],
  key: string,
): T | undefined {
  let best: T | undefined;
  for (const entry of entries) {
    if (!contains(entry.pathKey, key)) continue;
    if (!best || entry.pathKey.length > best.pathKey.length) best = entry;
  }
  return best;
}
