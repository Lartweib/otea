const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const SLUG_MAX = 32;

export const PROJECT_ID_RANDOM_BYTES = 6;

// Lowercase ASCII letters and digits joined by single dashes; accents fold to their base letter.
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'project' : slug;
}

// `<slug>-<6 base32 chars>`, one char per random byte. The slug is for people; the suffix keeps two
// projects with the same folder name apart.
export function projectId(name: string, random: Uint8Array): string {
  const suffix = Array.from(random.subarray(0, PROJECT_ID_RANDOM_BYTES), (b) => BASE32[b & 31]);
  return `${slugify(name)}-${suffix.join('')}`;
}
