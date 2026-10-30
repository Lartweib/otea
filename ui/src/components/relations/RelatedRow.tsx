import { typeOf } from '../../item-types.ts';
import { Icon, NODE_LABEL, Node } from '../../kit/index.ts';
import { activeLease } from '../../lease.ts';
import { itemNodeKind, type NodeKind } from '../../node-kind.ts';
import { hashFor } from '../../selection.ts';
import type { CollectionView, RelatedItem } from '../../types.ts';
import type { CollectionOf } from '../ItemList.tsx';

// The node another item shows in the list, read from where it stands.
export function relatedNodeKind(related: RelatedItem, collectionOf: CollectionOf): NodeKind {
  const collection: CollectionView | undefined = collectionOf(related.collection);
  const leased = activeLease(related.lease, Date.now()) !== null;
  return itemNodeKind(related, typeOf(collection, related.type), leased);
}

type RelatedRowProps = {
  related: RelatedItem;
  collectionOf: CollectionOf;
  // Shows the other item's state after its title (the children list does).
  withState?: boolean;
  // Removes the link; only for a browser that can write.
  onRemove?: (() => void) | undefined;
  removing?: boolean;
};

// One related item, compact: its node, id and title, linking to it.
export function RelatedRow({
  related,
  collectionOf,
  withState = false,
  onRemove,
  removing = false,
}: RelatedRowProps) {
  const kind = relatedNodeKind(related, collectionOf);
  return (
    <li className="rel-row" data-kind={kind} data-removing={removing || undefined}>
      <a className="rel-link" href={hashFor(related.id)}>
        <Node kind={kind} label={NODE_LABEL[kind]} />
        <span className="rel-id">{related.id}</span>
        <span className="rel-title">{related.title}</span>
        {withState ? <span className="rel-state">{related.state}</span> : null}
      </a>
      {onRemove ? (
        <button
          type="button"
          className="rel-remove"
          aria-label={`Remove the link to ${related.id}`}
          disabled={removing}
          onClick={onRemove}
        >
          <Icon name="close" />
        </button>
      ) : null}
    </li>
  );
}
