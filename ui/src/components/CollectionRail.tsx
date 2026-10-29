import type { RailEntry } from '../workspace.ts';

type CollectionRailProps = {
  entries: RailEntry[];
  yoursTotal: number;
  openTotal: number;
  selected: string | undefined;
  onSelect: (collection: string | undefined) => void;
  hidden: boolean;
};

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
}: CollectionRailProps) {
  return (
    <nav className="rail" aria-label="Collections" inert={hidden}>
      <span className="t-label rail-label">collections</span>
      <button
        type="button"
        className="rail-entry"
        aria-pressed={selected === undefined}
        onClick={() => onSelect(undefined)}
      >
        <span>all items</span>
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
