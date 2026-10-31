import { useState } from 'react';
import { unlinkItems } from '../../api.ts';
import { groupRelations, unlinkRequestOf } from '../../relations.ts';
import type { ItemView, LayoutEntry, RelatedItem } from '../../types.ts';
import type { CollectionOf } from '../ItemList.tsx';
import { LinkForm } from './LinkForm.tsx';
import { RelatedRow } from './RelatedRow.tsx';

type RelationsModuleProps = {
  item: ItemView;
  entry: LayoutEntry;
  canWrite: boolean;
  collectionOf: CollectionOf;
  // False when a children module of the same layout lists the children.
  withChildren: boolean;
};

const keyOf = ({ kind, id }: RelatedItem) => `${kind}:${id}`;

// The item's links grouped by how they read from it, each kind in a narrow column beside its items.
// A browser that can write adds one with "link" and removes one with the cross on its row.
export function RelationsModule({
  item,
  entry,
  canWrite,
  collectionOf,
  withChildren,
}: RelationsModuleProps) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string>();
  const [error, setError] = useState<string>();
  const groups = groupRelations(item.relations, { withChildren });
  if (groups.length === 0 && !canWrite) return null;
  const remove = (related: RelatedItem) => {
    setRemoving(keyOf(related));
    setError(undefined);
    unlinkItems(unlinkRequestOf(item.id, related)).then(
      () => setRemoving(undefined),
      (failure: unknown) => {
        setRemoving(undefined);
        setError(failure instanceof Error ? failure.message : 'Failed');
      },
    );
  };
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  const label = entry.label ?? (count === 1 ? 'relation' : 'relations');
  const headingId = `relations-${item.id}`;
  return (
    <section className="rel-module" aria-labelledby={headingId}>
      <header className="sub-head">
        <h3 className="sub-title" id={headingId}>
          {count === 0 ? `No ${entry.label ?? 'relations'}` : `${count} ${label}`}
        </h3>
        {canWrite && !adding ? (
          <button type="button" className="rel-add" onClick={() => setAdding(true)}>
            link
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
