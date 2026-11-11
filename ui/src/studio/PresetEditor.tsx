import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { FieldModule, ModuleKind } from '../../../src/core/modules.ts';
import type { Preset } from '../../../src/core/preset.ts';
import { ItemDetail } from '../components/ItemDetail.tsx';
import { ItemList } from '../components/ItemList.tsx';
import { IntakeForm } from '../components/NewItemForm.tsx';
import { EvidenceFiles } from '../evidence-files.ts';
import type { Connection } from '../hooks.ts';
import { useRemote } from '../hooks.ts';
import { type PlainKey, t } from '../i18n/i18n.ts';
import { TypeIcon } from '../icons/TypeIcon.tsx';
import { Button, Icon, Seg } from '../kit/index.ts';
import { NodeGlyph } from '../lanes/NodeGlyph.tsx';
import { nestSections } from '../nesting.ts';
import { stateWord } from '../preset-words.ts';
import { groupItems } from '../sections.ts';
import { studioHash } from '../selection.ts';
import type { Item, ItemView, LayoutSlot } from '../types.ts';
import { AddHere, type Gap } from './AddPart.tsx';
import {
  duplicatePreset,
  fetchPresetSamples,
  fetchPresetSource,
  type PresetSamples,
  type PresetSource,
  sampleFileUrl,
  savePreset,
} from './api.ts';
import { Canvas } from './Canvas.tsx';
import { entryOfPart, type Part, type Placed } from './canvas.ts';
import { diffLines, rawOf, readDraft, workflowOf } from './draft.ts';
import { Inspector } from './Inspector.tsx';
import { LaneInspector } from './LaneInspector.tsx';
import { type LaneChoice, LanesEdit } from './LanesEdit.tsx';
import { addField, addModule, shownIn } from './layout-edit.ts';
import { stateLook } from './looks.ts';
import { Outline } from './Outline.tsx';
import { PlaybookSection } from './Playbook.tsx';
import { OkMark, ProblemMark } from './parts.tsx';
import { type DraftPreview, draftPreview } from './preview.ts';
import { GatesSection, LayoutSection, ViewsSection } from './sections.tsx';
import { Tray } from './Tray.tsx';
import { applyFix, type DraftText, noteKey, trayRows } from './tray.ts';

// A preset in Studio is the item you are going to see: a sample item drawn from the draft with the
// real views, the parts you click on, and an inspector that asks about the part in plain words. A
// project preset is edited as a draft, kept in this browser until it is saved; the core reads the
// draft on every change, and save waits until it reads no problem. An official preset is only
// read: duplicate it into the project to change it.

export type Draft = { base: string; yaml: string; playbooks: Record<string, string> };

const draftKey = (name: string) => `otea.studio.draft.${name}`;

export function storedDraft(name: string, base: string): Draft | undefined {
  try {
    const text = window.localStorage.getItem(draftKey(name));
    const draft = text === null ? undefined : (JSON.parse(text) as Draft);
    return draft?.base === base ? draft : undefined;
  } catch {
    return undefined;
  }
}

// Also how the blueprint's gate fix opens a draft of the preset it changes.
export function storeDraft(name: string, draft: Draft | undefined): void {
  try {
    if (draft === undefined) window.localStorage.removeItem(draftKey(name));
    else window.localStorage.setItem(draftKey(name), JSON.stringify(draft));
  } catch {
    // The draft still lives in this tab; it is just not kept across a reload.
  }
}

type PresetEditorProps = {
  name: string;
  connection: Connection;
  canWrite: boolean;
  phone: boolean;
  items: readonly Item[];
  onSaved: () => void;
};

export function PresetEditor(props: PresetEditorProps) {
  const [revision, setRevision] = useState(0);
  // The loaders keep their identity: useRemote loads again whenever its loader changes.
  const loadSource = useMemo(() => fetchPresetSource(props.name), [props.name]);
  const loadSamples = useMemo(() => fetchPresetSamples(props.name), [props.name]);
  const source = useRemote(loadSource, revision, props.connection);
  const samples = useRemote(loadSamples, revision, props.connection);
  if (source.status === 'loading') return <p className="st-small st-msg">{t('common.loading')}</p>;
  if (source.status === 'failed') return <p className="st-error st-msg">{source.message}</p>;
  return (
    <Loaded
      key={`${source.value.name}-${source.value.yaml.length}-${source.value.version}`}
      {...props}
      source={source.value}
      samples={samples.status === 'ready' ? samples.value : undefined}
      onSaved={() => {
        setRevision((current) => current + 1);
        props.onSaved();
      }}
    />
  );
}

