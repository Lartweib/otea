import { useEffect, useRef, useState } from 'react';
import { createItem } from '../api.ts';
import { useApp } from '../app/context.tsx';
import type { Connection } from '../hooks.ts';
import { t, tx } from '../i18n/i18n.ts';
import {
  canSubmit,
  type FormValues,
  initialValues,
  landingOf,
  ledeOf,
  nextId,
  payloadOf,
  startMessage,
  startOf,
} from '../intake.ts';
import { type FileDraft, firstRole, rolesFor, tooLarge, withFiles } from '../intake-files.ts';
import { intakeSlots, intakeTypes, slotData, typeOf } from '../item-types.ts';
import { Button, ChipButton, GhostButton, Icon, Swap } from '../kit/index.ts';
import { fieldWord, stateWord, typeWord } from '../preset-words.ts';
import type { CollectionView, EvidenceRole, TypeView } from '../types.ts';
import { FieldControl } from './FieldControl.tsx';
import { IntakeFiles } from './IntakeFiles.tsx';
import { landNewRow } from './intake-flight.ts';
import { LandsAs } from './LandsAs.tsx';

// Nuevo ítem (SPEC §10.5, mock:672-688, 3899-3993): the board as chips, the type when there are
// several, the title and what is going on, each intake field (a few values as chips), files; under
// "llega como" the row it will be, drawn on its lane as you type. Crear flies that row to its place
// in the list, with a breath on its lane, and the item opens.

// The item the new one is created under, as its child.
export type IntakeParent = { id: string; title: string; type: string; collection: string };

