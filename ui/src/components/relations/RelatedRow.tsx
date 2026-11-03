import type { ReactNode } from 'react';
import { t } from '../../i18n/i18n.ts';
import { TypeIcon } from '../../icons/TypeIcon.tsx';
import { typeOf } from '../../item-types.ts';
import { Icon, Node, nodeLabel } from '../../kit/index.ts';
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
  // Removes the link; only for a browser that can write.
  onRemove?: (() => void) | undefined;
  removing?: boolean;
  // A child's row-slot values (a repo task's repo), before its title.
  lead?: string | undefined;
  // What follows the state: a child's gates.
  trail?: ReactNode;
  // A tick to move it with others, outside the link.
  tick?: { checked: boolean; onToggle: () => void } | undefined;
};

// One related item, compact: its node, id, type icon, title and state (with who holds it while an
// agent works on it), linking to it.
export function RelatedRow({
  related,
  collectionOf,
  onRemove,
  removing = false,
  lead,
  trail,
  tick,
}: RelatedRowProps) {
  const kind = relatedNodeKind(related, collectionOf);
  const type = typeOf(collectionOf(related.collection), related.type);
  const lease = activeLease(related.lease, Date.now());
  return (
    <li
      className="rel-row"
      data-kind={kind}
      data-removing={removing || undefined}
      data-ticked={tick?.checked || undefined}
      data-tickable={tick ? true : undefined}
    >
      {tick ? (
        <input
          type="checkbox"
          className="rel-tick"
          checked={tick.checked}
          onChange={tick.onToggle}
          aria-label={t('children.tick', { id: related.id })}
        />
      ) : null}
      <a className="rel-link" href={hashFor(related.id)} data-lead={lead ? true : undefined}>
        <Node kind={kind} label={nodeLabel(kind)} />
        <span className="rel-id">{related.id}</span>
        {lead ? <span className="rel-lead">{lead}</span> : null}
        <span className="rel-title">
          <TypeIcon name={type?.icon} size={14} />
          <span>{related.title}</span>
        </span>
        <span className="rel-state">
          {lease ? `${related.state} · ${lease.holder}` : related.state}
        </span>
        {trail}
      </a>
      {onRemove ? (
        <button
          type="button"
          className="rel-remove"
          aria-label={t('relations.remove', { id: related.id })}
          disabled={removing}
          onClick={onRemove}
        >
          <Icon name="close" />
        </button>
      ) : null}
    </li>
  );
}
