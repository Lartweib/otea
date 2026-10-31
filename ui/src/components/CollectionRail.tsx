import { Button, Icon } from '../kit/index.ts';
import type { RailEntry } from '../workspace.ts';

type CollectionRailProps = {
  entries: RailEntry[];
  yoursTotal: number;
  openTotal: number;
  selected: string | undefined;
  onSelect: (collection: string | undefined) => void;
  hidden: boolean;
  // Folds the sidebar away, from its own header.
  onToggle?: () => void;
};

// Folds the collections sidebar away, or brings it back: the list keeps its width and the detail
// takes the room.
export function SidebarToggle({
  shown,
  onToggle,
  className = '',
}: {
  shown: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const tip = shown ? 'Hide collections · f' : 'Show collections · f';
  return (
    <Button
      variant="quiet"
      size="sm"
      icon
      className={`sidebar-toggle tip ${className}`.trim()}
      data-tip={tip}
      aria-label={tip}
      aria-expanded={shown}
      aria-controls="collections"
      aria-keyshortcuts="f"
      onClick={onToggle}
    >
      <Icon name="sidebar" />
    </Button>
  );
}

function Count({ yours, open }: { yours: number; open: number }) {
  return (
    <span className="rail-count">
      <span className="rail-yours" title="waiting for you">
        {yours}
      </span>
      <span className="t-cap">/ {open}</span>
    </span>
  );
}

// The collections of the project: choosing one filters the list. Counts are what waits for you / open.
export function CollectionRail({
  entries,
  yoursTotal,
  openTotal,
  selected,
  onSelect,
  hidden,
  onToggle,
}: CollectionRailProps) {
  return (
    <nav id="collections" className="rail" aria-label="Collections" inert={hidden}>
      <div className="rail-head">
        <span className="t-label rail-label">collections</span>
        {onToggle ? <SidebarToggle shown onToggle={onToggle} /> : null}
      </div>
      <button
        type="button"
        className="rail-entry"
        aria-pressed={selected === undefined}
        onClick={() => onSelect(undefined)}
      >
        <span>All items</span>
        <Count yours={yoursTotal} open={openTotal} />
      </button>
      {entries.map((entry) => (
        <button
          key={entry.name}
          type="button"
          className="rail-entry"
          aria-pressed={selected === entry.name}
          onClick={() => onSelect(entry.name)}
        >
          <span className="rail-name">{entry.name}</span>
          <Count yours={entry.yours} open={entry.open} />
        </button>
      ))}
    </nav>
  );
}
