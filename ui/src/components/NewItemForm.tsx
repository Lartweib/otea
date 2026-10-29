import { useState } from 'react';
import { createItem, fetchCollections } from '../api.ts';
import { type Connection, useRemote } from '../hooks.ts';
import {
  canSubmit,
  type FormValues,
  initialValues,
  payloadOf,
  startMessage,
  startOf,
} from '../intake.ts';
import { Button } from '../kit/index.ts';
import type { CollectionView } from '../types.ts';
import { FieldControl } from './FieldControl.tsx';

type IntakeFormProps = {
  collections: CollectionView[];
  first: CollectionView;
  onCancel: () => void;
  onCreated: (id: string) => void;
};

function IntakeForm({ collections, first, onCancel, onCreated }: IntakeFormProps) {
  const [collection, setCollection] = useState(first);
  const [values, setValues] = useState(() => initialValues(first));
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string>();
  const start = startOf(collection, values);
  const ready = canSubmit(collection, values);

  const choose = (name: string) => {
    const next = collections.find((candidate) => candidate.name === name) ?? first;
    setCollection(next);
    setValues(initialValues(next));
    setError(undefined);
  };

  const change = (name: string, value: string) =>
    setValues((current: FormValues) => ({ ...current, [name]: value }));

  const submit = () => {
    if (!ready || posting) return;
    setPosting(true);
    setError(undefined);
    createItem(collection.name, payloadOf(values)).then(
      (item) => onCreated(item.id),
      (failure: unknown) => {
        setPosting(false);
        setError(failure instanceof Error ? failure.message : 'Failed');
      },
    );
  };

  return (
    <form
      className="intake"
      aria-label="New item"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {collections.length > 1 ? (
        <div className="intake-field">
          <label className="t-label" htmlFor="intake-collection">
            Collection
          </label>
          <select
            id="intake-collection"
            className="input"
            value={collection.name}
            disabled={posting}
            onChange={(event) => choose(event.target.value)}
          >
            {collections.map(({ name }) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {collection.fields.map((field) => (
        <FieldControl
          key={`${collection.name}:${field.name}`}
          id={`intake-${field.name}`}
          field={field}
          value={values[field.name] ?? ''}
          disabled={posting}
          onChange={(value) => change(field.name, value)}
        />
      ))}
      <p className="intake-start t-small" data-incomplete={start.incomplete}>
        {startMessage(start)}
      </p>
      <div className="action-buttons">
        <Button type="submit" variant="primary" disabled={!ready || posting}>
          {posting ? 'Creating…' : 'Create'}
        </Button>
        <Button variant="quiet" disabled={posting} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error ? (
        <p className="action-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

type NewItemFormProps = {
  connection: Connection;
  onCancel: () => void;
  onCreated: (id: string) => void;
};

export function NewItemForm({ connection, onCancel, onCreated }: NewItemFormProps) {
  const collections = useRemote(fetchCollections, 0, connection);
  const body = () => {
    if (collections.status === 'loading') return <p className="t-small">Loading…</p>;
    if (collections.status === 'failed')
      return <p className="action-error">{collections.message}</p>;
    const [first] = collections.value;
    if (!first) {
      return (
        <p className="t-small">
          No collections yet. Add one with <code>otea collection add &lt;name&gt;</code>.
        </p>
      );
    }
    return (
      <IntakeForm
        collections={collections.value}
        first={first}
        onCancel={onCancel}
        onCreated={onCreated}
      />
    );
  };
  return (
    <article className="detail">
      <header className="detail-head">
        <h1 className="t-display">New item</h1>
      </header>
      {body()}
    </article>
  );
}
