import { useEffect, useState } from 'react';
import { emptyFacts, type Fact } from '../empty-detail.ts';
import { t } from '../i18n/i18n.ts';
import { Button, Icon, NodeMark } from '../kit/index.ts';
import type { Item } from '../types.ts';

// The entrance runs once, when the pane becomes empty (first, or as an item closes): switching
// collections keeps the component, so nothing animates again. A little past its last frame.
const ENTRANCE_MS = 900;

function factText(fact: Fact): string {
  if (fact.kind === 'nothing') return t('empty.nothingWaiting');
  if (fact.kind === 'yours') return t('empty.waiting', { count: fact.count });
  return t('empty.withAgents', { count: fact.count });
}

function Facts({ items }: { items: readonly Item[] }) {
  const facts = emptyFacts(items);
  return (
    <p className="empty-facts">
      {facts.map((fact, index) => (
        <span key={fact.kind} className="empty-fact" data-kind={fact.kind}>
          {index > 0 ? <span className="empty-dot">·</span> : null}
          {fact.kind === 'nothing' ? null : (
            <svg className="glyph" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <NodeMark kind={fact.kind === 'yours' ? 'you' : 'queued'} cx={7} cy={7} r={4.2} />
            </svg>
          )}
          {factText(fact)}
        </span>
      ))}
    </p>
  );
}

// One drawn stroke from the line toward the list, its head along the curve's last tangent.
function Arrow() {
  return (
    <svg className="empty-arrow" viewBox="0 0 216 112" aria-hidden="true">
      <path className="empty-stroke" pathLength={100} d="M210 86 C156 112 66 102 8 42" />
      <path className="empty-head" d="M10.85 52.63 L8 42 L18.52 45.2" />
    </svg>
  );
}

type EmptyDetailProps = {
  // The items in view: a collection's, or all of them.
  items: readonly Item[];
  collection: string | undefined;
  onCreate?: (() => void) | undefined;
};

// The detail pane while nothing is chosen in the list: a hint toward the list and what waits there.
export function EmptyDetail({ items, collection, onCreate }: EmptyDetailProps) {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setEntering(false), ENTRANCE_MS);
    return () => clearTimeout(timer);
  }, []);
  if (items.length === 0) {
    return (
      <div className="empty-detail" data-empty="collection">
        <div className="empty-body">
          <p className="empty-hint">
            {collection === undefined ? t('empty.noItems') : t('empty.noItemsIn', { collection })}
          </p>
          {onCreate ? (
            <Button className="empty-create" onClick={onCreate}>
              <Icon name="plus" />
              {collection === undefined ? t('app.newItem') : t('empty.newIn', { collection })}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="empty-detail" data-enter={entering ? '' : undefined}>
      <div className="empty-guide">
        <Arrow />
        <div className="empty-body">
          <p className="empty-hint">{t('empty.pick')}</p>
          <Facts items={items} />
        </div>
      </div>
    </div>
  );
}
