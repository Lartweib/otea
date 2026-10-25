import type { ReactNode } from 'react';
import { actorLabel, describeEvent, formatTime } from '../format.ts';
import type { ItemWithEvents } from '../types.ts';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ItemDetail({ item }: { item: ItemWithEvents }) {
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
      </dl>
      {item.body ? <p className="body">{item.body}</p> : <p className="muted">No description.</p>}
      <h2 className="timeline-title">Timeline</h2>
      <ol className="timeline">
        {item.events.map((event) => (
          <li key={event.id}>
            <span>{describeEvent(event)}</span>
            <span className="muted">
              {actorLabel(event.actor)} · <time dateTime={event.at}>{formatTime(event.at)}</time>
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}
