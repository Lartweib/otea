import { useEffect, useRef, useState } from 'react';
import { createItem, fetchCollections } from '../api.ts';
import { type Connection, useRemote } from '../hooks.ts';
import { t, tx } from '../i18n/i18n.ts';
import {
  canSubmit,
  type FormValues,
  initialValues,
  landingOf,
  nextId,
  payloadOf,
  startMessage,
  startOf,
} from '../intake.ts';
import { type FileDraft, firstRole, rolesFor, tooLarge, withFiles } from '../intake-files.ts';
import { intakeFields, intakeTypes, showsTypes, typeOf } from '../item-types.ts';
import { Button, Icon } from '../kit/index.ts';
import { fieldWord, typeWord } from '../preset-words.ts';
import type { CollectionView, EvidenceRole, TypeView } from '../types.ts';
import { FieldControl } from './FieldControl.tsx';
import { IntakeFiles } from './IntakeFiles.tsx';
import { carryToList } from './intake-flight.ts';
import { LandsAs } from './LandsAs.tsx';

// The item the new one is created under, as its child.
export type IntakeParent = { id: string; title: string; type: string; collection: string };

type IntakeFormProps = {
  collections: CollectionView[];
  first: CollectionView;
  // Every item's id, for the id the new one will likely get.
  ids: readonly string[];
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

let drafted = 0;
const draftKey = () => {
  drafted += 1;
  return `file-${drafted}`;
};

function IntakeForm({
  collections,
  first,
  ids,
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
  const [files, setFiles] = useState<FileDraft[]>([]);
  const [posting, setPosting] = useState(false);
  // The id the server gave, kept on the row while it is carried to the list.
  const [created, setCreated] = useState<string>();
  const [error, setError] = useState<string>();
  const strip = useRef<HTMLDivElement>(null);
  const flight = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => flight.current?.abort(), []);
  const start = type ? startOf(type, values) : undefined;
  const landing = type ? landingOf(type, values) : undefined;
  const roles = type ? rolesFor(type) : [];
  const ready =
    type !== undefined && canSubmit(type, values) && !files.some(({ file }) => tooLarge(file));

  // Another type keeps the files, in a role it takes.
  const reset = (next: TypeView | undefined) => {
    setType(next);
    setValues(next ? initialValues(next) : {});
    setError(undefined);
    const offered = next ? rolesFor(next) : [];
    setFiles((current) =>
      current.map((draft) =>
        offered.includes(draft.role) ? draft : { ...draft, role: firstRole(offered) },
      ),
    );
  };

  const addFiles = (picked: File[]) =>
    setFiles((current) => withFiles(current, picked, firstRole(roles), draftKey));
  const setRole = (key: string, role: EvidenceRole) =>
    setFiles((current) => current.map((draft) => (draft.key === key ? { ...draft, role } : draft)));
  const removeFile = (key: string) =>
    setFiles((current) => current.filter((draft) => draft.key !== key));

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
    createItem(collection.name, type.name, payloadOf(values), parent?.id, files).then(
      async (item) => {
        setCreated(item.id);
        // The row the form drew is carried onto its lane in the list, then the item opens.
        const abort = new AbortController();
        flight.current = abort;
        if (strip.current) await carryToList(strip.current, item.id, abort.signal);
        if (!abort.signal.aborted) onCreated(item.id);
      },
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
      onPaste={(event) => {
        const pasted = [...event.clipboardData.files];
        if (pasted.length === 0 || posting) return;
        event.preventDefault();
        addFiles(pasted);
      }}
    >
      {type && landing ? (
        <LandsAs
          type={type}
          landing={landing}
          id={created ?? nextId(collection.prefix, ids)}
          title={(values.title ?? '').trim()}
          typeLabel={showsTypes(collection) ? typeWord(type, type.name) : undefined}
          strip={strip}
        />
      ) : null}
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
      {type ? (
        <IntakeFiles
          drafts={files}
          roles={roles}
          disabled={posting}
          onAdd={addFiles}
          onRole={setRole}
          onRemove={removeFile}
        />
      ) : null}
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
  ids: readonly string[];
  // Set by "+ child": the form starts in the parent's collection, any other can be chosen.
  parent?: IntakeParent | undefined;
  // Set by an empty collection's "New item in": the form starts there.
  collection?: string | undefined;
  onCancel: () => void;
  onCreated: (id: string) => void;
};

export function NewItemForm({
  connection,
  ids,
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
        ids={ids}
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
