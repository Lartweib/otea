import { useEffect, useRef, useState } from 'react';
import { isClosed, positionOf } from '../../../src/core/board/engine.ts';
import { createItem } from '../api.ts';
import { useApp } from '../app/context.tsx';
import { boardOfCollection, boardsOf, useBoards } from '../board-studio/home/boards-store.ts';
import { t, tx } from '../i18n/i18n.ts';
import {
  canSubmit,
  type FormValues,
  initialValues,
  intakeParts,
  landingOf,
  ledeOf,
  nextId,
  payloadOf,
  startMessage,
  startOf,
} from '../intake.ts';
import { type FileDraft, firstRole, rolesFor, tooLarge, withFiles } from '../intake-files.ts';
import { intakeSlots, intakeTypes, slotData, typeOf } from '../item-types.ts';
import { Button, ChipButton, GhostButton, Icon, Swap, toast } from '../kit/index.ts';
import { fieldWord, stateWord, typeWord, valueWord } from '../preset-words.ts';
import type { CollectionView, EvidenceRole, TypeView } from '../types.ts';
import { useStudioBoard } from '../views/board/studio-board.tsx';
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
  const [moreOpen, setMoreOpen] = useState(false);
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
  // On a Studio board that is part of another ("Cada Cambio se divide en Tareas de repo"): the
  // parent is "Parte de", and a split that says always needs one before Crear.
  const app = useApp();
  const summaries = boardsOf(useBoards(app.version));
  const here = boardOfCollection(summaries, collection.name);
  const parentBoard = here
    ? summaries.find((b) => b.id !== here.id && b.definition.split?.board === here.id)
    : undefined;
  const needsParent = !!parentBoard?.definition.split?.always && !!parentBoard.collection;
  const parentChoices = needsParent
    ? app.all.filter((x) => x.collection === parentBoard?.collection && !x.closes).slice(0, 12)
    : [];
  const live = useStudioBoard(collection.name)?.live;
  const ready =
    type !== undefined &&
    canSubmit(type, values) &&
    !files.some(({ file }) => tooLarge(file)) &&
    !(needsParent && !parent);

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
        // A first step nobody reviews that it already had everything for: it starts at the next.
        const [first, second] = live?.steps ?? [];
        const at = positionOf(item.state);
        if (first?.skipWhenReady && second && !isClosed(at) && at.step === second.id)
          toast({ msg: t('bi.create.skipped', { step: second.name, first: first.name }) });
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
  const parts = intakeParts(slots);
  // Said once, under the fields, instead of under each one.
  const agentFills = slots.some(({ field }) => field.required === 'complete');
  const control = ({ field, at }: (typeof slots)[number]) => {
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
          word={(v) => valueWord(type, field.name, v)}
          hinted={false}
        />
      </div>
    );
  };
  const step = type && landing ? stateWord(type, landing.state) : '';
  const lede =
    type && landing
      ? ledeOf({ board: collection.name, parent: parent?.id, part: !!here, landing, step })
      : '';
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
          <span className="flab">{here ? t('bi.partOf') : t('intake.childOf')}</span>
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
      {needsParent && !parent ? (
        <div className="ffield" data-c="">
          <span className="flab" id="intake-partof">
            {t('bi.partOf')}
          </span>
          {parentChoices.length ? (
            <fieldset className="chips" aria-labelledby="intake-partof">
              {parentChoices.map((x) => (
                <ChipButton
                  key={x.id}
                  disabled={posting}
                  onClick={() =>
                    setParent({ id: x.id, title: x.title, type: x.type, collection: x.collection })
                  }
                >
                  <span className="id">{x.id}</span> {x.title}
                </ChipButton>
              ))}
            </fieldset>
          ) : null}
          <p className="fnote">
            {parentChoices.length
              ? t('bi.create.pickParent', { item: parentBoard?.item ?? '' })
              : t('bi.create.noParent', { board: parentBoard?.name ?? '' })}
          </p>
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
      {parts.shown.map(control)}
      {parts.more.length > 0 ? (
        <div className="ffield fmore" data-c="">
          <span className="flab" />
          <div className="fctl">
            <button
              type="button"
              className="ghost-btn"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((o) => !o)}
            >
              {moreOpen ? t('intake.fewer') : t('intake.more', { count: parts.more.length })}
            </button>
          </div>
        </div>
      ) : null}
      {moreOpen ? parts.more.map(control) : null}
      {agentFills ? (
        <p className="fnote" data-c="">
          {t('intake.agentFills')}
        </p>
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
};

export function NewItemForm({ board, parent, onCancel, onCreated }: NewItemFormProps) {
  const app = useApp();
  const collections = app.collections;
  // A part's Crear names the board it lands on (Tareas de repo), not its parent's.
  const wanted = board ?? parent?.collection;
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
