import { SeverityBars } from './Marks.tsx';

export type SeverityLevel = 0 | 1 | 2 | 3 | 4;

// Today's severity (level 1..4 bars lit, 0 none), drawn as the mock's bars.
export function Severity({ level }: { level: SeverityLevel }) {
  return level === 0 ? (
    <span className="svb s0" role="img" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  ) : (
    <SeverityBars level={level - 1} />
  );
}