type IntakeFormProps = {
  collections: CollectionView[];
  first: CollectionView;
  // Every item's id, for the id the new one will likely get.
  ids: readonly string[];
  parent: IntakeParent | undefined;
  onCancel: () => void;
  // from: where the preview row was, so the new row can fly from it.
  onCreated: (id: string, from: DOMRect | null) => void;
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

// The words the mock gives the two fields every type starts with.
const OWN_WORDS: Record<
  string,
  { label: 'intake.titleField' | 'intake.descField'; ph: 'intake.titlePh' | 'intake.descPh' }
> = {
  title: { label: 'intake.titleField', ph: 'intake.titlePh' },
  description: { label: 'intake.descField', ph: 'intake.descPh' },
};

export function IntakeForm({
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
  const [created, setCreated] = useState<string>();
  const [error, setError] = useState<string>();
  const preview = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const start = type ? startOf(type, values) : undefined;
  const landing = type ? landingOf(type, values) : undefined;
  const roles = type ? rolesFor(type) : [];
  const ready =
    type !== undefined && canSubmit(type, values) && !files.some(({ file }) => tooLarge(file));

  // Another type keeps the files, in a role it takes.
  const reset = (next: TypeView | undefined) => {
    setType(next);
    setValues((was) => {
      const fresh = next ? initialValues(next) : {};
      // What you typed as the title and description stays.
      for (const k of ['title', 'description']) if (k in fresh && was[k]) fresh[k] = was[k];
      return fresh;
    });
    setError(undefined);
    const roles = next ? rolesFor(next) : [];
    setFiles((current) =>
      current.map((draft) =>
        roles.includes(draft.role) ? draft : { ...draft, role: firstRole(roles) },
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

  const change = (name: string, value: string) =>
    setValues((current: FormValues) => ({ ...current, [name]: value }));

  const submit = () => {
    if (!ready || posting) return;
    setPosting(true);
    setError(undefined);
    const row = preview.current?.querySelector('.row');
    createItem(collection.name, type.name, payloadOf(values), parent?.id, files).then(
      async (item) => {
        setCreated(item.id);
        const from = row?.getBoundingClientRect() ?? null;
        await landNewRow(item.id, from);
        if (alive.current) onCreated(item.id, from);
      },
      (failure: unknown) => {
        setPosting(false);
        setError(failure instanceof Error ? failure.message : t('common.failed'));
      },
    );
  };

  const slots = type ? intakeSlots(type) : [];
  const step = type && landing ? stateWord(type, landing.state) : '';
  const lede =
    type && landing ? ledeOf({ board: collection.name, parent: parent?.id, landing, step }) : '';
  // The row shows the first one-line choice made (a category) and the severity.
  const sevField = slots.find(({ field }) => field.module === 'severity')?.field;
  const level = sevField ? (sevField.values ?? []).indexOf(values[sevField.name] ?? '') + 1 : 0;
  const tagField = slots.find(
    ({ field }) =>
      field.module === 'enum' && values[field.name] && values[field.name] !== field.default,
  )?.field;

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
      <Swap k={lede} as="p" className="lede" dy={3}>
        <span data-c="">{lede}</span>
      </Swap>
      {parent ? (
        <div className="ffield" data-c="">
          <span className="flab">{t('intake.childOf')}</span>
          <div className="chips">
            <ChipButton
              on
              disabled={posting}
              onClick={unparent}
              aria-label={t('intake.unparent', { id: parent.id })}
            >
              <span className="id">{parent.id}</span> {parent.title}
              <Icon name="x" />
            </ChipButton>
          </div>
        </div>
      ) : null}
      <div className="ffield" data-c="">
        <span className="flab" id="intake-board">
          {t('intake.board')}
        </span>
        <fieldset className="chips" aria-labelledby="intake-board">
          {collections.map(({ name }) => (
            <ChipButton
              key={name}
              on={name === collection.name}
              disabled={posting}
              onClick={() => choose(name)}
            >
              {name}
            </ChipButton>
          ))}
        </fieldset>
      </div>
      {parent && types.length === 0 ? (
        <p className="fnote">{t('intake.noTypes', { id: parent.id })}</p>
      ) : null}
      {types.length > 1 ? (
        <div className="ffield" data-c="">
          <span className="flab" id="intake-type">
            {t('intake.type')}
          </span>
          <fieldset className="chips" aria-labelledby="intake-type">
            {types.map((each) => (
              <ChipButton
                key={each.name}
                on={each.name === type?.name}
                disabled={posting}
                onClick={() => reset(each)}
              >
                {typeWord(each, each.name)}
              </ChipButton>
            ))}
          </fieldset>
        </div>
      ) : null}
      {slots.map(({ field, at }) => {
        const own = OWN_WORDS[field.name];
        return (
          <div key={`${collection.name}:${type?.name}:${field.name}`} data-c="" className="fwrap">
            <FieldControl
              slot={slotData(at)}
              id={`intake-${field.name}`}
              field={field}
              value={values[field.name] ?? ''}
              disabled={posting}
              onChange={(value) => change(field.name, value)}
              label={own ? t(own.label) : fieldWord(type, field.name)}
              placeholder={own ? t(own.ph) : undefined}
            />
          </div>
        );
      })}
      {type ? (
        <div data-c="" className="fwrap">
          <IntakeFiles
            drafts={files}
            roles={roles}
            disabled={posting}
            onAdd={addFiles}
            onRole={setRole}
            onRemove={removeFile}
          />
        </div>
      ) : null}
      {type && landing ? (
        <LandsAs
          list={preview}
          id={created ?? nextId(collection.prefix, ids)}
          title={(values.title ?? '').trim()}
          state={step}
          landing={landing}
          field={tagField ? values[tagField.name] : undefined}
          level={level > 0 ? level : undefined}
        />
      ) : null}
      {start?.incomplete ? <p className="fnote">{startMessage(start, type)}</p> : null}
      <div className="fbtns" data-c="">
        <Button type="submit" variant="primary" disabled={!ready || posting}>
          {t(posting ? 'intake.creating' : 'intake.create')}
        </Button>
        <Button variant="quiet" disabled={posting} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <span className="hint">{t('intake.hint', { board: collection.name })}</span>
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
  // The board it starts in (an empty board's "Nuevo ítem en…", a rail "+"); else the first one.
  board?: string | undefined;
  // Set by "+ hijo": the form starts in the parent's board.
  parent?: IntakeParent | undefined;
  onCancel: () => void;
  onCreated: (id: string, from: DOMRect | null) => void;
  // Today's DetailHost stub still passes these; the form reads the app's data instead.
  collection?: string | undefined;
  connection?: Connection;
  ids?: readonly string[];
};

export function NewItemForm({ board, parent, collection, onCancel, onCreated }: NewItemFormProps) {
  const app = useApp();
  const collections = app.collections;
  const wanted = parent?.collection ?? board ?? collection;
  const first = collections.find(({ name }) => name === wanted) ?? collections[0];
  return (
    <div className="nform">
      <div className="sheet-bar" data-c="">
        <div className="crumb">
          <Icon name="plus" />
          <span>{t('app.newItem')}</span>
        </div>
        <div className="bar-r">
          <GhostButton onClick={onCancel}>{t('common.close')}</GhostButton>
        </div>
      </div>
      <h1 data-c="">{t('app.newItem')}</h1>
      {first ? (
        <IntakeForm
          collections={collections}
          first={first}
          ids={app.all.map((each) => each.id)}
          parent={parent}
          onCancel={onCancel}
          onCreated={onCreated}
        />
      ) : app.items.status === 'loading' ? (
        <p className="lede">{t('common.loading')}</p>
      ) : (
        <p className="lede">
          {tx('intake.noCollections', { command: <code>otea collection add &lt;name&gt;</code> })}
        </p>
      )}
    </div>
  );
}
