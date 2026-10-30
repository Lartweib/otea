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
  | 'branch';

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
  branch: 'M5 2.5 V13.5 M5 5.5 C5 8 7 8 9.5 8 H12.5 M5 9.5 C5 12 7 12 9.5 12 H12.5',
};

// Thin, small and quiet: 16px, stroke 1.25, current color.
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
