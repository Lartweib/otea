import { useState } from 'react';
import { createItem, fetchCollections } from '../api.ts';
import { type Connection, useRemote } from '../hooks.ts';
import {
  canSubmit,
  controlFor,
  type FormValues,
  fieldHint,
  fieldLabel,
  initialValues,
  payloadOf,
  startMessage,
  startOf,
} from '../intake.ts';
import type { CollectionView, FieldView } from '../types.ts';

type FieldControlProps = {
  field: FieldView;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

function FieldControl({ field, value, disabled, onChange }: FieldControlProps) {
  const id = `intake-${field.name}`;
  const hint = fieldHint(field);
  const hintId = hint ? `${id}-hint` : undefined;
  const shared = {
    id,
    value,
    disabled,
    required: field.required === 'create',
    'aria-describedby': hintId,
  };
  const control = controlFor(field);
  return (
    <div className="intake-field">
      <label htmlFor={id}>
        {fieldLabel(field.name)}
        {shared.required ? <span className="required"> (required)</span> : null}
      </label>
      {control === 'select' ? (
        <select {...shared} onChange={(event) => onChange(event.target.value)}>
          {field.default === undefined ? <option value="">—</option> : null}
          {(field.values ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : control === 'textarea' ? (
        <textarea {...shared} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input type="text" {...shared} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint ? (
        <p className="muted intake-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

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
          <label htmlFor="intake-collection">Collection</label>
          <select
            id="intake-collection"
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
          field={field}
          value={values[field.name] ?? ''}
          disabled={posting}
          onChange={(value) => change(field.name, value)}
        />
      ))}
      <p className="intake-start" data-incomplete={start.incomplete}>
        {startMessage(start)}
      </p>
      <div className="action-buttons">
        <button type="submit" className="action" data-tone="approve" disabled={!ready || posting}>
          {posting ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="action" disabled={posting} onClick={onCancel}>
          Cancel
        </button>
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
    if (collections.status === 'loading') return <p className="muted">Loading…</p>;
    if (collections.status === 'failed')
      return <p className="action-error">{collections.message}</p>;
    const [first] = collections.value;
    if (!first) {
      return (
        <p className="muted">
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
      <header>
        <h1 className="detail-title">New item</h1>
      </header>
      {body()}
    </article>
  );
}
