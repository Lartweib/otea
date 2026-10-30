import { useState } from 'react';
import { unlinkItems } from '../../api.ts';
import { Icon } from '../../kit/index.ts';
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

// The item's links grouped by how they read from it. With none it draws nothing but, for a browser
// that can write, a quiet way to add one, shown when the detail is hovered or focused.
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
  const empty = groups.length === 0;
  // Each kind is labelled like a field, so the module needs no heading of its own.
  return (
    <section
      className="rel-module"
      aria-label={entry.label ?? 'Relations'}
      data-quiet={(empty && !adding) || undefined}
    >
      {groups.map((group) => (
        <div key={group.kind} className="rel-group">
          <h3 className="rel-kind">{group.label}</h3>
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
      {canWrite && !adding ? (
        <button type="button" className="rel-add" onClick={() => setAdding(true)}>
          <Icon name="link" />
          link
        </button>
      ) : null}
      {error ? (
        <p className="action-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
