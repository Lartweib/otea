export function idFromHash(hash: string): string | undefined {
  try {
    return decodeURIComponent(hash.replace(/^#/, '')) || undefined;
  } catch {
    return undefined;
  }
}

export function hashFor(id: string): string {
  return `#${encodeURIComponent(id)}`;
}
