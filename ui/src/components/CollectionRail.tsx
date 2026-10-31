import { Button, Icon } from '../kit/index.ts';
import type { RailEntry } from '../workspace.ts';

type CollectionRailProps = {
  entries: RailEntry[];
  yoursTotal: number;
  openTotal: number;
  selected: string | undefined;
  onSelect: (collection: string | undefined) => void;
  // Folded to its strip: only the toggle stays.
  hidden: boolean;
  // Folds the sidebar to its strip or opens it, from its own header.
  onToggle?: () => void;
};

// Folds the collections sidebar to a strip that holds only this button, or opens it again. The
// button leads the sidebar's header and never moves: the list keeps its width and slides over, and
// the detail takes the room.
function SidebarToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const label = shown ? 'Hide collections' : 'Show collections';
  return (
    <Button
      variant="quiet"
      size="sm"
      icon
      className="sidebar-toggle tip"
      data-tip={`${label} · f`}
      aria-label={label}
      aria-expanded={shown}
      aria-controls="collection-list"
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
    <nav id="collections" className="rail" aria-label="Collections">
      <div className="rail-head">
        {onToggle ? <SidebarToggle shown={!hidden} onToggle={onToggle} /> : null}
        <span className="t-label rail-label" inert={hidden}>
          collections
        </span>
      </div>
      <div id="collection-list" className="rail-entries" inert={hidden}>
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
      </div>
    </nav>
  );
}
