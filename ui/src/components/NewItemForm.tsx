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
import { intakeFields } from '../item-types.ts';
import { Button, Icon } from '../kit/index.ts';
import type { CollectionView, TypeView } from '../types.ts';
import { FieldControl } from './FieldControl.tsx';

// The item the new one is created under, as its child.
export type IntakeParent = { id: string; title: string; collection: string };

type IntakeFormProps = {
  collections: CollectionView[];
  first: CollectionView;
  parent: IntakeParent | undefined;
  onCancel: () => void;
  onCreated: (id: string) => void;
};

// The type a form starts with: the collection's first.
function firstType(collection: CollectionView): TypeView | undefined {
  return collection.types[0];
}

function IntakeForm({
  collections,
  first,
  parent: initialParent,
  onCancel,
  onCreated,
}: IntakeFormProps) {
  const [collection, setCollection] = useState(first);
  const [parent, setParent] = useState(initialParent);
  const [type, setType] = useState(() => firstType(first));
  const [values, setValues] = useState(() => (type ? initialValues(type) : {}));
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string>();
  const start = type ? startOf(type, values) : undefined;
  const ready = type !== undefined && canSubmit(type, values);

  const reset = (next: TypeView | undefined) => {
    setType(next);
    setValues(next ? initialValues(next) : {});
    setError(undefined);
  };

  const choose = (name: string) => {
    const next = collections.find((candidate) => candidate.name === name) ?? first;
    setCollection(next);
    reset(firstType(next));
  };

  const chooseType = (name: string) =>
    reset(collection.types.find((candidate) => candidate.name === name));

  const change = (name: string, value: string) =>
    setValues((current: FormValues) => ({ ...current, [name]: value }));

  const submit = () => {
    if (!ready || posting) return;
    setPosting(true);
    setError(undefined);
    createItem(collection.name, type.name, payloadOf(values), parent?.id).then(
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
      {parent ? (
        <div className="intake-parent well">
          <span className="t-label">child of</span>
          <span className="rel-id">{parent.id}</span>
          <span className="intake-parent-title">{parent.title}</span>
          <Button
            variant="quiet"
            size="sm"
            icon
            aria-label={`Do not make it a child of ${parent.id}`}
            disabled={posting}
            onClick={() => setParent(undefined)}
          >
            <Icon name="close" />
          </Button>
        </div>
      ) : null}
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
      {collection.types.length > 1 ? (
        <div className="intake-field">
          <label className="t-label" htmlFor="intake-type">
            Type
          </label>
          <select
            id="intake-type"
            className="input"
            value={type?.name}
            disabled={posting}
            onChange={(event) => chooseType(event.target.value)}
          >
            {collection.types.map(({ name, label }) => (
              <option key={name} value={name}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {(type ? intakeFields(type) : []).map((field) => (
        <FieldControl
          key={`${collection.name}:${type?.name}:${field.name}`}
          id={`intake-${field.name}`}
          field={field}
          value={values[field.name] ?? ''}
          disabled={posting}
          onChange={(value) => change(field.name, value)}
        />
      ))}
      {start ? (
        <p className="intake-start t-small" data-incomplete={start.incomplete}>
          {startMessage(start)}
        </p>
      ) : null}
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
  // Set by "+ child": the form starts in the parent's collection, any other can be chosen.
  parent?: IntakeParent | undefined;
  onCancel: () => void;
  onCreated: (id: string) => void;
};

export function NewItemForm({ connection, parent, onCancel, onCreated }: NewItemFormProps) {
  const collections = useRemote(fetchCollections, 0, connection);
  const body = () => {
    if (collections.status === 'loading') return <p className="t-small">Loading…</p>;
    if (collections.status === 'failed')
      return <p className="action-error">{collections.message}</p>;
    const first =
      collections.value.find(({ name }) => name === parent?.collection) ?? collections.value[0];
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
        parent={parent}
        onCancel={onCancel}
        onCreated={onCreated}
      />
    );
  };
  return (
    <article className="detail">
      <header className="detail-head">
        <h1 className="t-display">{parent ? 'New child' : 'New item'}</h1>
      </header>
      {body()}
    </article>
  );
}
