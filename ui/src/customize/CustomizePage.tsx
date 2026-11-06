import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Preset } from '../../../src/core/preset.ts';
import { ItemDetail } from '../components/ItemDetail.tsx';
import { ItemList } from '../components/ItemList.tsx';
import { IntakeForm } from '../components/NewItemForm.tsx';
import { EvidenceFiles } from '../evidence-files.ts';
import { type Connection, useMediaQuery, useRemote } from '../hooks.ts';
import { t } from '../i18n/i18n.ts';
import { Button } from '../kit/index.ts';
import { nestSections } from '../nesting.ts';
import { groupItems } from '../sections.ts';
import { type CustomizeTarget, hashFor } from '../selection.ts';
import {
  customizeBoard,
  fetchPresetSamples,
  fetchPresetSource,
  fetchStudioPresets,
  type PresetSamples,
  type PresetSource,
  revertBoard,
  sampleFileUrl,
} from '../studio/api.ts';
import { Canvas } from '../studio/Canvas.tsx';
import { type Part, type Placed, slotBoxes } from '../studio/canvas.ts';
import { readDraft } from '../studio/draft.ts';
import { storeDraft, storedDraft } from '../studio/PresetEditor.tsx';
import { draftPreview } from '../studio/preview.ts';
import type { Item, ItemView } from '../types.ts';
import { ApplyDialog } from './ApplyDialog.tsx';
import { announce } from './applied.ts';
import { FieldMenu } from './FieldMenu.tsx';
import { LeftPanel } from './LeftPanel.tsx';
import {
  addField,
  changed,
  changesOf,
  commit,
  type Doc,
  type Drop,
  deleteField,
  docOf,
  type History,
  homeOf,
  KIND_WORD,
  move,
  patchThing,
  redo,
  refusal,
  setAlso,
  start,
  type Thing,
  undo,
  unplaced,
  yamlOf,
  ZONES,
  type Zone,
  zoneWord,
} from './model.ts';
import { NewField } from './NewField.tsx';
import { addOption, removeOption } from './options.ts';
import type { FieldKind } from './types.ts';

type View = 'detail' | 'form' | 'row';
const NO_FOLDS = { collapsed: new Set<string>(), expanded: new Set<string>() };
const FIXED = new Set(['title']);

type DragState = {
  id: string;
  x: number;
  y: number;
  over: Drop | undefined;
  why: string | undefined;
  line: { top: number; left: number; width: number } | undefined;
};

export function CustomizePage({
  target,
  items,
  version,
  connection,
}: {
  target: CustomizeTarget;
  items: readonly Item[];
  version: number;
  connection: Connection;
}) {
  const wide = useMediaQuery('(min-width: 900px)');
  const blueprint = useRemote(fetchStudioPresets, version, connection);
  if (!wide)
    return (
      <main className="cz-page cz-msg">
        <p>{t('cz.desktopOnly')}</p>
      </main>
    );
  if (blueprint.status !== 'ready')
    return (
      <main className="cz-page cz-msg">
        <p>{t('cz.loading')}</p>
      </main>
    );
  const boards = blueprint.value.flatMap((summary) =>
    summary.collections.map((name) => ({ name, preset: summary.name })),
  );
  const item = target.kind === 'item' ? items.find(({ id }) => id === target.id) : undefined;
  const board =
    target.kind === 'item'
      ? item?.collection
      : (boards.find(({ preset }) => preset === target.name)?.name ?? target.name);
  const presetName =
    target.kind === 'preset' ? target.name : boards.find(({ name }) => name === board)?.preset;
  if (!board || !presetName)
    return (
      <main className="cz-page cz-msg">
        <p>{t('cz.noItem')}</p>
      </main>
    );
  return (
    <Loader
      key={presetName}
      presetName={presetName}
      board={board}
      type={item?.type}
      itemId={item?.id}
      count={items.filter((each) => each.collection === board).length}
      version={version}
      connection={connection}
    />
  );
}

