export type IconName =
  | 'plus'
  | 'sun'
  | 'moon'
  | 'system'
  | 'modules'
  | 'cards'
  | 'left'
  | 'right'
  | 'close'
  | 'chevron'
  | 'link'
  | 'branch'
  | 'sidebar'
  | 'list'
  | 'grid'
  | 'filter'
  | 'group'
  | 'up'
  | 'done'
  | 'warn'
  | 'lock'
  | 'external'
  | 'activity'
  | 'attach'
  | 'check'
  | 'eye'
  | 'sliders'
  | 'image'
  | 'video'
  | 'code'
  | 'log'
  | 'diagram';

const PATHS: Record<IconName, string> = {
  plus: 'M8 3.5 V12.5 M3.5 8 H12.5',
  sun: 'M8 5.25 A2.75 2.75 0 1 0 8 10.75 A2.75 2.75 0 1 0 8 5.25 M8 1.75 V3 M8 13 V14.25 M1.75 8 H3 M13 8 H14.25 M3.6 3.6 L4.45 4.45 M11.55 11.55 L12.4 12.4 M3.6 12.4 L4.45 11.55 M11.55 4.45 L12.4 3.6',
  moon: 'M12.9 9.6 A5.25 5.25 0 1 1 6.4 3.1 A4.25 4.25 0 0 0 12.9 9.6 Z',
  system: 'M2.5 3.5 H13.5 V10.5 H2.5 Z M6 13.25 H10 M8 10.5 V13.25',
  modules:
    'M2.75 2.75 H6.75 V6.75 H2.75 Z M9.25 2.75 H13.25 V6.75 H9.25 Z M2.75 9.25 H6.75 V13.25 H2.75 Z M9.25 9.25 H13.25 V13.25 H9.25 Z',
  cards: 'M5 5 H13.5 V13.5 H5 Z M2.5 11 V2.5 H11',
  left: 'M13 8 H3 M7 4 L3 8 L7 12',
  right: 'M3 8 H13 M9 4 L13 8 L9 12',
  close: 'M4.75 4.75 L11.25 11.25 M11.25 4.75 L4.75 11.25',
  chevron: 'M5 6.5 L8 9.5 L11 6.5',
  link: 'M6.75 9.25 L9.25 6.75 M7.25 4.75 L8.4 3.6 A2.47 2.47 0 0 1 12.4 7.6 L11.25 8.75 M8.75 11.25 L7.6 12.4 A2.47 2.47 0 0 1 3.6 8.4 L4.75 7.25',
  sidebar:
    'M3.5 2.75 H12.5 A0.75 0.75 0 0 1 13.25 3.5 V12.5 A0.75 0.75 0 0 1 12.5 13.25 H3.5 A0.75 0.75 0 0 1 2.75 12.5 V3.5 A0.75 0.75 0 0 1 3.5 2.75 Z M6.25 2.75 V13.25',
  branch: 'M5 2.5 V13.5 M5 5.5 C5 8 7 8 9.5 8 H12.5 M5 9.5 C5 12 7 12 9.5 12 H12.5',
  list: 'M2.75 3.5 H13.25 M2.75 6 H9.5 M2.75 10 H13.25 M2.75 12.5 H9.5',
  grid: 'M3.25 2.75 H12.75 A0.5 0.5 0 0 1 13.25 3.25 V12.75 A0.5 0.5 0 0 1 12.75 13.25 H3.25 A0.5 0.5 0 0 1 2.75 12.75 V3.25 A0.5 0.5 0 0 1 3.25 2.75 Z M2.75 6.25 H13.25 M2.75 9.75 H13.25 M6.25 2.75 V13.25',
  filter: 'M2.75 4.25 H13.25 M4.75 8 H11.25 M6.75 11.75 H9.25',
  group: 'M2.75 3.25 H8 M5 5.75 H13.25 M5 8.25 H13.25 M2.75 10.75 H8 M5 13.25 H13.25',
  up: 'M8 12.5 V3.75 M4.75 7 L8 3.75 L11.25 7',
  done: 'M8 1.75 A6.25 6.25 0 1 0 8 14.25 A6.25 6.25 0 1 0 8 1.75 M5.4 8.2 L7.2 10 L10.7 6.3',
  lock: 'M5.25 7.25 H10.75 A1.25 1.25 0 0 1 12 8.5 V11.75 A1.25 1.25 0 0 1 10.75 13 H5.25 A1.25 1.25 0 0 1 4 11.75 V8.5 A1.25 1.25 0 0 1 5.25 7.25 Z M5.75 7.25 V5.5 A2.25 2.25 0 0 1 10.25 5.5 V7.25',
  external: 'M6 3.75 H12.25 V10 M12.25 3.75 L4 12',
  activity: 'M1.75 8.5 H4.5 L6.25 4 L9.5 12.25 L11.25 8.5 H14.25',
  warn: 'M8 1.75 A6.25 6.25 0 1 0 8 14.25 A6.25 6.25 0 1 0 8 1.75 M8 4.9 V8.6 M8 11 V11.1',
  attach: 'M8 10.25 V2.75 M5 5.5 L8 2.5 L11 5.5 M2.75 9.75 V13 H13.25 V9.75',
  check: 'M3.5 8.5 L6.5 11.25 L12.5 4.75',
  sliders: 'M2.75 5 H6.5 M11.5 5 H13.25 M9 3 V7 M2.75 11 H4.5 M9.5 11 H13.25 M7 9 V13',
  image:
    'M3.25 2.75 H12.75 A0.5 0.5 0 0 1 13.25 3.25 V12.75 A0.5 0.5 0 0 1 12.75 13.25 H3.25 A0.5 0.5 0 0 1 2.75 12.75 V3.25 A0.5 0.5 0 0 1 3.25 2.75 Z M2.75 11 L6 8 L9 11 L10.75 9.5 L13.25 11.75 M10.5 5.25 A0.75 0.75 0 1 0 10.5 6.75 A0.75 0.75 0 1 0 10.5 5.25',
  video:
    'M3.25 2.75 H12.75 A0.5 0.5 0 0 1 13.25 3.25 V12.75 A0.5 0.5 0 0 1 12.75 13.25 H3.25 A0.5 0.5 0 0 1 2.75 12.75 V3.25 A0.5 0.5 0 0 1 3.25 2.75 Z M6.5 5.5 L10.5 8 L6.5 10.5 Z',
  code: 'M6 4.5 L2.5 8 L6 11.5 M10 4.5 L13.5 8 L10 11.5',
  log: 'M2.75 3.5 H13.25 M2.75 6.5 H13.25 M2.75 9.5 H10 M2.75 12.5 H8',
  diagram:
    'M2.75 2.75 H6.25 V6.25 H2.75 Z M9.75 9.75 H13.25 V13.25 H9.75 Z M6.25 4.5 H11.5 V9.75 M4.5 6.25 V11.5 H9.75',
  eye: 'M1.75 8 C3.5 4.5 12.5 4.5 14.25 8 C12.5 11.5 3.5 11.5 1.75 8 Z M8 6.5 A1.5 1.5 0 1 0 8 9.5 A1.5 1.5 0 1 0 8 6.5',
};

