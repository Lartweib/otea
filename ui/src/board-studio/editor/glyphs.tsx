import type { PartKind } from '../../../../src/core/board/model.ts';

// The editor's small drawings (mock 40-core.js IC): a mark for each kind of part and the tools of
// the card and the bar, 16 px on a 16 px grid, current colour.

const G = {
  undo: '<path d="M5.5 4L2.8 6.7l2.7 2.7"/><path d="M3 6.7h6.2a3.6 3.6 0 0 1 0 7.2H6.5"/>',
  redo: '<path d="M10.5 4l2.7 2.7-2.7 2.7"/><path d="M13 6.7H6.8a3.6 3.6 0 0 0 0 7.2h2.7"/>',
  left: '<path d="M9.5 3.5L5 8l4.5 4.5"/>',
  right: '<path d="M6.5 3.5L11 8l-4.5 4.5"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>',
  play: '<path d="M5 3.5v9l7-4.5z"/>',
  plus: '<path d="M8 3.2v9.6M3.2 8h9.6"/>',
  x: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
  check: '<path d="M3.5 8.5l3 3 6-7"/>',
  warn: '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.9v3.7M8 11v.1"/>',
  board: '<rect x="2.5" y="3" width="11" height="10" rx="1.6"/><path d="M6 3v10"/>',
  layers: '<rect x="2.5" y="3" width="11" height="10" rx="1.6"/><path d="M6 3v10"/>',
  bug: '<path d="M5.6 5.4a2.4 2.4 0 0 1 4.8 0"/><path d="M4.6 6.8h6.8v2.9a3.4 3.4 0 0 1-6.8 0z"/><path d="M8 6.8v6.3M2.6 9h2M11.4 9h2M3.2 12.6l1.7-1.1M12.8 12.6l-1.7-1.1M3.2 5.4l1.6 1.1M12.8 5.4l-1.6 1.1"/>',
  paw: '<circle cx="4.6" cy="6.2" r="1.2"/><circle cx="7" cy="3.9" r="1.2"/><circle cx="10" cy="4.1" r="1.2"/><circle cx="12" cy="6.6" r="1.2"/><path d="M5.3 11.6c0-2.1 1.4-3.8 3-3.8s3 1.7 3 3.8c0 1.2-1.3 1.7-3 1.7s-3-.5-3-1.7z"/>',
  book: '<path d="M2.8 3.6h3.6A1.6 1.6 0 0 1 8 5.2v8a1.6 1.6 0 0 0-1.6-1.6H2.8zM13.2 3.6H9.6A1.6 1.6 0 0 0 8 5.2v8a1.6 1.6 0 0 1 1.6-1.6h3.6z"/>',
  inbox:
    '<path d="M2.5 9.5h3l1 2h3l1-2h3"/><path d="M2.5 9.5l1.5-5a1 1 0 0 1 1-.7h6a1 1 0 0 1 1 .7l1.5 5v3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/>',
  flask:
    '<path d="M6.3 2.5h3.4M6.8 2.5v4L3.4 12a1 1 0 0 0 .9 1.5h7.4a1 1 0 0 0 .9-1.5L9.2 6.5v-4"/><path d="M4.9 9.6h6.2"/>',
  check2:
    '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5.2 8.2l1.9 1.9 3.8-4.2"/>',
  text: '<path d="M3 4.5h10M8 4.5V12.5"/>',
  long: '<path d="M3 4h10M3 7h10M3 10h10M3 13h6"/>',
  check_k:
    '<rect x="2.5" y="3" width="4" height="4" rx="1"/><path d="M3.4 5l.8.8 1.4-1.6"/><path d="M8.5 5h5M8.5 11h5"/><rect x="2.5" y="9" width="4" height="4" rx="1"/>',
  choice: '<circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="2" fill="currentColor"/>',
  multi:
    '<rect x="2.5" y="2.5" width="5" height="5" rx="1.2"/><rect x="8.5" y="8.5" width="5" height="5" rx="1.2"/><path d="M3.8 5l.9.9 1.6-1.8"/>',
  level: '<path d="M3.5 12.5V10M6.5 12.5V8M9.5 12.5V6M12.5 12.5V3.5"/>',
  number: '<path d="M5.5 2.5l-1.5 11M11.5 2.5l-1.5 11M3 6h10M2.5 10.5h10"/>',
  date: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.6"/><path d="M2.5 6.8h11M5.5 2v3M10.5 2v3"/>',
  yesno:
    '<rect x="2" y="5" width="12" height="6" rx="3"/><circle cx="11" cy="8" r="1.8" fill="currentColor"/>',
  url: '<path d="M7 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.6.6"/><path d="M9 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.6-.6"/>',
  branch:
    '<circle cx="4.5" cy="3.8" r="1.4"/><circle cx="4.5" cy="12.2" r="1.4"/><circle cx="11.5" cy="5.5" r="1.4"/><path d="M4.5 5.2v5.6M11.5 6.9c0 2.6-3 2.6-7 3.9"/>',
  images:
    '<rect x="2.5" y="3" width="11" height="10" rx="1.6"/><circle cx="6" cy="6.5" r="1.2"/><path d="M2.5 11l3.2-3 2.6 2.4 2-1.8 3.2 2.9"/>',
  video: '<rect x="2" y="3.5" width="12" height="9" rx="1.6"/><path d="M6.8 6v4l3.2-2z"/>',
  audio: '<path d="M2.5 8h1M5 5.5v5M7.5 3.5v9M10 6v4M12.5 7.2v1.6"/>',
  code: '<path d="M5.5 4.5L2.5 8l3 3.5M10.5 4.5l3 3.5-3 3.5M9 3l-2 10"/>',
  log: '<path d="M3 4h7M3 7h10M3 10h5M3 13h8"/>',
  diagram:
    '<rect x="2" y="2.5" width="5" height="4" rx="1"/><rect x="9" y="9.5" width="5" height="4" rx="1"/><path d="M4.5 6.5v5h4.5"/>',
  file: '<path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3"/>',
  note: '<path d="M3.5 2.5h6l3 3v8h-9z"/><path d="M5.5 8h5M5.5 10.5h3.5"/>',
  wait: '<path d="M4.5 2.5h7M4.5 13.5h7"/><path d="M5.3 2.5c0 3.2 5.4 3 5.4 5.5s-5.4 2.3-5.4 5.5M10.7 2.5c0 3.2-5.4 3-5.4 5.5s5.4 2.3 5.4 5.5"/>',
  parts:
    '<rect x="2.5" y="2.5" width="5" height="5" rx="1.2"/><rect x="8.5" y="8.5" width="5" height="5" rx="1.2"/><rect x="8.5" y="2.5" width="5" height="5" rx="1.2"/><path d="M5 7.5V11h3.5"/>',
} as const;

export type GlyphName = keyof typeof G;

// The icons a board can wear (Sobre el tablero).
export const BOARD_ICONS: readonly GlyphName[] = [
  'board',
  'bug',
  'paw',
  'book',
  'inbox',
  'flask',
  'check2',
];

export function kindGlyph(kind: PartKind): GlyphName {
  return kind === 'check' ? 'check_k' : kind;
}

export function boardGlyph(icon: string): GlyphName {
  return icon in G ? (icon as GlyphName) : 'board';
}

export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <svg
      className={className ? `ic se-ic ${className}` : 'ic se-ic'}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the fixed drawings above
      dangerouslySetInnerHTML={{ __html: G[name] }}
    />
  );
}

// The small chevron of a blank and a row.
export function Chev() {
  return (
    <svg className="se-chev" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.25 4.75 6 7.5l2.75-2.75" />
    </svg>
  );
}
