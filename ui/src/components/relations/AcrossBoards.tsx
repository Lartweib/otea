import { type PlainKey, t } from '../../i18n/i18n.ts';
import { TypeIcon } from '../../icons/TypeIcon.tsx';
import { typeOf } from '../../item-types.ts';
import { Icon, Node, nodeLabel } from '../../kit/index.ts';
import { activeLease } from '../../lease.ts';
import type { RelationGroup } from '../../relations.ts';
import { hashFor } from '../../selection.ts';
import type { RelatedItem, Turn } from '../../types.ts';
import type { CollectionOf } from '../ItemList.tsx';
import { relatedNodeKind } from './RelatedRow.tsx';
import { keyOf, useUnlink } from './RelationsModule.tsx';

const TURN_WORD: Readonly<Record<Turn, PlainKey>> = {
  human: 'turn.yours',
  agent: 'turn.agentGeneric',
  none: 'turn.closed',
};

type AcrossRowProps = {
  related: RelatedItem;
  collectionOf: CollectionOf;
  // Removes the link; only for a browser that can write.
  onRemove?: (() => void) | undefined;
  removing: boolean;
};

// One item of another collection: its node, its type icon and title, and under them its id,
// collection, state and turn (or who holds it while an agent works on it), linking to it.
function AcrossRow({ related, collectionOf, onRemove, removing }: AcrossRowProps) {
  const kind = relatedNodeKind(related, collectionOf);
  const type = typeOf(collectionOf(related.collection), related.type);
  const lease = activeLease(related.lease, Date.now());
  const standing = lease ? lease.holder : t(TURN_WORD[related.turn]);
  return (
    <li className="rel-row across-row" data-kind={kind} data-removing={removing || undefined}>
      <a className="across-link" href={hashFor(related.id)}>
        <Node kind={kind} label={nodeLabel(kind)} />
        <span className="rel-title">
          <TypeIcon name={type?.icon} size={14} />
          <span>{related.title}</span>
        </span>
        <span className="across-meta">
          {[related.id, related.collection, related.state, standing].join(' · ')}
        </span>
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

// The item's links to items of other collections, grouped by kind; Structure keeps the rest. A
// browser that can write removes one with the cross on its row.
export function AcrossBoards({
  id,
  groups,
  canWrite,
  collectionOf,
}: {
  id: string;
  groups: readonly RelationGroup[];
  canWrite: boolean;
  collectionOf: CollectionOf;
}) {
  const { removing, error, remove } = useUnlink(id);
  return (
    <div className="rel-module">
      {groups.map((group) => (
        <div key={group.kind} className="rel-group">
          <h3 className="rel-kind">{group.label}</h3>
          <ul className="rel-list">
            {group.items.map((related) => (
              <AcrossRow
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
      {error ? (
        <p className="action-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
