export type IconName = 'plus' | 'sun' | 'moon' | 'system';

const PATHS: Record<IconName, string> = {
  plus: 'M8 3.5 V12.5 M3.5 8 H12.5',
  sun: 'M8 5.25 A2.75 2.75 0 1 0 8 10.75 A2.75 2.75 0 1 0 8 5.25 M8 1.75 V3 M8 13 V14.25 M1.75 8 H3 M13 8 H14.25 M3.6 3.6 L4.45 4.45 M11.55 11.55 L12.4 12.4 M3.6 12.4 L4.45 11.55 M11.55 4.45 L12.4 3.6',
  moon: 'M12.9 9.6 A5.25 5.25 0 1 1 6.4 3.1 A4.25 4.25 0 0 0 12.9 9.6 Z',
  system: 'M2.5 3.5 H13.5 V10.5 H2.5 Z M6 13.25 H10 M8 10.5 V13.25',
};

// Thin, small and quiet: 16px, stroke 1.25, current color.
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
