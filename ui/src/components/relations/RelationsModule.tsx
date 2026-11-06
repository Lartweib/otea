import { useState } from 'react';
import { unlinkItems } from '../../api.ts';
import { presetText, t } from '../../i18n/i18n.ts';
import { groupRelations, structureRelations, unlinkRequestOf } from '../../relations.ts';
import type { ItemView, LayoutEntry, RelatedItem } from '../../types.ts';
import type { CollectionOf } from '../ItemList.tsx';
import { LinkForm } from './LinkForm.tsx';
import { RelatedRow } from './RelatedRow.tsx';

type RelationsModuleProps = {
  item: ItemView;
  entry: LayoutEntry;
  canWrite: boolean;
  // Say "No relations" even when every link reads in Across boards (the Customize view's canvas).
  placeholder?: boolean | undefined;
  collectionOf: CollectionOf;
  // False when a children module of the same layout lists the children.
  withChildren: boolean;
  // The data attributes of its place in the layout (slotData), for Studio to find it.
  slot?: Readonly<Record<string, string>>;
};

export const keyOf = ({ kind, id }: RelatedItem) => `${kind}:${id}`;

// Removes a link from the item: which one is on its way, and why the last one failed.
export function useUnlink(id: string) {
  const [removing, setRemoving] = useState<string>();
  const [error, setError] = useState<string>();
  const remove = (related: RelatedItem) => {
    setRemoving(keyOf(related));
    setError(undefined);
    unlinkItems(unlinkRequestOf(id, related)).then(
      () => setRemoving(undefined),
      (failure: unknown) => {
        setRemoving(undefined);
        setError(failure instanceof Error ? failure.message : t('common.failed'));
      },
    );
  };
  return { removing, error, remove };
}

// The item's links grouped by how they read from it, each kind in a narrow column beside its items:
// parent, children and links within its collection (Across boards lists the others). A browser that
// can write adds one with "link" and removes one with the cross on its row; when every link it has
// reads in Across boards, only "link" stays here.
export function RelationsModule({
  item,
  entry,
  canWrite,
  placeholder = false,
  collectionOf,
  withChildren,
  slot,
}: RelationsModuleProps) {
  const [adding, setAdding] = useState(false);
  const { removing, error, remove } = useUnlink(item.id);
  const own = structureRelations(item.relations, item.collection);
  const groups = groupRelations(own, { withChildren });
  if (groups.length === 0 && !canWrite) return null;
  const elsewhere = groups.length === 0 && own.length < item.relations.length && !placeholder;
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  const label = entry.label === undefined ? undefined : presetText(entry.label);
  const headingId = `relations-${item.id}`;
  return (
    <section
      className="rel-module"
      aria-labelledby={elsewhere ? undefined : headingId}
      aria-label={elsewhere ? t('relations.link') : undefined}
      {...slot}
    >
      <header className="sub-head">
        <h3 className="sub-title" id={headingId} hidden={elsewhere}>
          {label === undefined
            ? count === 0
              ? t('relations.none')
              : t('relations.count', { count })
            : count === 0
              ? t('relations.noneLabelled', { label })
              : t('relations.labelled', { count, label })}
        </h3>
        {canWrite && !adding ? (
          <button type="button" className="rel-add" onClick={() => setAdding(true)}>
            {t('relations.link')}
          </button>
        ) : null}
      </header>
      {groups.map((group) => (
        <div key={group.kind} className="rel-group">
          <h4 className="rel-kind">{group.label}</h4>
          <ul className="rel-list">
            {group.items.map((related) => (
              <RelatedRow
                key={keyOf(related)}
                related={related}
                collectionOf={collectionOf}
                removing={removing === keyOf(related)}
                onRemove={canWrite ? () => remove(related) : undefined}
              />
            ))}
          </ul>
        </div>
      ))}
      {canWrite && adding ? (
        <LinkForm item={item} collectionOf={collectionOf} onDone={() => setAdding(false)} />
      ) : null}
      {error ? (
        <p className="action-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
