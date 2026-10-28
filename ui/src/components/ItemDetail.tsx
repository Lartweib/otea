import type { ReactNode } from 'react';
import { actorLabel, describeEvent, eventActorLabel, formatTime, leaseLabel } from '../format.ts';
import type { ItemView } from '../types.ts';
import { ItemActions } from './ItemActions.tsx';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

type ItemDetailProps = { item: ItemView; canWrite: boolean };

export function ItemDetail({ item, canWrite }: ItemDetailProps) {
  return (
    <article className="detail">
      <header>
        <p className="detail-id">{item.id}</p>
        <h1 className="detail-title">{item.title}</h1>
      </header>
      <dl className="fields">
        <Field label="State">{item.state}</Field>
        <Field label="Turn">
          <span className="turn" data-turn={item.turn}>
            {item.turn}
          </span>
        </Field>
        <Field label="Collection">{item.collection}</Field>
        <Field label="Created by">{actorLabel(item.createdBy)}</Field>
        {item.lease ? (
          <Field label="Lease">
            <span className="lease">{leaseLabel(item.lease)}</span>
          </Field>
        ) : null}
      </dl>
      {canWrite ? (
        <ItemActions key={`${item.id}:${item.state}`} id={item.id} moves={item.transitions} />
      ) : (
        <p className="muted read-only">
          Read-only. Run <code>otea open</code> to act from this browser.
        </p>
      )}
      {item.missing.length > 0 ? (
        <p className="missing">Missing to complete: {item.missing.join(', ')}</p>
      ) : null}
      {Object.keys(item.fields).length > 0 ? (
        <dl className="item-fields">
          {Object.entries(item.fields).map(([name, value]) => (
            <Field key={name} label={name}>
              <span className="body">{value}</span>
            </Field>
          ))}
        </dl>
      ) : (
        <p className="muted">No fields.</p>
      )}
      <h2 className="timeline-title">Timeline</h2>
      <ol className="timeline">
        {item.events.map((event) => (
          <li key={event.id}>
            <span>{describeEvent(event)}</span>
            <span className="muted">
              {eventActorLabel(event)} · <time dateTime={event.at}>{formatTime(event.at)}</time>
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}
