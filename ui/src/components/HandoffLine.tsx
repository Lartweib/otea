import { evidenceFileUrl } from '../api.ts';
import { agoLabel, handoffOf, leadRelation, waitingChildren } from '../handoff.ts';
import { NODE_LABEL, Node } from '../kit/index.ts';
import { moduleFor } from '../modules/registry.ts';
import { openLabel } from '../relations.ts';
import { hashFor } from '../selection.ts';
import type { ItemView, TypeView } from '../types.ts';
import type { CollectionOf } from './ItemList.tsx';
import { ChildBar } from './relations/ChildBar.tsx';
import { relatedNodeKind } from './relations/RelatedRow.tsx';

type HandoffLineProps = {
  item: ItemView;
  type: TypeView | undefined;
  canWrite: boolean;
  collectionOf: CollectionOf;
};

const THUMBS = 2;

// One line under the title: who handed the item over, when and what they said, then what to look
// at first: the evidence (two thumbnails and the count), the severity when the type has one, and
// one relation; for a parent, its children's progress and the children waiting for you.
export function HandoffLine({ item, type, canWrite, collectionOf }: HandoffLineProps) {
  const handoff = handoffOf(item.events);
  const severity = type?.fields.find(
    (field) => field.module === 'severity' && (item.fields[field.name] ?? '') !== '',
  );
  const children = item.relations.filter(({ kind }) => kind === 'child');
  const waiting = waitingChildren(item.relations);
  const relation = children.length > 0 ? undefined : leadRelation(item.relations);
  // The server hands files only to a signed-in browser.
  const thumbs = canWrite
    ? item.evidence.filter(({ kind }) => kind === 'image').slice(0, THUMBS)
    : [];
  const parts = [];
  if (item.evidence.length > 0) {
    parts.push(
      <span key="evidence" className="handoff-files">
        {thumbs.map((entry) => (
          <img key={entry.id} className="handoff-thumb" src={evidenceFileUrl(entry.id)} alt="" />
        ))}
        <span className="t-cap">
          {item.evidence.length} {item.evidence.length === 1 ? 'file' : 'files'}
        </span>
      </span>,
    );
  }
  if (severity) {
    const { Detail } = moduleFor(severity.module);
    parts.push(
      <span key="severity" className="handoff-severity">
        <Detail field={severity} value={item.fields[severity.name] ?? ''} />
      </span>,
    );
  }
  if (children.length > 0 && item.children) {
    parts.push(
      <span key="children" className="handoff-children">
        <ChildBar kinds={children.map((child) => relatedNodeKind(child, collectionOf))} size="sm" />
        <span className="t-cap">{openLabel(item.children)}</span>
      </span>,
    );
    if (waiting.length > 0) {
      parts.push(
        <span key="waiting" className="handoff-waiting">
          <span>waiting for you:</span>
          {waiting.map((child) => (
            <a key={child.id} className="handoff-child" href={hashFor(child.id)}>
              <Node kind="you" label={NODE_LABEL.you} />
              {child.title}
            </a>
          ))}
        </span>,
      );
    }
  }
  if (relation) {
    parts.push(
      <span key="relation" className="t-cap">
        {relation.label}{' '}
        <a className="handoff-rel" href={hashFor(relation.item.id)}>
          {relation.item.id}
        </a>
      </span>,
    );
  }
  if (!handoff && parts.length === 0) return null;
  return (
    <p className="handoff">
      {handoff ? (
        <span className="handoff-who">
          {handoff.initials ? (
            <span className="handoff-mark" aria-hidden="true">
              {handoff.initials}
            </span>
          ) : null}
          <span className="handoff-says">{handoff.says}</span>
          {handoff.note ? <q className="handoff-note">{handoff.note}</q> : null}
          <span className="handoff-dot" aria-hidden="true">
            ·
          </span>
          <time className="t-cap" dateTime={handoff.at}>
            {agoLabel(handoff.at, Date.now())}
          </time>
        </span>
      ) : null}
      {parts}
    </p>
  );
}
