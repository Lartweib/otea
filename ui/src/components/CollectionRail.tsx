import { t } from '../i18n/i18n.ts';
import { Button, Icon } from '../kit/index.ts';
import type { RailEntry } from '../workspace.ts';

type CollectionRailProps = {
  entries: RailEntry[];
  yoursTotal: number;
  openTotal: number;
  selected: string | undefined;
  onSelect: (collection: string | undefined) => void;
  // All work leads the list only when the project has two collections or more.
  allWork: boolean;
  // Folded to its strip: only the toggle stays.
  hidden: boolean;
  // Folds the sidebar to its strip or opens it, from its own header.
  onToggle?: () => void;
};

// Folds the collections sidebar to a strip that holds only this button, or opens it again. The
// button leads the sidebar's header and never moves: the list keeps its width and slides over, and
// the detail takes the room.
function SidebarToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const label = t(shown ? 'rail.hide' : 'rail.show');
  return (
    <Button
      variant="quiet"
      size="sm"
      icon
      className="sidebar-toggle tip"
      data-tip={label}
      aria-label={label}
      aria-expanded={shown}
      aria-controls="collection-list"
      onClick={onToggle}
    >
      <Icon name="sidebar" />
    </Button>
  );
}

function Count({ yours, open }: { yours: number; open: number }) {
  return (
    <span className="rail-count">
      <span className="rail-yours" title={t('rail.waiting')}>
        {yours}
      </span>
      <span className="t-cap">/ {open}</span>
    </span>
  );
}

// The collections of the project: choosing one filters the list, All work (two collections or
// more) lists them all as one tree. Counts are what waits for you / open.
export function CollectionRail({
  entries,
  yoursTotal,
  openTotal,
  selected,
  onSelect,
  allWork,
  hidden,
  onToggle,
}: CollectionRailProps) {
  return (
    <nav id="collections" className="rail" aria-label={t('rail.aria')}>
      <div className="rail-head">
        {onToggle ? <SidebarToggle shown={!hidden} onToggle={onToggle} /> : null}
        <span className="t-label rail-label" inert={hidden}>
          {t('rail.label')}
        </span>
      </div>
      <div id="collection-list" className="rail-entries" inert={hidden}>
        {allWork ? (
          <button
            type="button"
            className="rail-entry"
            aria-pressed={selected === undefined}
            onClick={() => onSelect(undefined)}
          >
            <span>{t('rail.all')}</span>
            <Count yours={yoursTotal} open={openTotal} />
          </button>
        ) : null}
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
