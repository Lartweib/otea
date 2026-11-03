import { type PlainKey, t } from '../../i18n/i18n.ts';
import { TypeIcon } from '../../icons/TypeIcon.tsx';
import { typeOf } from '../../item-types.ts';
import { Node, nodeLabel } from '../../kit/index.ts';
import { activeLease } from '../../lease.ts';
import type { RelationGroup } from '../../relations.ts';
import { hashFor } from '../../selection.ts';
import type { RelatedItem, Turn } from '../../types.ts';
import type { CollectionOf } from '../ItemList.tsx';
import { relatedNodeKind } from './RelatedRow.tsx';

const TURN_WORD: Readonly<Record<Turn, PlainKey>> = {
  human: 'turn.yours',
  agent: 'turn.agentGeneric',
  none: 'turn.closed',
};

// One item of another collection: its node, its type icon and title, and under them its id,
// collection, state and turn (or who holds it while an agent works on it), linking to it.
function AcrossRow({
  related,
  collectionOf,
}: {
  related: RelatedItem;
  collectionOf: CollectionOf;
}) {
  const kind = relatedNodeKind(related, collectionOf);
  const type = typeOf(collectionOf(related.collection), related.type);
  const lease = activeLease(related.lease, Date.now());
  const standing = lease ? lease.holder : t(TURN_WORD[related.turn]);
  return (
    <li className="rel-row across-row" data-kind={kind}>
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
    </li>
  );
}

// The item's links to items of other collections, grouped by kind. Read only: links are added and
// removed in Structure.
export function AcrossBoards({
  groups,
  collectionOf,
}: {
  groups: readonly RelationGroup[];
  collectionOf: CollectionOf;
}) {
  return (
    <div className="rel-module">
      {groups.map((group) => (
        <div key={group.kind} className="rel-group across-group">
          <h3 className="rel-kind">{group.label}</h3>
          <ul className="rel-list">
            {group.items.map((related) => (
              <AcrossRow
                key={`${related.kind}:${related.id}`}
                related={related}
                collectionOf={collectionOf}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
