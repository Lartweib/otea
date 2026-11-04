import type { ReactNode } from 'react';
import { t } from '../i18n/i18n.ts';
import { TypeIcon } from '../icons/TypeIcon.tsx';
import { Button, Icon } from '../kit/index.ts';
import { SETTINGS_HASH, studioHash } from '../selection.ts';
import type { RailEntry } from '../workspace.ts';
import { PlaceIcon } from './PlaceIcon.tsx';
import { type StudioTree, StudioTreeView } from './StudioTree.tsx';

// A collection as the sidebar draws it: its counts, its icon, and the letter that tells it from an
// earlier collection with the same icon.
export type SidebarEntry = RailEntry & { icon: string | undefined; badge?: string | undefined };

type CollectionRailProps = {
  entries: SidebarEntry[];
  yoursTotal: number;
  openTotal: number;
  selected: string | undefined;
  onSelect: (collection: string | undefined) => void;
  // All work leads the list only when the project has two collections or more.
  allWork: boolean;
  // Folded to its rail of icons.
  folded: boolean;
  // Folds the sidebar to its rail or opens it again. None where it cannot fold (the phone's panel).
  onToggle?: (() => void) | undefined;
  // Creates an item, in a collection or (none) in the one in view. None for a browser that only reads.
  onCreate?: ((collection: string | undefined) => void) | undefined;
  // The module catalog is open: it lives under Studio.
  modules?: boolean;
  // Studio is open.
  studio?: boolean;
  // What Studio holds, unfolded under its entry while Studio or the module catalog is open.
  studioTree?: StudioTree | undefined;
  // The project's settings are open.
  settings?: boolean;
  // Above the collections: the panel's own head on the phone.
  head?: ReactNode;
  // At the bottom: you and Preferences.
  foot?: ReactNode;
  // The phone's panel keeps every "+" in sight and never folds.
  variant?: 'sidebar' | 'panel';
};

// Folds the sidebar to its rail of icons, or opens it again. It leads the rail, in front of the
// collections label, and keeps its place open or folded.
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
      <span className="rail-yours" data-zero={yours === 0 || undefined} title={t('rail.waiting')}>
        {yours}
      </span>
      <span className="t-cap rail-open">/ {open}</span>
    </span>
  );
}

type RowProps = {
  label: string;
  icon: ReactNode;
  pressed: boolean;
  onSelect: () => void;
  count: ReactNode;
  add?: (() => void) | undefined;
  addLabel?: string;
  folded: boolean;
};

// One place in the sidebar: its icon, its name and its counts, with a "+" that creates right there.
// Folded, the name moves to a tooltip and the "+" waits for the sidebar to open.
function Row({ label, icon, pressed, onSelect, count, add, addLabel, folded }: RowProps) {
  return (
    <div className="rail-row">
      <button
        type="button"
        className={folded ? 'rail-entry tip' : 'rail-entry'}
        data-tip={folded ? label : undefined}
        aria-label={folded ? label : undefined}
        aria-pressed={pressed}
        onClick={onSelect}
      >
        <span className="rail-icon">{icon}</span>
        <span className="rail-name">{label}</span>
        {count}
      </button>
      {add && !folded ? (
        <button
          type="button"
          className="rail-add tip"
          data-tip={addLabel}
          aria-label={addLabel}
          onClick={add}
        >
          <Icon name="plus" />
        </button>
      ) : null}
    </div>
  );
}

// The project's navigation: its collections (choosing one filters the list; All work, with two
// collections or more, lists them all as one tree), then the project's own places, then you.
// Counts are what waits for you / open.
export function CollectionRail({
  entries,
  yoursTotal,
  openTotal,
  selected,
  onSelect,
  allWork,
  folded,
  onToggle,
  onCreate,
  modules = false,
  studio = false,
  studioTree,
  settings = false,
  head,
  foot,
  variant = 'sidebar',
}: CollectionRailProps) {
  const newIn = (name: string) => t('empty.newIn', { collection: name });
  const inStudio = studio || modules;
  const tree = inStudio && !folded ? studioTree : undefined;
  return (
    <nav
      id={variant === 'sidebar' ? 'collections' : undefined}
      className="rail"
      data-variant={variant}
      aria-label={t('rail.aria')}
    >
      {head}
      <div className="rail-head">
        {onToggle ? <SidebarToggle shown={!folded} onToggle={onToggle} /> : null}
        <span className="t-label rail-label">{t('rail.label')}</span>
        {onCreate ? (
          <button
            type="button"
            className="rail-new tip"
            data-tip={t('app.newItem')}
            aria-label={t('app.newItem')}
            onClick={() => onCreate(selected)}
          >
            <Icon name="plus" />
          </button>
        ) : null}
      </div>
      <div id={variant === 'sidebar' ? 'collection-list' : undefined} className="rail-entries">
        {allWork ? (
          <Row
            label={t('rail.all')}
            icon={<PlaceIcon icon="stack" name={t('rail.all')} />}
            pressed={selected === undefined && !modules && !studio}
            onSelect={() => onSelect(undefined)}
            count={<Count yours={yoursTotal} open={openTotal} />}
            folded={folded}
          />
        ) : null}
        {entries.map((entry) => (
          <Row
            key={entry.name}
            label={entry.name}
            icon={<PlaceIcon icon={entry.icon} name={entry.name} badge={entry.badge} />}
            pressed={selected === entry.name && !modules && !studio}
            onSelect={() => onSelect(entry.name)}
            count={<Count yours={entry.yours} open={entry.open} />}
            add={onCreate ? () => onCreate(entry.name) : undefined}
            addLabel={newIn(entry.name)}
            folded={folded}
          />
        ))}
      </div>
      <div className="rail-project">
        <div className="rail-head">
          <span className="t-label rail-label">{t('rail.project')}</span>
        </div>
        <a
          className={folded ? 'rail-entry tip' : 'rail-entry'}
          data-tip={folded ? t('app.studio') : undefined}
          aria-label={folded ? t('app.studio') : undefined}
          href={studioHash()}
          aria-current={inStudio ? (tree?.current ? 'true' : 'page') : undefined}
        >
          <span className="rail-icon">
            <PlaceIcon icon="ruler" name={t('app.studio')} />
          </span>
          <span className="rail-name">{t('app.studio')}</span>
          {tree ? (
            <span className="t-cap rail-meta">
              {t('rail.presets', { count: tree.presets.length })}
            </span>
          ) : null}
        </a>
        {tree ? <StudioTreeView tree={tree} /> : null}
        <a
          className={folded ? 'rail-entry tip' : 'rail-entry'}
          data-tip={folded ? t('rail.settings') : undefined}
          aria-label={folded ? t('rail.settings') : undefined}
          href={SETTINGS_HASH}
          aria-current={settings ? 'page' : undefined}
        >
          <span className="rail-icon">
            <PlaceIcon icon="gear" name={t('rail.settings')} />
          </span>
          <span className="rail-name">{t('rail.settings')}</span>
        </a>
      </div>
      <div className="rail-foot">{foot}</div>
    </nav>
  );
}
