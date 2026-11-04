import type { ReactNode } from 'react';
import { t } from '../i18n/i18n.ts';
import { TypeIcon } from '../icons/TypeIcon.tsx';
import { Button, Icon } from '../kit/index.ts';
import { LAN_HASH, modulesHash, SETTINGS_HASH, studioHash } from '../selection.ts';
import type { RailEntry } from '../workspace.ts';
import { PlaceIcon } from './PlaceIcon.tsx';

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
  // The module catalog is open.
  modules?: boolean;
  // Studio is open.
  studio?: boolean;
  // Phone access (#/lan) is open; none hides the entry, for any browser but this computer's
  // signed-in one.
  lan?: boolean | undefined;
  // The project's settings are open.
  settings?: boolean;
  // Above the collections: the panel's own head on the phone.
  head?: ReactNode;
  // At the bottom: you and Preferences.
  foot?: ReactNode;
  // The phone's panel keeps every "+" in sight and never folds.
  variant?: 'sidebar' | 'panel';
};

// Folds the sidebar to its rail of icons, or opens it again. Open, it sits at the foot, beside
// Preferences; folded, it leads the rail.
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
  lan,
  settings = false,
  head,
  foot,
  variant = 'sidebar',
}: CollectionRailProps) {
  const newIn = (name: string) => t('empty.newIn', { collection: name });
  return (
    <nav
      id={variant === 'sidebar' ? 'collections' : undefined}
      className="rail"
      data-variant={variant}
      aria-label={t('rail.aria')}
    >
      {head}
      {folded && onToggle ? (
        <div className="rail-top">
          <SidebarToggle shown={false} onToggle={onToggle} />
        </div>
      ) : null}
      <div className="rail-head">
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
          data-tip={folded ? t('app.modules') : undefined}
          aria-label={folded ? t('app.modules') : undefined}
          href={modulesHash()}
          aria-current={modules ? 'page' : undefined}
        >
          <span className="rail-icon">
            <PlaceIcon icon="shapes" name={t('app.modules')} />
          </span>
          <span className="rail-name">{t('app.modules')}</span>
        </a>
        <a
          className={folded ? 'rail-entry tip' : 'rail-entry'}
          data-tip={folded ? t('app.studio') : undefined}
          aria-label={folded ? t('app.studio') : undefined}
          href={studioHash()}
          aria-current={studio ? 'page' : undefined}
        >
          <span className="rail-icon">
            <PlaceIcon icon="ruler" name={t('app.studio')} />
          </span>
          <span className="rail-name">{t('app.studio')}</span>
        </a>
        {lan === undefined ? null : (
          <a
            className={folded ? 'rail-entry tip' : 'rail-entry'}
            data-tip={folded ? t('lan.link') : undefined}
            aria-label={folded ? t('lan.link') : undefined}
            href={LAN_HASH}
            aria-current={lan ? 'page' : undefined}
          >
            <span className="rail-icon">
              <PlaceIcon icon="mobile" name={t('lan.link')} />
            </span>
            <span className="rail-name">{t('lan.link')}</span>
          </a>
        )}
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
      <div className="rail-foot">
        {foot}
        {!folded && onToggle ? <SidebarToggle shown onToggle={onToggle} /> : null}
      </div>
    </nav>
  );
}
