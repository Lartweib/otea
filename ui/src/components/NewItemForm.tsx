import { useState } from 'react';
import { createItem, fetchCollections } from '../api.ts';
import { type Connection, useRemote } from '../hooks.ts';
import { t, tx } from '../i18n/i18n.ts';
import {
  canSubmit,
  type FormValues,
  initialValues,
  payloadOf,
  startMessage,
  startOf,
} from '../intake.ts';
import { intakeFields, intakeTypes, typeOf } from '../item-types.ts';
import { Button, Icon } from '../kit/index.ts';
import { fieldWord, typeWord } from '../preset-words.ts';
import type { CollectionView, TypeView } from '../types.ts';
import { FieldControl } from './FieldControl.tsx';

// The item the new one is created under, as its child.
export type IntakeParent = { id: string; title: string; type: string; collection: string };

type IntakeFormProps = {
  collections: CollectionView[];
  first: CollectionView;
  parent: IntakeParent | undefined;
  onCancel: () => void;
  onCreated: (id: string) => void;
};

// The type of the parent a "+ child" opened the form for, which limits the types offered.
function parentType(
  collections: CollectionView[],
  parent: IntakeParent | undefined,
): TypeView | undefined {
  if (!parent) return undefined;
  return typeOf(
    collections.find(({ name }) => name === parent.collection),
    parent.type,
  );
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
  const offered = (into: CollectionView, under = parent) =>
    intakeTypes(into, parentType(collections, under));
  const [type, setType] = useState(() => offered(first)[0]);
  const types = offered(collection);
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
    reset(offered(next)[0]);
  };

  // Without the parent, the form offers only the types that stand alone.
  const unparent = () => {
    setParent(undefined);
    const alone = offered(collection, undefined);
    if (!alone.some(({ name }) => name === type?.name)) reset(alone[0]);
  };

  const chooseType = (name: string) => reset(types.find((candidate) => candidate.name === name));

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
        setError(failure instanceof Error ? failure.message : t('common.failed'));
      },
    );
  };

  return (
    <form
      className="intake"
      aria-label={t('app.newItem')}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {parent ? (
        <div className="intake-parent well">
          <span className="t-label">{t('intake.childOf')}</span>
          <span className="rel-id">{parent.id}</span>
          <span className="intake-parent-title">{parent.title}</span>
          <Button
            variant="quiet"
            size="sm"
            icon
            aria-label={t('intake.unparent', { id: parent.id })}
            disabled={posting}
            onClick={unparent}
          >
            <Icon name="close" />
          </Button>
        </div>
      ) : null}
      {collections.length > 1 ? (
        <div className="intake-field">
          <label className="t-label" htmlFor="intake-collection">
            {t('intake.collection')}
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
      {parent && types.length === 0 ? (
        <p className="t-small">{t('intake.noTypes', { id: parent.id })}</p>
      ) : null}
      {types.length > 1 ? (
        <div className="intake-field">
          <label className="t-label" htmlFor="intake-type">
            {t('intake.type')}
          </label>
          <select
            id="intake-type"
            className="input"
            value={type?.name}
            disabled={posting}
            onChange={(event) => chooseType(event.target.value)}
          >
            {types.map((each) => (
              <option key={each.name} value={each.name}>
                {typeWord(each, each.name)}
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
          label={fieldWord(type, field.name)}
        />
      ))}
      {start ? (
        <p className="intake-start t-small" data-incomplete={start.incomplete}>
          {startMessage(start, type)}
        </p>
      ) : null}
      <div className="action-buttons">
        <Button type="submit" variant="primary" disabled={!ready || posting}>
          {t(posting ? 'intake.creating' : 'intake.create')}
        </Button>
        <Button variant="quiet" disabled={posting} onClick={onCancel}>
          {t('common.cancel')}
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
  // Set by an empty collection's "New item in": the form starts there.
  collection?: string | undefined;
  onCancel: () => void;
  onCreated: (id: string) => void;
};

export function NewItemForm({
  connection,
  parent,
  collection,
  onCancel,
  onCreated,
}: NewItemFormProps) {
  const collections = useRemote(fetchCollections, 0, connection);
  const body = () => {
    if (collections.status === 'loading') return <p className="t-small">{t('common.loading')}</p>;
    if (collections.status === 'failed')
      return <p className="action-error">{collections.message}</p>;
    const first =
      collections.value.find(({ name }) => name === (parent?.collection ?? collection)) ??
      collections.value[0];
    if (!first) {
      return (
        <p className="t-small">
          {tx('intake.noCollections', { command: <code>otea collection add &lt;name&gt;</code> })}
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
        <h1 className="t-display">{t(parent ? 'intake.newChild' : 'app.newItem')}</h1>
      </header>
      {body()}
    </article>
  );
}