// The playbooks a draft points to: the preset's, then each type's.
function playbookFiles(
  raw: ReturnType<typeof rawOf>,
): Array<{ path: string; owner: string | undefined }> {
  const files: Array<{ path: string; owner: string | undefined }> = [];
  if (raw.playbook) files.push({ path: raw.playbook, owner: undefined });
  for (const [type, spec] of Object.entries(raw.types ?? {})) {
    if (spec?.playbook && !files.some(({ path }) => path === spec.playbook))
      files.push({ path: spec.playbook, owner: type });
  }
  return files;
}

type LoadedProps = PresetEditorProps & {
  source: PresetSource;
  samples: PresetSamples | undefined;
};

function Loaded({ source, samples, canWrite, phone, items, onSaved }: LoadedProps) {
  const [draft, setDraft] = useState<Draft | undefined>(() =>
    storedDraft(source.name, source.yaml),
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<Part>();
  const [view, setView] = useState<View>('detail');
  const [chosen, setChosen] = useState<string>();
  const [lane, setLane] = useState<LaneChoice>();
  const [trayOpen, setTrayOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [page, setPage] = useState<Page>();
  const [intended, setIntended] = useState<string[]>(() => storedIntended(source.name));
  const [now] = useState(() => new Date().toISOString());
  const yaml = draft?.yaml ?? source.yaml;
  const playbooks = { ...source.playbooks, ...(draft?.playbooks ?? {}) };
  const raw = rawOf(yaml);
  const reading = readDraft(yaml, playbooks);
  const lastGood = useRef<Preset | undefined>(undefined);
  if (reading.ok) lastGood.current = reading.preset;
  const preset = lastGood.current;
  const typeNames = preset?.types.map(({ name }) => name) ?? [];
  const [type, setType] = useState<string | undefined>(typeNames[0]);
  const shown = type !== undefined && typeNames.includes(type) ? type : typeNames[0];
  const files = playbookFiles(raw);
  const missing = files
    .filter(({ path }) => playbooks[path] === undefined)
    .map(({ path }) => `playbook: ${path} does not exist`);
  const problems = [...(reading.ok ? [] : reading.problems), ...missing];
  const editable = source.editable && canWrite && !phone;
  const dirty =
    draft !== undefined &&
    (draft.yaml !== source.yaml ||
      Object.entries(draft.playbooks).some(([path, text]) => source.playbooks[path] !== text));
  const next = (source.version ?? 0) + 1;
  useEffect(() => storeDraft(source.name, dirty ? draft : undefined), [source.name, draft, dirty]);
  const change = editable
    ? (text: string) =>
        setDraft({ base: source.yaml, yaml: text, playbooks: draft?.playbooks ?? {} })
    : undefined;
  const collection = source.collections[0]?.name ?? source.name;
  const preview = useMemo(
    () =>
      preset && samples
        ? draftPreview(preset, { yaml: samples.yaml, files: samples.files }, { collection, now })
        : undefined,
    [preset, samples, collection, now],
  );
  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const sent = Object.fromEntries(
        files
          .filter(({ path }) => path in playbooks)
          .map(({ path }) => [path, playbooks[path] as string]),
      );
      await savePreset(source.name, yaml, sent);
      storeDraft(source.name, undefined);
      setDraft(undefined);
      setConfirming(false);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.failed'));
    } finally {
      setBusy(false);
    }
  };
  const boards = source.collections.map(({ name }) => name);
  const used = (field: string) =>
    items.filter(
      (item) =>
        boards.includes(item.collection) &&
        item.type === shown &&
        (item.fields[field] ?? '') !== '',
    ).length;
  const drawn =
    preview?.items.find(
      (row) => row.type === shown && (chosen === undefined || row.id === chosen),
    ) ?? preview?.items.find((row) => row.type === shown);
  const evidence = drawn ? preview?.view(drawn.id)?.evidence : undefined;
  const sample = drawn && {
    id: drawn.id,
    files: (module: string) => (evidence ?? []).filter((entry) => entry.module === module).length,
  };
  const notes = reading.ok ? reading.notes.filter(({ code }) => !code.startsWith('sample_')) : [];
  const rows = trayRows(notes).filter(({ note }) => !intended.includes(noteKey(note)));
  const setPlaybooks = (text: DraftText) =>
    setDraft({
      base: source.yaml,
      yaml: text.yaml,
      playbooks: Object.fromEntries(
        Object.entries(text.playbooks).filter(([path, body]) => source.playbooks[path] !== body),
      ),
    });
  const views = phone ? VIEWS.filter((each) => each !== 'phone') : VIEWS;
  const open = (next: View) => {
    setView(next);
    setPage(undefined);
    setSelected(undefined);
  };
  // Opens the place a note or an index entry is about: a field in the detail, a state on the lanes,
  // a gate's page.
  const show = (target: { field?: string; state?: string; gate?: string; type?: string }) => {
    if (target.type && typeNames.includes(target.type)) setType(target.type);
    const on = target.type ?? shown;
    if (target.field !== undefined && on !== undefined) {
      const slot = shownIn(preset, on, target.field)[0];
      const index = slot
        ? (preset?.types.find(({ name }) => name === on)?.layout[slot] ?? []).findIndex(
            (entry) => entry.field === target.field,
          )
        : -1;
      open('detail');
      setSelected({ type: on, slot: slot ?? 'body', index, field: target.field });
    } else if (target.state !== undefined) {
      open('lanes');
      setLane({ kind: 'state', name: target.state });
    } else if (target.gate !== undefined) {
      setPage('gates');
    }
    setTrayOpen(false);
  };
  const sectionProps = {
    raw,
    yaml,
    change,
    type: shown,
    problems,
    preset,
  };
  return (
    <div className="st-preset st-studio">
      <header className="st-head">
        <div className="st-hl">
          <a className="st-crumb st-mono" href={studioHash()}>
            {t('studio.crumbPreset')}
          </a>
          <h1 className="st-name">{source.name}</h1>
          <span className="st-ver">
            {source.origin === 'official'
              ? t('studio.preset.official')
              : dirty
                ? t('studio.preset.draftOf', { version: next })
                : t('studio.preset.saved', { version: source.version ?? '?' })}
          </span>
        </div>
        <div className="st-hr">
          {canWrite && !phone ? (
            <a
              className="btn sm quiet st-customize"
              href={`#/customize/preset/${encodeURIComponent(source.name)}`}
            >
              <Icon name="sliders" />
              {t('studio.start.customize')}
            </a>
          ) : null}
          <Verdict problems={problems.length} />
          {notes.length > 0 ? (
            <span className="st-offscreen-at">
              <button
                type="button"
                className="st-offscreen"
                aria-expanded={trayOpen}
                onClick={() => setTrayOpen(!trayOpen)}
              >
                <Icon name="warn" />
                {t('studio.notOnScreen', { count: rows.length })}
                <Icon name="chevron" />
              </button>
              {trayOpen ? (
                <Tray
                  rows={rows}
                  onShow={(note) => show(note.path)}
                  onFix={
                    change &&
                    ((row, fix) => {
                      if (fix.kind === 'intended') {
                        const next = [...intended, noteKey(row.note)];
                        setIntended(next);
                        storeIntended(source.name, next);
                        return;
                      }
                      setPlaybooks(applyFix({ yaml, playbooks }, preset, row.note, fix));
                    })
                  }
                />
              ) : null}
            </span>
          ) : null}
          {source.origin === 'official' ? (
            canWrite && !phone ? (
              <Duplicate name={source.name} />
            ) : null
          ) : editable ? (
            <>
              <Button
                variant="quiet"
                size="sm"
                disabled={!dirty}
                onClick={() => {
                  storeDraft(source.name, undefined);
                  setDraft(undefined);
                }}
              >
                {t('studio.discard')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!dirty || problems.length > 0}
                onClick={() => setConfirming(true)}
              >
                {t('studio.preset.save', { version: next })}
              </Button>
            </>
          ) : null}
        </div>
      </header>
      {phone ? (
        <p className="st-phone-strip">
          <Icon name="eye" />
          {t('studio.phone.readOnly')}
        </p>
      ) : null}
      <div className="st-bar">
        {typeNames.length > 0 ? (
          <div className="st-bar-group">
            <span className="st-bar-k">{t('studio.bar.type')}</span>
            <Seg
              label={t('studio.bar.type')}
              value={shown ?? ''}
              options={(preset?.types ?? []).map((each) => ({
                value: each.name,
                label: each.name,
                ...(each.icon ? { icon: <TypeIcon name={each.icon} size={14} /> } : {}),
              }))}
              onChange={(name) => {
                setType(name);
                setSelected(undefined);
                setLane(undefined);
              }}
            />
          </div>
        ) : null}
        <div className="st-bar-group">
          <span className="st-bar-k">{t('studio.bar.view')}</span>
          <Seg
            label={t('studio.bar.view')}
            className={page === undefined ? '' : 'st-seg-none'}
            value={page === undefined ? view : ''}
            options={views.map((each) => ({ value: each, label: t(VIEW_LABEL[each]) }))}
            onChange={(each) => open(each as View)}
          />
        </div>
        {phone ? null : (
          <button
            type="button"
            className="st-bar-end st-ix-toggle"
            aria-pressed={indexOpen}
            onClick={() => setIndexOpen(!indexOpen)}
          >
            <Icon name="list" />
            {t('studio.bar.index')}
          </button>
        )}
      </div>
      <div
        className="st-cols"
        data-view={page ? 'page' : view}
        data-index={indexOpen && !phone ? 'on' : undefined}
        data-phone={phone ? 'on' : undefined}
      >
        {indexOpen && !phone && shown !== undefined ? (
          <Outline
            raw={raw}
            preset={preset}
            type={shown}
            notes={notes}
            playbooks={files.length}
            current={selected?.field}
            onHide={() => setIndexOpen(false)}
            onPick={(pick) => {
              if (pick.kind === 'field') show({ field: pick.name });
              else if (pick.kind === 'states' || pick.kind === 'moves') open('lanes');
              else setPage(pick.page);
            }}
          />
        ) : null}
        {page && shown !== undefined ? (
          <section className="st-stage st-page-sec">
            <button type="button" className="btn sm quiet" onClick={() => setPage(undefined)}>
              <Icon name="left" />
              {t('studio.page.back')}
            </button>
            {page === 'gates' ? <GatesSection {...sectionProps} /> : null}
            {page === 'views' ? <ViewsSection {...sectionProps} /> : null}
            {page === 'layout' ? <LayoutSection {...sectionProps} /> : null}
            {page === 'playbook' ? (
              <PlaybookSection
                files={files}
                playbooks={playbooks}
                type={shown}
                yaml={yaml}
                change={change}
                setPlaybook={
                  change &&
                  ((path, text) =>
                    setPlaybooks({ yaml, playbooks: { ...playbooks, [path]: text } }))
                }
                setDraftAll={
                  change &&
                  ((text, path) =>
                    setPlaybooks({ yaml: text, playbooks: { ...playbooks, [path]: '' } }))
                }
              />
            ) : null}
          </section>
        ) : view === 'lanes' && shown !== undefined ? (
          <section className="st-stage">
            <LanesEdit
              raw={raw}
              type={shown}
              incomplete={workflowOf(raw, shown).incomplete}
              width={620}
              choice={lane}
              onChoose={setLane}
              editable={change !== undefined}
            />
          </section>
        ) : shown !== undefined && preview ? (
          <Stage
            key={shown}
            name={source.name}
            preview={preview}
            type={shown}
            view={view}
            chosen={chosen}
            onChoose={setChosen}
            selected={phone ? undefined : selected}
            onSelect={phone ? () => {} : setSelected}
            withSamples={!indexOpen && !phone}
            adding={
              change && {
                taken: (field) =>
                  raw.fields?.[field] !== undefined ||
                  Object.values(raw.types ?? {}).some(
                    (spec) => spec?.fields?.[field] !== undefined,
                  ),
                onField: (gap, field, module) => {
                  change(addField(yaml, preset, shown, gap.slot, gap.index, field, module));
                  setSelected({ type: shown, slot: gap.slot, index: gap.index, field });
                },
                onModule: (gap, module) => {
                  change(addModule(yaml, preset, shown, gap.slot, gap.index, module));
                  setSelected({ type: shown, slot: gap.slot, index: gap.index });
                },
              }
            }
          />
        ) : (
          <p className="st-small st-msg st-stage">
            {preset ? t('common.loading') : t('studio.preview.invalid')}
          </p>
        )}
        {phone ? null : view === 'lanes' && lane && shown !== undefined ? (
          <LaneInspector
            raw={raw}
            yaml={yaml}
            type={shown}
            choice={lane}
            change={change}
            onChoose={setLane}
            sitting={(state) =>
              items.filter(
                (item) =>
                  boards.includes(item.collection) && item.type === shown && item.state === state,
              ).length
            }
          />
        ) : view !== 'lanes' && selected && shown !== undefined ? (
          <Inspector
            raw={raw}
            yaml={yaml}
            preset={preset}
            type={shown}
            part={selected}
            change={change}
            used={used}
            onSelect={setSelected}
            sample={sample}
          />
        ) : (
          <aside className="st-insp" aria-label={t('studio.inspect.title')}>
            <p className="st-ask-n">{t('studio.inspect.pick')}</p>
          </aside>
        )}
      </div>
      {phone ? (
        <div className="st-phone-card">
          <b>{t('studio.phone.edit')}</b>
          <p>{t('studio.phone.editNote')}</p>
        </div>
      ) : null}
      {confirming ? (
        <SaveConfirm
          source={source}
          yaml={yaml}
          preset={reading.ok ? reading.preset : undefined}
          items={items}
          version={next}
          busy={busy}
          error={error}
          onSave={save}
          onBack={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

export type View = 'detail' | 'form' | 'row' | 'lanes' | 'phone';

const VIEWS: readonly View[] = ['detail', 'form', 'row', 'lanes', 'phone'];

// What no view draws opens from the index as a page of its own.
type Page = 'gates' | 'views' | 'playbook' | 'layout';

const intendedKey = (name: string) => `otea.studio.intended.${name}`;

function storedIntended(name: string): string[] {
  try {
    const text = window.localStorage.getItem(intendedKey(name));
    return text === null ? [] : (JSON.parse(text) as string[]);
  } catch {
    return [];
  }
}

function storeIntended(name: string, keys: readonly string[]): void {
  try {
    window.localStorage.setItem(intendedKey(name), JSON.stringify(keys));
  } catch {
    // Kept for this tab only.
  }
}

const VIEW_LABEL: Record<View, PlainKey> = {
  detail: 'studio.view.detail',
  form: 'studio.view.form',
  row: 'studio.view.row',
  lanes: 'studio.view.lanes',
  phone: 'studio.view.phone',
};

type Adding = {
  taken: (field: string) => boolean;
  onField: (gap: Gap, field: string, module: FieldModule) => void;
  onModule: (gap: Gap, module: ModuleKind) => void;
};

type StageProps = {
  name: string;
  preview: DraftPreview;
  type: string;
  view: View;
  chosen: string | undefined;
  onChoose: (id: string) => void;
  selected: Part | undefined;
  onSelect: (part: Part | undefined) => void;
  // Undefined while the preset cannot be edited here: no + field here.
  adding: Adding | undefined;
  // Off while the index takes the column, and on a phone.
  withSamples: boolean;
};

// A field the sample leaves empty draws nothing; the chosen one shows that it has no value yet, so
// a field just added is seen where it went.
function withChosen(item: ItemView | undefined, field: string | undefined): ItemView | undefined {
  if (!item || field === undefined || (item.fields[field] ?? '') !== '') return item;
  return { ...item, fields: { ...item.fields, [field]: t('studio.canvas.noValue') } };
}

const NO_FOLDS = { collapsed: new Set<string>(), expanded: new Set<string>() };

// The view being edited, drawn with the real components: the sample items as list rows on the
// left (but in the row view, where the rows are the preview), and the chosen one in the middle.
function Stage({
  name,
  preview,
  type,
  view,
  chosen,
  onChoose,
  selected,
  onSelect,
  adding,
  withSamples,
}: StageProps) {
  const rows = preview.items.filter((item) => item.type === type);
  const id = rows.some((row) => row.id === chosen) ? chosen : rows[0]?.id;
  const item = withChosen(id === undefined ? undefined : preview.view(id), selected?.field);
  const shape = preview.collection.types.find((each) => each.name === type);
  const entryAt = (slot: LayoutSlot, index: number) => shape?.layout[slot][index];
  const moduleName = (part: Part) => (shape ? entryOfPart(shape.layout, part)?.id : undefined);
  const nameAt = (slot: LayoutSlot, index: number) => {
    const entry = entryAt(slot, index);
    return entry?.field ?? entry?.id ?? entry?.module;
  };
  const marks = adding
    ? (placed: readonly Placed[], slot: LayoutSlot | undefined) => (
        <AddHere placed={placed} slots={[slot, selected?.slot]} nameAt={nameAt} {...adding} />
      )
    : undefined;
  const canvas = (label: string, drawn: ReactNode) => (
    <EvidenceFiles.Provider value={(evidence) => sampleFileUrl(name, evidence.filename)}>
      <Canvas
        type={type}
        label={label}
        selected={selected}
        onSelect={onSelect}
        nameOf={moduleName}
        marks={marks}
      >
        {drawn}
      </Canvas>
    </EvidenceFiles.Provider>
  );
  let drawn: ReactNode;
  if (view === 'row') {
    const nesting = nestSections(groupItems(rows, 'turn', preview.collection), NO_FOLDS);
    const order = (shape?.layout.row ?? []).map((entry) => entry.field ?? entry.module);
    drawn = (
      <>
        {canvas(
          t('studio.canvas.rows'),
          <ItemList
            sections={nesting.sections}
            nesting={nesting.rows}
            selectedId={undefined}
            collectionOf={() => preview.collection}
            scope={`studio:${type}`}
          />,
        )}
        <p className="st-stage-n">{t('studio.row.note', { order: order.join(' · ') })}</p>
      </>
    );
  } else if (view === 'form') {
    drawn = canvas(
      t('studio.canvas.form'),
      <article className="detail st-form-card">
        <IntakeForm
          key={type}
          collections={[{ ...preview.collection, types: shape ? [shape] : [] }]}
          first={{ ...preview.collection, types: shape ? [shape] : [] }}
          ids={[]}
          parent={undefined}
          onCancel={() => {}}
          onCreated={() => {}}
        />
      </article>,
    );
  } else if (view === 'phone') {
    drawn = item ? (
      <div className="st-phone-frame">
        {canvas(
          t('studio.canvas.aria', { id: item.id }),
          <ItemDetail
            item={item}
            canWrite={false}
            collection={preview.collection}
            collectionOf={() => preview.collection}
          />,
        )}
      </div>
    ) : (
      <p className="st-small st-msg">{t('studio.samples.noneOfType', { type })}</p>
    );
  } else {
    drawn = item ? (
      canvas(
        t('studio.canvas.aria', { id: item.id }),
        <ItemDetail
          item={item}
          canWrite
          collection={preview.collection}
          collectionOf={() => preview.collection}
        />,
      )
    ) : (
      <p className="st-small st-msg">{t('studio.samples.noneOfType', { type })}</p>
    );
  }
  return (
    <>
      {view === 'row' || view === 'phone' || !withSamples ? null : (
        <SampleList
          rows={rows}
          preview={preview}
          chosen={id}
          onChoose={onChoose}
          collection={preview.collection.name}
        />
      )}
      <section className="st-stage">{drawn}</section>
    </>
  );
}

type SampleListProps = {
  rows: readonly Item[];
  preview: DraftPreview;
  chosen: string | undefined;
  onChoose: (id: string) => void;
  collection: string;
};

// The sample items as the list draws its rows: the node, the title, the id and the state, and the
// severity when the type has one.
function SampleList({ rows, preview, chosen, onChoose, collection }: SampleListProps) {
  return (
    <nav className="st-samples" aria-label={t('studio.samples.title')}>
      <div className="st-samples-h">
        <span>{t('studio.samples.title')}</span>
        <span>{rows.length}</span>
      </div>
      <ul>
        {rows.map((row) => {
          const type = preview.collection.types.find(({ name }) => name === row.type);
          const severity = type?.fields.find(({ module }) => module === 'severity');
          const level = severity ? row.fields[severity.name] : undefined;
          return (
            <li key={row.id}>
              <button
                type="button"
                className="st-sample"
                aria-pressed={row.id === chosen}
                onClick={() => onChoose(row.id)}
              >
                <NodeGlyph
                  look={stateLook(
                    type?.states.find(({ name }) => name === row.state) ?? { turn: row.turn },
                    row.state === type?.incomplete,
                  )}
                  size={16}
                />
                <span className="st-sample-t">{row.title}</span>
                <span className="st-sample-m">
                  {`${row.id} · ${stateWord(type, row.state)}`}
                  {level ? <SeverityBars level={level} /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="st-samples-n">{t('studio.samples.note', { collection })}</p>
    </nav>
  );
}

const LEVELS = ['low', 'medium', 'high', 'critical'];

function SeverityBars({ level }: { level: string }) {
  const at = LEVELS.indexOf(level) + 1;
  return (
    <span className="st-bars" data-level={at} role="img" aria-label={level}>
      {LEVELS.map((name, index) => (
        <i key={name} data-on={index < at || undefined} />
      ))}
    </span>
  );
}

function Verdict({ problems }: { problems: number }) {
  return problems === 0 ? (
    <span className="st-vs ok">
      <OkMark />
      <span>
        <b>{t('studio.valid')}</b> · {t('studio.validNote')}
      </span>
    </span>
  ) : (
    <span className="st-vs bad">
      <ProblemMark />
      <span>
        <b>{t('studio.problems', { count: problems })}</b> · {t('studio.saveWaits')}
      </span>
    </span>
  );
}

function Duplicate({ name }: { name: string }) {
  const [as, setAs] = useState(`${name}-copy`);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="st-dup"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
          const copy = await duplicatePreset(name, as.trim());
          window.location.hash = studioHash({ kind: 'preset', name: copy.name });
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : t('common.failed'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        className="st-input st-mono"
        value={as}
        onChange={(event) => setAs(event.target.value)}
        aria-label={t('studio.preset.copyName')}
        spellCheck={false}
      />
      <Button variant="primary" size="sm" type="submit" disabled={busy || as.trim() === ''}>
        {t('studio.preset.duplicate')}
      </Button>
      {error ? <span className="st-error st-small">{error}</span> : null}
    </form>
  );
}

type SaveConfirmProps = {
  source: PresetSource;
  yaml: string;
  preset: Preset | undefined;
  items: readonly Item[];
  version: number;
  busy: boolean;
  error: string | undefined;
  onSave: () => void;
  onBack: () => void;
};

// Before writing: the YAML that changes, and the items left in a state or type the draft removes.
function SaveConfirm({
  source,
  yaml,
  preset,
  items,
  version,
  busy,
  error,
  onSave,
  onBack,
}: SaveConfirmProps) {
  const boards = source.collections.map(({ name }) => name);
  const stranded = items.filter((item) => {
    if (!boards.includes(item.collection) || preset === undefined) return false;
    const shape = preset.types.find(({ name }) => name === item.type);
    return shape === undefined || !shape.workflow.states.some(({ name }) => name === item.state);
  });
  const changed = diffLines(source.yaml, yaml).filter((line) => line.kind !== 'same');
  return (
    <div
      className="st-confirm"
      role="dialog"
      aria-modal="true"
      aria-label={t('studio.preset.save', { version })}
    >
      <div className="st-confirm-card st-raised">
        <h2 className="st-h">{t('studio.preset.save', { version })}</h2>
        <pre className="st-src">
          {changed.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
            <span key={index} className={line.kind}>
              {line.kind === 'add' ? '+ ' : '- '}
              {line.text}
              {'\n'}
            </span>
          ))}
        </pre>
        {stranded.length > 0 ? (
          <p className="st-note">
            <Icon name="warn" />
            <span>
              {t('studio.preset.stranded', {
                count: stranded.length,
                ids: stranded
                  .slice(0, 4)
                  .map(({ id }) => id)
                  .join(', '),
              })}
            </span>
          </p>
        ) : null}
        <p className="st-cap">
          {t('studio.preset.writes', { path: `.otea/presets/${source.name}/preset.yaml`, version })}
        </p>
        {error ? <p className="st-error st-small">{error}</p> : null}
        <div className="st-confirm-actions">
          <Button variant="primary" onClick={onSave} disabled={busy}>
            {t('studio.preset.save', { version })}
          </Button>
          <Button variant="quiet" onClick={onBack}>
            {t('studio.back')}
          </Button>
        </div>
      </div>
    </div>
  );
}