function Loader(props: {
  presetName: string;
  board: string;
  type: string | undefined;
  itemId: string | undefined;
  count: number;
  version: number;
  connection: Connection;
}) {
  const load = useMemo(() => fetchPresetSource(props.presetName), [props.presetName]);
  const loadSamples = useMemo(() => fetchPresetSamples(props.presetName), [props.presetName]);
  const source = useRemote(load, props.version, props.connection);
  const samples = useRemote(loadSamples, props.version, props.connection);
  if (source.status !== 'ready' || samples.status !== 'ready')
    return (
      <main className="cz-page cz-msg">
        <p>{t('cz.loading')}</p>
      </main>
    );
  return <Builder {...props} source={source.value} samples={samples.value} />;
}

function Builder({
  source,
  samples,
  board,
  type: typeHint,
  itemId,
  count,
  presetName,
}: {
  source: PresetSource;
  samples: PresetSamples;
  board: string;
  type: string | undefined;
  itemId: string | undefined;
  count: number;
  presetName: string;
}) {
  const base = readDraft(source.yaml, source.playbooks);
  const basePreset = base.ok ? base.preset : undefined;
  const type = typeHint ?? basePreset?.types[0]?.name ?? '';
  const [hist, setHist] = useState<History | undefined>(() => {
    if (!basePreset) return undefined;
    const baseDoc = docOf(basePreset, type);
    const stored = storedDraft(presetName, source.yaml);
    const read = stored ? readDraft(stored.yaml, stored.playbooks) : undefined;
    return read?.ok ? { ...start(baseDoc), doc: docOf(read.preset, type) } : start(baseDoc);
  });
  const [view, setView] = useState<View>('detail');
  const [device, setDevice] = useState<'computer' | 'phone'>('computer');
  const [previewing, setPreviewing] = useState(false);
  const [hint, setHint] = useState(true);
  const [selected, setSelected] = useState<Part>();
  const [chosen, setChosen] = useState<string | undefined>(itemId);
  const [drag, setDrag] = useState<DragState>();
  const [settled, setSettled] = useState<string>();
  const [toast, setToast] = useState<{ text: string; undo?: () => void }>();
  const [applying, setApplying] = useState(false);
  const [showFile, setShowFile] = useState(false);
  const [deletingId, setDeletingId] = useState<string>();
  const [adding, setAdding] = useState<{ left: number; top: number }>();
  const [newKind, setNewKind] = useState<FieldKind>('short');
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const placedRef = useRef<readonly Placed[]>([]);
  const histRef = useRef(hist);
  histRef.current = hist;
  const lastGood = useRef<Preset | undefined>(basePreset);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const yaml =
    hist && basePreset ? yamlOf(source.yaml, basePreset, type, hist.base, hist.doc) : source.yaml;
  const reading = readDraft(yaml, source.playbooks);
  if (reading.ok) lastGood.current = reading.preset;
  const preset = lastGood.current;
  const dirty = hist ? changed(hist) : false;
  useEffect(() => {
    storeDraft(presetName, dirty ? { base: source.yaml, yaml, playbooks: {} } : undefined);
  }, [presetName, dirty, source.yaml, yaml]);

  const preview = useMemo(
    () =>
      preset
        ? draftPreview(
            preset,
            { yaml: samples.yaml, files: samples.files },
            { collection: board, now: '2026-01-01T00:00:00.000Z' },
          )
        : undefined,
    [preset, samples.yaml, samples.files, board],
  );
  const rows = preview?.items.filter((item) => item.type === type) ?? [];
  const shownId = rows.some((row) => row.id === chosen) ? chosen : rows[0]?.id;
  const item: ItemView | undefined = shownId === undefined ? undefined : preview?.view(shownId);

  const say = useCallback((text: string, undoIt?: () => void) => {
    clearTimeout(toastTimer.current);
    setToast(undoIt ? { text, undo: undoIt } : { text });
    toastTimer.current = setTimeout(() => setToast(undefined), 6000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const apply = (next: (h: History) => History) => {
    setHint(false);
    setHist((h) => (h ? next(h) : h));
  };
  const doc = hist?.doc;
  const idAt = (part: Part): string | undefined =>
    (part.field ?? (ZONES as readonly string[]).includes(part.slot))
      ? doc?.zones[part.slot as Zone]?.[part.index]
      : undefined;

  // ---- dragging
  const dropAt = (
    clientX: number,
    clientY: number,
    id: string,
  ): Omit<DragState, 'id' | 'x' | 'y'> => {
    const none = { over: undefined, why: undefined, line: undefined };
    const thing = histRef.current?.doc.things[id];
    if (!thing) return none;
    const at = document.elementFromPoint(clientX, clientY);
    if (at?.closest('[data-zone="panel"]'))
      return { over: { zone: 'panel', index: 0 }, why: undefined, line: undefined };
    const root = wrap.current?.querySelector('.st-canvas')?.getBoundingClientRect();
    if (!root) return none;
    const x = clientX - root.left;
    const y = clientY - root.top;
    const placed = placedRef.current;
    const box = slotBoxes(placed)
      .filter(({ slot }) => (ZONES as readonly string[]).includes(slot))
      .find(
        ({ rect }) =>
          x >= rect.left - 8 &&
          x <= rect.left + rect.width + 8 &&
          y >= rect.top - 8 &&
          y <= rect.top + rect.height + 8,
      );
    if (!box) return none;
    const zone = box.slot as Zone;
    const parts = placed
      .filter(({ part }) => part.slot === zone && part.index >= 0)
      .sort((a, b) => a.rect.top - b.rect.top);
    const before = parts.filter(({ rect }) => rect.top + rect.height / 2 < y).length;
    const why = refusal(thing.kind, zone);
    const anchor = parts[before];
    const prev = parts[before - 1];
    const top = anchor
      ? anchor.rect.top - 3
      : prev
        ? prev.rect.top + prev.rect.height + 3
        : box.rect.top;
    const rect = (anchor ?? prev ?? { rect: box.rect }).rect;
    return {
      over: { zone, index: parts.length === 0 ? 0 : before },
      why,
      line: { top, left: rect.left, width: rect.width },
    };
  };

  const startDrag = (id: string, event: React.PointerEvent) => {
    if (event.button !== 0 || previewing) return;
    event.preventDefault();
    const x0 = event.clientX;
    const y0 = event.clientY;
    let moved = false;
    let last: DragState | undefined;
    let scroller: ReturnType<typeof setInterval> | undefined;
    let pointerY = y0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onMove = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return;
      moved = true;
      pointerY = e.clientY;
      last = { id, x: e.clientX, y: e.clientY, ...dropAt(e.clientX, e.clientY, id) };
      setDrag(last);
      const box = stage.current?.getBoundingClientRect();
      if (box && !scroller) {
        scroller = setInterval(() => {
          const near = pointerY < box.top + 60 ? -1 : pointerY > box.bottom - 60 ? 1 : 0;
          if (near)
            stage.current?.scrollBy({ top: near * 14, behavior: reduce ? 'instant' : 'auto' });
        }, 16);
      }
    };
    const finish = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      clearInterval(scroller);
      setDrag(undefined);
      if (!moved || e.type === 'pointercancel') return;
      window.addEventListener('click', (c) => c.stopPropagation(), { capture: true, once: true });
      const h = histRef.current;
      if (!h || !last?.over) return;
      if (last.why) {
        say(last.why);
        return;
      }
      let { zone, index } = last.over;
      if (zone !== 'panel') {
        const from = h.doc.zones[zone].indexOf(id);
        if (from >= 0 && from < index) index -= 1;
      }
      const result = move(h.doc, id, { zone, index });
      if (result.refused) return say(result.refused);
      if (JSON.stringify(result.doc) === JSON.stringify(h.doc)) return;
      apply((cur) => commit(cur, result.doc));
      const name = h.doc.things[id]?.name ?? id;
      say(t('cz.moved', { name }), () => apply(undo));
      setSettled(id);
      setTimeout(() => setSettled(undefined), 1400);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const change = (next: Doc) => apply((h) => commit(h, next));
  const closeMenu = useCallback(() => {
    setSelected(undefined);
    setDeletingId(undefined);
  }, []);
  const closeAdd = useCallback(() => setAdding(undefined), []);
  const keepEditing = useCallback(() => setApplying(false), []);

  if (!hist || !doc || !preset || !preview)
    return (
      <main className="cz-page cz-msg">
        <p>{t('cz.failed')}</p>
      </main>
    );

  const typeWord = preset.types.find(({ name }) => name === type)?.label ?? type;
  const idLabel = itemId ?? shownId ?? '';
  const selectedId = selected ? idAt(selected) : undefined;
  const selectedThing = selectedId ? doc.things[selectedId] : undefined;
  const changes = changesOf(hist.base, doc);

  const marks = (placed: readonly Placed[]): ReactNode => {
    placedRef.current = placed;
    if (previewing) return null;
    const validFor = drag ? doc.things[drag.id] : undefined;
    return (
      <>
        {validFor
          ? slotBoxes(placed)
              .filter(({ slot }) => (ZONES as readonly string[]).includes(slot))
              .map(({ slot, rect }) => (
                <div
                  key={slot}
                  className="cz-zone"
                  data-ok={refusal(validFor.kind, slot as Zone) ? 'no' : 'yes'}
                  style={{
                    top: rect.top - 8,
                    left: rect.left - 8,
                    width: rect.width + 16,
                    height: rect.height + 16,
                  }}
                />
              ))
          : null}
        {placed.map(({ part, rect }) => {
          if (part.index < 0 || !(ZONES as readonly string[]).includes(part.slot)) return null;
          const id = idAt(part);
          const thing = id ? doc.things[id] : undefined;
          if (!id || !thing) return null;
          const fixed = FIXED.has(id);
          return (
            <div
              key={`${part.slot}:${part.index}`}
              className="cz-tile"
              data-fixed={fixed ? '' : undefined}
              data-lifted={drag?.id === id ? '' : undefined}
              data-settled={settled === id ? '' : undefined}
              style={{
                top: rect.top - 4,
                left: rect.left - 6,
                width: rect.width + 12,
                height: rect.height + 8,
              }}
            >
              {fixed ? null : (
                <button
                  type="button"
                  className="cz-grip"
                  aria-label={t('cz.grip', { name: thing.name })}
                  onPointerDown={(event) => startDrag(id, event)}
                  onClick={() => setSelected(part)}
                >
                  <span aria-hidden="true">⋮⋮</span>
                </button>
              )}
            </div>
          );
        })}
        {drag?.line ? (
          <div
            className="cz-line"
            data-bad={drag.why ? '' : undefined}
            style={{ top: drag.line.top, left: drag.line.left, width: drag.line.width }}
          />
        ) : null}
        {selected && selectedThing && selectedId ? (
          <MenuSlot
            stage={stage}
            top={
              placed.find(
                ({ part }) => part.slot === selected.slot && part.index === selected.index,
              )?.rect.top ?? 0
            }
          >
            {menu(selectedId, selectedThing, selected)}
          </MenuSlot>
        ) : null}
      </>
    );
  };

  function menu(id: string, thing: Thing, part: Part): ReactNode {
    const now = doc as Doc;
    const field = thing.kind !== 'files' && thing.kind !== 'link';
    const home = homeOf(now, id);
    const list = home ? now.zones[home] : [];
    const at = list.indexOf(id);
    const go = (zone: Zone | 'panel', index: number, follow: Part | undefined) => {
      const result = move(now, id, { zone, index });
      if (result.refused) return say(result.refused);
      change(result.doc);
      setSelected(follow);
    };
    const also = (zone: 'row' | 'intake') => {
      const on = !now.zones[zone].includes(id);
      const why = on ? refusal(thing.kind, zone) : undefined;
      if (why) return say(why);
      change(setAlso(now, id, zone, on));
    };
    const was = hist?.base.things[id];
    const count = used(id);
    const options = thing.options ?? [];
    const setOptions = (next: readonly string[]) =>
      change(patchThing(now, id, { options: [...next] }));
    return (
      <FieldMenu
        variant={field ? 'field' : 'block'}
        name={thing.name}
        onName={(name) => change(patchThing(now, id, { name }))}
        onClose={closeMenu}
        says={t(`customize.says.${thing.kind === 'link' ? 'link' : 'files'}`)}
        kind={field ? (thing.kind as FieldKind) : 'short'}
        onKind={(kind) => {
          const room = home ? refusal(kind, home) : undefined;
          const narrow = now.zones.row.includes(id) ? refusal(kind, 'row') : undefined;
          const why = room ?? narrow;
          if (why) return say(why);
          change(
            patchThing(now, id, {
              kind,
              ...(kind === 'choice' && options.length === 0 ? { options: ['one', 'two'] } : {}),
            }),
          );
        }}
        typeMayNotFit={was !== undefined && was.kind !== thing.kind && count > 0}
        options={options}
        onAddOption={(label) => setOptions(addOption(options, label))}
        onRemoveOption={(label) => {
          if (options.length > 1) setOptions(removeOption(options, label));
        }}
        need={thing.need}
        onNeed={(need) => change(patchThing(now, id, { need }))}
        inForm={now.zones.intake.includes(id)}
        inRow={now.zones.row.includes(id)}
        onToggleForm={() => also('intake')}
        onToggleRow={() => also('row')}
        zones={(['header', 'body', 'side'] as const).map((zone) => {
          const why = refusal(thing.kind, zone);
          return { id: zone, label: zoneWord(zone), ...(why ? { title: why } : {}) };
        })}
        {...(home ? { zone: home } : {})}
        onZone={(zone) => {
          if (zone !== home) go(zone as Zone, 0, { ...part, slot: zone as Zone, index: 0 });
        }}
        onUp={() => home && go(home, at - 1, { ...part, index: at - 1 })}
        onDown={() => home && go(home, at + 1, { ...part, index: at + 1 })}
        upDisabled={!home || at <= 0}
        downDisabled={!home || at >= list.length - 1}
        onHide={() => go('panel', 0, undefined)}
        canDelete={field}
        usedBy={count}
        confirmingDelete={deletingId === id}
        onAskDelete={() => setDeletingId(id)}
        onKeepField={() => setDeletingId(undefined)}
        onDelete={() => {
          change(deleteField(now, id));
          closeMenu();
        }}
      />
    );
  }

  function used(id: string): number {
    return samples.samples.filter(
      (sample) => (sample as { fields?: Record<string, string> }).fields?.[id],
    ).length;
  }

  const onSelect = (part: Part | undefined) => {
    setHint(false);
    if (!part || previewing) return setSelected(undefined);
    const id = idAt(part);
    if (id && FIXED.has(id)) {
      setSelected(undefined);
      return say(t('cz.fixed', { name: doc.things[id]?.name ?? id }));
    }
    if (part.index < 0 || !id) {
      setSelected(undefined);
      return say(t('cz.fixed', { name: part.slot }));
    }
    setSelected(part);
  };

  const canvas = (label: string, drawn: ReactNode) => (
    <EvidenceFiles.Provider value={(evidence) => sampleFileUrl(presetName, evidence.filename)}>
      <Canvas type={type} label={label} selected={undefined} onSelect={onSelect} marks={marks}>
        {drawn}
      </Canvas>
    </EvidenceFiles.Provider>
  );
  const shape = preview.collection.types.find(({ name }) => name === type);
  let drawn: ReactNode;
  if (view === 'row') {
    const nesting = nestSections(groupItems(rows, 'turn', preview.collection), NO_FOLDS);
    drawn = canvas(
      t('cz.row'),
      <ItemList
        sections={nesting.sections}
        nesting={nesting.rows}
        selectedId={undefined}
        collectionOf={() => preview.collection}
        scope={`customize:${type}`}
      />,
    );
  } else if (view === 'form') {
    drawn = canvas(
      t('cz.form'),
      <article className="detail st-form-card">
        <IntakeForm
          key={type + yaml.length}
          collections={[{ ...preview.collection, types: shape ? [shape] : [] }]}
          first={{ ...preview.collection, types: shape ? [shape] : [] }}
          ids={[]}
          parent={undefined}
          onCancel={() => {}}
          onCreated={() => {}}
        />
      </article>,
    );
  } else if (item) {
    const detail = canvas(
      t('cz.showing', { id: item.id }),
      <ItemDetail
        item={item}
        canWrite={false}
        collection={preview.collection}
        collectionOf={() => preview.collection}
      />,
    );
    drawn = device === 'phone' ? <div className="st-phone-frame">{detail}</div> : detail;
  } else drawn = <p className="t-small">{t('cz.noItem')}</p>;

  const discard = () => {
    storeDraft(presetName, undefined);
    setHist(start(hist.base));
    setSelected(undefined);
  };
  const back = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.hash = itemId ? hashFor(itemId) : '#/';
  };
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const done = await customizeBoard(board, yaml);
      storeDraft(presetName, undefined);
      announce(t('cz.applied', { board }), () => revertBoard(board, done.previous));
      window.location.hash = itemId ? hashFor(itemId) : '#/';
    } catch (caught) {
      say(caught instanceof Error ? caught.message : t('cz.failed'));
    } finally {
      setBusy(false);
    }
  };
  const hidden = unplaced(doc).filter((thing) => thing.kind !== 'files' && thing.kind !== 'link');
  const blocks = Object.values(doc.things).filter(
    (thing) => thing.kind === 'files' || thing.kind === 'link',
  );
  const addZone: Zone = view === 'form' ? 'intake' : view === 'row' ? 'row' : 'body';
  const landing = (kind: Thing['kind']): Zone => (refusal(kind, addZone) ? 'body' : addZone);
  const submitNew = () => {
    const name = newName.trim();
    if (!name) return;
    const zone = landing(newKind);
    const made = addField(doc, name, newKind, zone);
    change(made.doc);
    setAdding(undefined);
    setNewName('');
    setNewKind('short');
    say(t('customize.newFieldMade', { name }), () => apply(undo));
    if (zone === 'body')
      setSelected({ type, slot: 'body', index: made.doc.zones.body.length - 1, field: made.id });
  };
  const place = (id: string) => {
    const thing = doc.things[id];
    if (!thing) return;
    const zone = landing(thing.kind);
    const result = move(doc, id, { zone, index: doc.zones[zone].length });
    if (result.refused) return say(result.refused);
    change(result.doc);
    say(t('cz.moved', { name: thing.name }), () => apply(undo));
  };
  const placedNow = drag ? doc.things[drag.id] && homeOf(doc, drag.id) !== undefined : false;
  const dropToHide = drag?.over?.zone === 'panel' && placedNow;

  return (
    <main className="cz-page" data-previewing={previewing ? '' : undefined}>
      <header className="cz-bar">
        {previewing ? null : (
          <Button variant="quiet" onClick={back}>
            {t('cz.back', { id: idLabel })}
          </Button>
        )}
        <p className="cz-title">{t('cz.title', { type: typeWord, board })}</p>
        <div className="cz-seg">
          {(['detail', 'form', 'row'] as const).map((each) => (
            <button
              key={each}
              type="button"
              aria-pressed={view === each}
              onClick={() => setView(each)}
            >
              {t(`cz.${each}`)}
            </button>
          ))}
        </div>
        <span className="cz-grow" />
        <Button variant="quiet" disabled={hist.past.length === 0} onClick={() => apply(undo)}>
          {t('cz.undo')}
        </Button>
        <Button variant="quiet" disabled={hist.future.length === 0} onClick={() => apply(redo)}>
          {t('cz.redo')}
        </Button>
        <Button variant="quiet" disabled={!dirty} onClick={discard}>
          {t('cz.discard')}
        </Button>
        <Button variant="primary" disabled={!dirty} onClick={() => setApplying(true)}>
          {t('cz.apply', { board })}
        </Button>
      </header>
      <div className="cz-body">
        {previewing ? null : (
          <LeftPanel
            hidden={hidden.map((thing) => ({
              id: thing.id,
              name: thing.name,
              typeLabel: KIND_WORD[thing.kind],
            }))}
            blocks={blocks.map((thing) => {
              const at = homeOf(doc, thing.id);
              return {
                id: thing.id,
                name: thing.name,
                says: t(`customize.says.${thing.kind === 'link' ? 'link' : 'files'}`),
                kind: thing.kind === 'link' ? ('link' as const) : ('files' as const),
                ...(at ? { usedIn: zoneWord(at) } : {}),
              };
            })}
            dropToHide={!!dropToHide}
            {...(drag ? { grabbing: drag.id } : {})}
            onGrab={startDrag}
            onActivate={place}
            onNewField={() => {
              const rect = document.querySelector('[data-zone="panel"]')?.getBoundingClientRect();
              setSelected(undefined);
              setAdding(
                adding ? undefined : { left: (rect?.right ?? 232) + 8, top: (rect?.top ?? 0) + 56 },
              );
            }}
          />
        )}
        <div className="cz-stage" ref={stage}>
          <div className="cz-canvas" ref={wrap} data-view={view}>
            {drawn}
          </div>
          {hint && !previewing ? <p className="cz-hint">{t('cz.hint')}</p> : null}
        </div>
        <div className="cz-right">
          {rows.length > 0 && view === 'detail' ? (
            <label className="cz-showing">
              <span>{t('cz.showing', { id: '' })}</span>
              <select value={shownId} onChange={(event) => setChosen(event.target.value)}>
                {rows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="cz-seg">
            {(['computer', 'phone'] as const).map((each) => (
              <button
                key={each}
                type="button"
                aria-pressed={device === each}
                onClick={() => setDevice(each)}
              >
                {t(`cz.${each}`)}
              </button>
            ))}
          </div>
          <Button
            variant="quiet"
            aria-pressed={previewing}
            onClick={() => {
              setPreviewing(!previewing);
              setSelected(undefined);
            }}
          >
            {t('cz.preview')}
          </Button>
          {previewing ? <p className="cz-none">{t('cz.previewNote')}</p> : null}
        </div>
      </div>
      {drag ? (
        <div
          className="cz-ghost"
          data-bad={drag.why ? '' : undefined}
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          {doc.things[drag.id]?.name}
          {drag.why ? <small>{drag.why}</small> : null}
        </div>
      ) : null}
      {toast ? (
        <div className="cz-toast" role="status">
          {toast.text}
          {toast.undo ? (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                setToast(undefined);
              }}
            >
              {t('cz.undo')}
            </button>
          ) : null}
        </div>
      ) : null}
      {adding ? (
        <NewField
          name={newName}
          onName={setNewName}
          kind={newKind}
          onKind={setNewKind}
          place={zoneWord(landing(newKind))}
          onSubmit={submitNew}
          onCancel={closeAdd}
          style={{ position: 'fixed', left: adding.left, top: adding.top, width: 320, zIndex: 60 }}
        />
      ) : null}
      {applying ? (
        <ApplyDialog
          target={board}
          changes={changes}
          itemCount={count}
          first={source.origin === 'official'}
          yaml={yaml}
          showFile={showFile}
          onToggleFile={() => setShowFile((on) => !on)}
          onApply={submit}
          onKeepEditing={keepEditing}
        />
      ) : null}
    </main>
  );
}

// The field's menu sits in the canvas's reserved right column, level with its field, and stays
// inside the part of the canvas that is on screen.
function MenuSlot({
  stage,
  top,
  children,
}: {
  stage: RefObject<HTMLDivElement | null>;
  top: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: 0, top, max: 0 });
  const place = useCallback(() => {
    const node = ref.current;
    const canvas = node?.closest('.st-canvas');
    const view = stage.current;
    if (!node || !canvas || !view) return;
    const c = canvas.getBoundingClientRect();
    const s = view.getBoundingClientRect();
    const low = Math.max(s.top, 0) - c.top + 8;
    const high = Math.min(s.bottom, window.innerHeight) - c.top - 8;
    const max = Math.max(160, high - low);
    const height = Math.min(node.scrollHeight, max);
    const next = {
      left: canvas.clientWidth + 16,
      top: Math.round(Math.max(low, Math.min(top - 8, high - height))),
      max,
    };
    setBox((was) =>
      was.left === next.left && was.top === next.top && was.max === next.max ? was : next,
    );
  }, [stage, top]);
  useLayoutEffect(place);
  useEffect(() => {
    const view = stage.current;
    view?.addEventListener('scroll', place);
    window.addEventListener('resize', place);
    return () => {
      view?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [stage, place]);
  return (
    <div
      ref={ref}
      className="cz-menuslot"
      style={{ left: box.left, top: box.top, maxHeight: box.max || undefined }}
    >
      {children}
    </div>
  );
}

export { zoneWord };
