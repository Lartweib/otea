export type SeverityLevel = 0 | 1 | 2 | 3 | 4;

const BARS = [1, 2, 3, 4] as const;

// Four signal bars. Level 4 uses the warning hue, never your accent.
export function Severity({ level }: { level: SeverityLevel }) {
  return (
    <span className="sev" role="img" aria-label={`Severity ${level} of 4`}>
      {BARS.map((bar) => (
        <i key={bar} className={bar > level ? undefined : level === 4 ? 'hot' : 'on'} />
      ))}
    </span>
  );
}
