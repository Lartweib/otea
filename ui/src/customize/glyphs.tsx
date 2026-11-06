import type { ChangeKind } from './types.ts';

const svg = (size: number, d: string) => (
  <svg
    className="icon"
    width={size}
    height={size}
    viewBox={`0 0 ${size} ${size}`}
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

export const Grip = () => (
  <svg className="cz-grip" width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
    {[3, 8, 13].flatMap((y) =>
      [3, 7].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" />),
    )}
  </svg>
);
export const Undo = () => (
  <svg className="icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M4.5 2.5 L2 5 L4.5 7.5 M2 5 H8 A3.5 3.5 0 0 1 8 12 H5" />
  </svg>
);
export const Redo = () => (
  <svg className="icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M9.5 2.5 L12 5 L9.5 7.5 M12 5 H6 A3.5 3.5 0 0 0 6 12 H9" />
  </svg>
);
export const Down = () => svg(12, 'M6 2.5 V9.5 M3 6.5 L6 9.5 L9 6.5');
export const Up = () => svg(12, 'M6 9.5 V2.5 M3 5.5 L6 2.5 L9 5.5');
export const Chevron = () => svg(12, 'M2.75 4.5 L6 7.75 L9.25 4.5');
export const Tick = () => svg(12, 'M2.5 6.2 L5 8.6 L9.5 3.6');
export const Cross = () => svg(12, 'M3 3 L9 9 M9 3 L3 9');
export const Plus = () => svg(12, 'M6 2.5 V9.5 M2.5 6 H9.5');

const GLYPHS: Record<ChangeKind, string> = {
  move: 'M2 7 H12 M8.5 3.5 L12 7 L8.5 10.5',
  new: 'M7 2.5 V11.5 M2.5 7 H11.5',
  hidden:
    'M2.2 8.6 C1.9 8.2 1.7 7.9 1.5 7 C3.3 3.9 8.8 3.4 11.5 5.6 M12.5 7 C10.9 9.8 6.6 10.5 4 9.2 M2.5 11.5 L11.5 2.5',
  gone: 'M2.5 7 H11.5',
  other: 'M2.5 11.5 L3.1 9 L9.4 2.7 A1.2 1.2 0 0 1 11.3 4.6 L5 10.9 Z',
};
export const ChangeGlyph = ({ kind }: { kind: ChangeKind }) => svg(14, GLYPHS[kind]);
