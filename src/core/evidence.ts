// Before/after pairs carry no pair id: a viewer pairs the latest before with the latest after.
export const EVIDENCE_ROLES = ['before', 'after', 'single'] as const;

export type EvidenceRole = (typeof EVIDENCE_ROLES)[number];

export type EvidenceKind = 'image' | 'video' | 'diff' | 'log' | 'file';

export type EvidenceType = { kind: EvidenceKind; contentType: string };

export const MAX_EVIDENCE_MB = 50;

export const MAX_EVIDENCE_BYTES = MAX_EVIDENCE_MB * 1024 * 1024;

// Only formats a browser renders without running anything are images and videos. SVG is a
// document that can carry scripts, so it stays an opaque file the server only offers as a download.
const TYPES: Readonly<Record<string, EvidenceType>> = {
  gif: { kind: 'image', contentType: 'image/gif' },
  png: { kind: 'image', contentType: 'image/png' },
  jpg: { kind: 'image', contentType: 'image/jpeg' },
  jpeg: { kind: 'image', contentType: 'image/jpeg' },
  webp: { kind: 'image', contentType: 'image/webp' },
  mp4: { kind: 'video', contentType: 'video/mp4' },
  webm: { kind: 'video', contentType: 'video/webm' },
  mov: { kind: 'video', contentType: 'video/quicktime' },
  diff: { kind: 'diff', contentType: 'text/x-diff' },
  patch: { kind: 'diff', contentType: 'text/x-diff' },
  log: { kind: 'log', contentType: 'text/plain' },
  txt: { kind: 'log', contentType: 'text/plain' },
  svg: { kind: 'file', contentType: 'image/svg+xml' },
};

const OPAQUE: EvidenceType = { kind: 'file', contentType: 'application/octet-stream' };

export function evidenceTypeOf(filename: string): EvidenceType {
  const dot = filename.lastIndexOf('.');
  const extension = dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
  return TYPES[extension] ?? OPAQUE;
}