// The mock's icon set (mock:1346-1371), drawn at 16 px with stroke 1.35 (svg.ic). Where a name is
// in both sets, the mock's drawing wins.
export const IC = {
  toca: '<path d="M2.5 9.5h3l1 2h3l1-2h3"/><path d="M2.5 9.5l1.5-5a1 1 0 0 1 1-.7h6a1 1 0 0 1 1 .7l1.5 5v3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/>',
  atasco: '<circle cx="8" cy="8" r="5.5"/><path d="M5.5 8h5"/>',
  bug: '<path d="M5.6 5.4a2.4 2.4 0 0 1 4.8 0"/><path d="M4.6 6.8h6.8v2.9a3.4 3.4 0 0 1-6.8 0z"/><path d="M8 6.8v6.3M2.6 9h2M11.4 9h2M3.2 12.6l1.7-1.1M12.8 12.6l-1.7-1.1M3.2 5.4l1.6 1.1M12.8 5.4l-1.6 1.1"/>',
  paw: '<circle cx="4.6" cy="6.2" r="1.2"/><circle cx="7" cy="3.9" r="1.2"/><circle cx="10" cy="4.1" r="1.2"/><circle cx="12" cy="6.6" r="1.2"/><path d="M5.3 11.6c0-2.1 1.4-3.8 3-3.8s3 1.7 3 3.8c0 1.2-1.3 1.7-3 1.7s-3-.5-3-1.7z"/>',
  book: '<path d="M2.8 3.6h3.6A1.6 1.6 0 0 1 8 5.2v8a1.6 1.6 0 0 0-1.6-1.6H2.8zM13.2 3.6H9.6A1.6 1.6 0 0 0 8 5.2v8a1.6 1.6 0 0 1 1.6-1.6h3.6z"/>',
  board: '<rect x="2.5" y="3" width="11" height="10" rx="1.6"/><path d="M6 3v10"/>',
  plus: '<path d="M8 3.2v9.6M3.2 8h9.6"/>',
  side: '<rect x="2.3" y="3" width="11.4" height="10" rx="1.6"/><path d="M6.2 3v10"/>',
  lista: '<path d="M5.8 4.5h7.7M5.8 8h7.7M5.8 11.5h7.7M2.6 4.5h.01M2.6 8h.01M2.6 11.5h.01"/>',
  tabla:
    '<rect x="2.3" y="3" width="11.4" height="10" rx="1.6"/><path d="M2.3 6.6h11.4M6.4 6.6V13"/>',
  pasos:
    '<rect x="2.4" y="3" width="3" height="10" rx="1"/><rect x="6.5" y="3" width="3" height="7" rx="1"/><rect x="10.6" y="3" width="3" height="4.6" rx="1"/>',
  act: '<path d="M1.8 8.3h2.6l1.6-4.2 3 8.2 1.6-4h3.6"/>',
  link: '<path d="M7 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.6.6"/><path d="M9 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.6-.6"/>',
  sys: '<rect x="2" y="3" width="12" height="8" rx="1.3"/><path d="M6 13.5h4M8 11v2.5"/>',
  sun: '<circle cx="8" cy="8" r="2.6"/><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1"/>',
  moon: '<path d="M12.6 9.6A5 5 0 0 1 6.4 3.4a5 5 0 1 0 6.2 6.2z"/>',
  x: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
  check: '<path d="M3.5 8.5l3 3 6-7"/>',
  inbox:
    '<path d="M2.5 9.5h3l1 2h3l1-2h3"/><path d="M2.5 9.5l1.5-5a1 1 0 0 1 1-.7h6a1 1 0 0 1 1 .7l1.5 5v3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/>',
  triage: '<rect x="3" y="5" width="10" height="8" rx="1.4"/><path d="M4.6 3h6.8"/>',
  group: '<path d="M2.5 4.5h11M4.5 8h9M6.5 11.5h7"/>',
  filter: '<path d="M2.5 3.5h11l-4.2 5v4l-2.6 1.2V8.5z"/>',
  amp: '<path d="M9.5 2.5h4v4M13.5 2.5l-4.5 4.5M6.5 13.5h-4v-4M2.5 13.5 7 9"/>',
  red: '<path d="M13.5 6.5h-4v-4M9.5 6.5l4.5-4.5M2.5 9.5h4v4M6.5 9.5 2 14"/>',
} as const;

export type MockIconName = keyof typeof IC;

const isMock = (name: string): name is MockIconName => name in IC;

// Thin, small and quiet: 16px, current colour. The mock's set on svg.ic, today's on .icon too.
export function Icon({ name, className }: { name: IconName | MockIconName; className?: string }) {
  if (isMock(name)) {
    return (
      <svg
        className={className ? `ic icon ${className}` : 'ic icon'}
        width="16"
        height="16"
        viewBox="0 0 16 16"
        aria-hidden="true"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: the fixed icon markup above
        dangerouslySetInnerHTML={{ __html: IC[name] }}
      />
    );
  }
  return (
    <svg
      className={className ? `ic icon ${className}` : 'ic icon'}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
