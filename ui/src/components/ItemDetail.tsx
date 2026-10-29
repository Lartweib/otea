import type { ReactNode } from 'react';
import { actorLabel, leaseLabel } from '../format.ts';
import { useActiveLease } from '../hooks.ts';
import { NODE_LABEL, Node, Pill } from '../kit/index.ts';
import { moduleFor } from '../modules/registry.ts';
import { valuesOf } from '../modules/values.ts';
import { nodeKind } from '../node-kind.ts';
import type { CollectionView, ItemView, Turn } from '../types.ts';
import { ItemActions } from './ItemActions.tsx';
import { Timeline } from './Timeline.tsx';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

const TURN_LABEL: Record<Turn, string> = {
  human: 'your turn',
  agent: 'agent’s turn',
  none: 'closed',
};

type ItemDetailProps = {
  item: ItemView;
  canWrite: boolean;
  collection: CollectionView | undefined;
  // Drawn at the end of the header row (the focus toggle).
  headAction?: ReactNode;
};

// The primary column holds what to decide on; the side holds where the item has been. Side by side in
// focus mode, stacked otherwise.
export function ItemDetail({ item, canWrite, collection, headAction }: ItemDetailProps) {
  const lease = useActiveLease(item.lease);
  const kind = nodeKind({
    turn: item.turn,
    state: item.state,
    leased: lease !== null,
    incomplete: item.state === collection?.incomplete,
  });
  const values = valuesOf(collection?.fields, item.fields);
  const standing = lease ? `${lease.holder} is on it` : TURN_LABEL[item.turn];
  return (
    <article className="detail">
      <div className="detail-primary">
        <header className="detail-head">
          <div className="detail-head-row">
            <div className="detail-tags">
              <Node kind={kind} label={NODE_LABEL[kind]} />
              <span className="t-id">{item.id}</span>
              <Pill tone="state" yours={item.turn === 'human'}>
                {item.state}
              </Pill>
              <span className="t-cap">{standing}</span>
            </div>
            {headAction}
          </div>
          <h1 className="t-display">{item.title}</h1>
        </header>
        {canWrite ? (
          <ItemActions key={`${item.id}:${item.state}`} id={item.id} moves={item.transitions} />
        ) : (
          <p className="t-small">
            Read-only. Run <code>otea open</code> to act from this browser.
          </p>
        )}
        {item.missing.length > 0 ? (
          <div className="missing well">
            <span className="t-label">missing to complete</span>
            <span className="t-ui">{item.missing.join(', ')}</span>
          </div>
        ) : null}
        <hr className="hr" />
        {values.length > 0 ? (
          <dl className="fields">
            {values.map(({ field, value }) => {
              const { Detail } = moduleFor(field.module);
              return (
                <Field key={field.name} label={field.name}>
                  <Detail field={field} value={value} />
                </Field>
              );
            })}
          </dl>
        ) : (
          <p className="t-small">No fields.</p>
        )}
      </div>
      <div className="detail-side">
        <dl className="fields fields-meta">
          <Field label="collection">{item.collection}</Field>
          <Field label="created by">{actorLabel(item.createdBy)}</Field>
          {lease ? <Field label="lease">{leaseLabel(lease)}</Field> : null}
        </dl>
        <section className="timeline-section" aria-labelledby="timeline-title">
          <h2 className="t-label" id="timeline-title">
            history
          </h2>
          <Timeline
            events={item.events}
            turn={item.turn}
            kind={kind}
            now={`${item.state} · ${standing}`}
          />
        </section>
      </div>
    </article>
  );
}
