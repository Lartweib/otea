import { isEvidenceModule } from './evidence.ts';
import type { EvidenceRole, LayoutEntry, LayoutSlot, TypeView } from './types.ts';

// The files a new item is filed with: the server's limits (src/core/evidence.ts, src/server/writes.ts).
export const MAX_FILE_MB = 50;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
export const MAX_FILES = 10;

const SLOTS: readonly LayoutSlot[] = ['evidence', 'body', 'side', 'phone'];

// A file picked, dropped or pasted, before the item exists. key tells two picks of one file apart.
export type FileDraft = { key: string; file: File; role: EvidenceRole };

// The roles a file of this type can take: a type with no evidence module takes any; a compare takes
// a before and an after, every other module single files. One role offered is no choice at all.
export function rolesFor(type: TypeView): EvidenceRole[] {
  const modules = SLOTS.flatMap((slot) => type.layout[slot].filter(isEvidenceModule));
  if (modules.length === 0) return ['single', 'before', 'after'];
  const isCompare = ({ module, variant }: LayoutEntry) =>
    module === 'images' && variant === 'compare';
  const single: EvidenceRole[] = modules.some((entry) => !isCompare(entry)) ? ['single'] : [];
  const pair: EvidenceRole[] = modules.some(isCompare) ? ['before', 'after'] : [];
  return [...single, ...pair];
}

export function firstRole(roles: readonly EvidenceRole[]): EvidenceRole {
  return roles[0] ?? 'single';
}

const IMAGE = /\.(gif|png|jpe?g|webp)$/i;

// Only the formats evidence shows inline as images get a thumbnail (never SVG).
export function isImage(name: string): boolean {
  return IMAGE.test(name);
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function tooLarge(file: Pick<File, 'size'>): boolean {
  return file.size > MAX_FILE_BYTES;
}

// The drafts with the new files after them, as many as fit.
export function withFiles(
  drafts: readonly FileDraft[],
  files: readonly File[],
  role: EvidenceRole,
  key: () => string,
): FileDraft[] {
  const room = Math.max(0, MAX_FILES - drafts.length);
  return [...drafts, ...files.slice(0, room).map((file) => ({ key: key(), file, role }))];
}
