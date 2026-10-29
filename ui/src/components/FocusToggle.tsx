import { Button } from '../kit/index.ts';

// Four corners. Both paths use the same commands, so the corners slide out to expand and in to collapse.
const EXPAND = 'M2.5 6 V2.5 H6 M10 2.5 H13.5 V6 M13.5 10 V13.5 H10 M6 13.5 H2.5 V10';
const COLLAPSE = 'M6 2.5 V6 H2.5 M13.5 6 H10 V2.5 M10 13.5 V10 H13.5 M2.5 10 H6 V13.5';

type FocusToggleProps = { focus: boolean; onToggle: () => void };

export function FocusToggle({ focus, onToggle }: FocusToggleProps) {
  const tip = focus ? 'Collapse · esc' : 'Expand · f';
  return (
    <Button
      variant="quiet"
      size="sm"
      icon
      className="focus-toggle tip"
      data-tip={tip}
      aria-label={focus ? 'Collapse the detail' : 'Expand the detail'}
      aria-keyshortcuts={focus ? 'Escape' : 'f'}
      onClick={onToggle}
    >
      <svg className="icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path className="focus-corners" style={{ d: `path('${focus ? COLLAPSE : EXPAND}')` }} />
      </svg>
    </Button>
  );
}
