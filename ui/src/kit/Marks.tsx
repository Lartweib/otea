import type { ChangeEvent, CSSProperties, InputHTMLAttributes, ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { agentHue, initialsOf } from '../agent-mark.ts';
import { t } from '../i18n/i18n.ts';

// The five hues an agent's mark takes, by the bucket of its name (SPEC §1).
export const AGENT_HUE_DEGREES = [150, 32, 318, 212, 75] as const;

export const agentHueDegrees = (name: string): number => AGENT_HUE_DEGREES[agentHue(name)] ?? 266;

type AgentMarkProps = {
  // The agent; null or undefined for nobody.
  name?: string | null;
  // Your mark instead of an agent's.
  you?: boolean;
  className?: string;
  // Hidden from assistive tech when the name is written next to it.
  decorative?: boolean;
};

// Who holds an item, as a small chip (mock:301-303): an agent's lowercase initials in its hue, "tú"
// for you, a dash for nobody.
export function AgentMark({ name, you = false, className, decorative = false }: AgentMarkProps) {
  const cls = (extra: string) => ['mk', extra, className].filter(Boolean).join(' ');
  if (you) {
    return (
      <span
        className={cls('you')}
        title={decorative ? undefined : t('mark.you')}
        aria-hidden={decorative || undefined}
      >
        {t('mark.you')}
      </span>
    );
  }
  if (!name) {
    return (
      <span className={cls('none')} aria-hidden="true">
        —
      </span>
    );
  }
  return (
    <span
      className={cls('')}
      style={{ '--h': agentHueDegrees(name) } as CSSProperties}
      title={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
    >
      {initialsOf(name)}
    </span>
  );
}

// Four bars that rise; the fourth level in warn (mock:304-308). level 0..3, or null for none.
export function SeverityBars({ level, label }: { level: number | null; label?: string }) {
  if (level == null) return null;
  return (
    <span
      className={`svb s${level + 1}`}
      role="img"
      aria-label={label ?? t('severity.bars', { level: level + 1 })}
      title={label}
    >
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i <= level ? 'on' : undefined} />
      ))}
    </span>
  );
}

// A state, as a mono pill: tinted when it is yours, quiet when closed (mock:467-469).
export function StepPill({
  children,
  tone,
  title,
}: {
  children: ReactNode;
  tone?: 'you' | 'none';
  title?: string;
}) {
  return (
    <span className={tone ? `stp-pill ${tone}` : 'stp-pill'} title={title}>
      {children}
    </span>
  );
}

// An enum's value, on a well (mock:470).
export function EnumChip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="enum" title={title}>
      {children}
    </span>
  );
}

// A project's or a board's monogram on a small tile (mock:137-138).
export function Tile({ children, large = false }: { children: ReactNode; large?: boolean }) {
  return (
    <span className={large ? 'tile lg' : 'tile'} aria-hidden="true">
      {children}
    </span>
  );
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
};

// The mock's tick box (mock:461-465): ink when checked, a dash when some are.
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  className,
  ...rest
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={className ? `ck ${className}` : 'ck'}
      checked={checked}
      onChange={(event) => onChange?.(event.target.checked, event)}
      {...rest}
    />
  );
}

// The chevron of a pill or a menu trigger (mock:1373-1374): it turns over while its button is
// aria-expanded.
export function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg className="chev" viewBox="0 0 12 12" aria-hidden="true">
      <path d={up ? 'M3.25 7.25 6 4.5l2.75 2.75' : 'M3.25 4.75 6 7.5l2.75-2.75'} />
    </svg>
  );
}

// The person at the rail's foot, for Preferences (mock:1375).
export function Buddy({ size = 16 }: { size?: number }) {
  return (
    <svg className="buddy" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <ellipse cx="8.3" cy="4.5" rx="3.1" ry="2.9" transform="rotate(-10 8.3 4.5)" />
      <path d="M3.3 15c0-3.7 2.1-6.7 4.9-6.7s4.9 3 4.9 6.7z" />
    </svg>
  );
}
