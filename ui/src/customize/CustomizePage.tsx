import {
  Fragment,
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
import { ItemDetail, ShowEmpty } from '../components/ItemDetail.tsx';
import { ItemList } from '../components/ItemList.tsx';
import { IntakeForm } from '../components/NewItemForm.tsx';
import { EvidenceFiles } from '../evidence-files.ts';
import { type Connection, useMediaQuery, useRemote } from '../hooks.ts';
import { t } from '../i18n/i18n.ts';
import { Button, Icon } from '../kit/index.ts';
import { nestSections } from '../nesting.ts';
import { groupItems } from '../sections.ts';
import { type CustomizeTarget, customizeHash, hashFor, studioHash } from '../selection.ts';
import {
  customizeBoard,
  customizeTemplate,
  fetchPresetSamples,
  fetchPresetSource,
  fetchStudioPresets,
  type PresetSamples,
  type PresetSource,
  revertBoard,
  sampleFileUrl,
} from '../studio/api.ts';
import { Canvas } from '../studio/Canvas.tsx';
import { type Part, type Placed, samePart, slotBoxes } from '../studio/canvas.ts';
import { readDraft } from '../studio/draft.ts';
import { storeDraft, storedDraft } from '../studio/PresetEditor.tsx';
import { draftPreview } from '../studio/preview.ts';
import type { Item, ItemView } from '../types.ts';
import { ApplyDialog } from './ApplyDialog.tsx';
import { announce } from './applied.ts';
import { BoxMenu } from './BoxMenu.tsx';
import { FieldMenu } from './FieldMenu.tsx';
import { Grip, Redo, Undo } from './glyphs.tsx';
import { LeftPanel } from './LeftPanel.tsx';
import {
  addBox,
  addField,
  BLOCKS,
  blockOf,
  boxRows,
  changed,
  changesOf,
  commit,
  type Doc,
  type Drop,
  deleteField,
  docOf,
  dropBeside,
  type Facet,
  type History,
  type Home,
  hide,
  homeOf,
  homeWord,
  KIND_WORD,
  move,
  moveBox,
  patchThing,
  redo,
  refusal,
  removeBox,
  renameBox,
  setAlso,
  setBeside,
  shown,
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
import { applyOf, boardsText, type Scope, saves, scopeOf, titleOf } from './scope.ts';
import type { FieldKind } from './types.ts';

type View = 'detail' | 'form' | 'row';
const NO_FOLDS = { collapsed: new Set<string>(), expanded: new Set<string>() };
const FIXED = new Set(['title']);
const blockSays = (thing: Thing) => t(`customize.block.${blockOf(thing) ?? 'images'}.says`);

type Rect = { top: number; left: number; width: number; height: number };
// A box as drawn: the section, its content and its name, in the canvas's coordinates.
type BoxRect = { rect: Rect; body: Rect; label: Rect };
type Fixed = { name: string; rect: Rect };
// A box lifted by its grip or name: where it would land, or the box it would sit beside.
type Boxing = {
  index: number;
  x: number;
  y: number;
  at?: number;
  beside?: number;
  line?: { top: number; left: number; width: number };
};

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
  onApplied,
}: {
  target: CustomizeTarget;
  items: readonly Item[];
  version: number;
  connection: Connection;
  // The view changed on the server: the app reads its collections and presets again.
  onApplied: () => void;
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
  const scope =
    target.kind === 'item'
      ? scopeOf({ kind: 'item', board })
      : scopeOf({
          kind: 'preset',
          users: boards.filter(({ preset }) => preset === target.name).map(({ name }) => name),
        });
  const reach = scope.boards.length > 0 ? scope.boards : [board];
  return (
    <Loader
      key={presetName}
      presetName={presetName}
      board={board}
      type={item?.type}
      itemId={item?.id}
      count={items.filter((each) => reach.includes(each.collection)).length}
      scope={scope}
      onApplied={onApplied}
      version={version}
      connection={connection}
    />
  );
}

// The click a drag ends with must not select what it lands on. It only comes when the pointer is
// let go over where it went down, so the guard also goes away on its own.
function swallowClick() {
  const stop = (event: Event) => event.stopPropagation();
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, true), 0);
}

function Loader(props: {
  presetName: string;
  board: string;
  type: string | undefined;
  itemId: string | undefined;
  count: number;
  scope: Scope;
  onApplied: () => void;
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
  scope,
  onApplied,
}: {
  source: PresetSource;
  samples: PresetSamples;
  board: string;
  type: string | undefined;
  itemId: string | undefined;
  count: number;
  presetName: string;
  scope: Scope;
  onApplied: () => void;
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
  const hintEl = useRef<HTMLParagraphElement>(null);
  // The hint sits in the toast's spot; it steps aside whenever it would lie over something to grab.
  const [hintAway, setHintAway] = useState(false);
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
  const [boxRects, setBoxRects] = useState<BoxRect[]>([]);
  const [fixeds, setFixeds] = useState<Fixed[]>([]);
  const [zoneRects, setZoneRects] = useState<{ header?: Rect; side?: Rect }>({});
  const zonesRef = useRef(zoneRects);
  zonesRef.current = zoneRects;
  const [boxing, setBoxing] = useState<Boxing>();
  const [renaming, setRenaming] = useState<number>();
  const [boxMenu, setBoxMenu] = useState<number>();
  const [boxDraft, setBoxDraft] = useState<string>();
  const boxesRef = useRef<BoxRect[]>([]);
  boxesRef.current = boxRects;
  const typing = useRef<string | undefined>(undefined);
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const placedRef = useRef<readonly Placed[]>([]);
  const histRef = useRef(hist);
  histRef.current = hist;
  const lastGood = useRef<Preset | undefined>(basePreset);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const yaml =
    hist && basePreset ? yamlOf(source.yaml, basePreset, type, hist.base, hist.doc) : source.yaml;
  // The canvas always draws the boxes, so it draws the document as sections even while the file
  // keeps the layout it had.
  const drawnYaml =
    hist && basePreset
      ? yamlOf(source.yaml, basePreset, type, hist.base, { ...hist.doc, boxed: true })
      : source.yaml;
  const reading = readDraft(drawnYaml, source.playbooks);
  if (reading.ok) lastGood.current = reading.preset;
  const preset = lastGood.current;
  const dirty = hist ? changed(hist) : false;
  useEffect(() => {
    storeDraft(presetName, dirty ? { base: source.yaml, yaml, playbooks: {} } : undefined);
  }, [presetName, dirty, source.yaml, yaml]);

  // The samples were made "just now", so their ages read as a few minutes, not as months.
  const sampleNow = useMemo(() => new Date(Date.now() - 2 * 60_000).toISOString(), []);
  const preview = useMemo(
    () =>
      preset
        ? draftPreview(
            preset,
            { yaml: samples.yaml, files: samples.files },
            { collection: board, now: sampleNow },
          )
        : undefined,
    [preset, samples.yaml, samples.files, board, sampleNow],
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
  // The hint never lies over a row, a grip or a box name: it fades while any of them is under it.
  const checkHint = useCallback(() => {
    const note = hintEl.current;
    if (!note) return;
    const at = note.getBoundingClientRect();
    const over = [
      ...document.querySelectorAll(
        '.cz-fgrip, .cz-boxgrip, .cz-boxname, .cz-tile:not([data-fixed])',
      ),
    ].some((each) => {
      const r = each.getBoundingClientRect();
      return (
        r.right > at.left && r.left < at.right && r.bottom > at.top - 8 && r.top < at.bottom + 8
      );
    });
    setHintAway((was) => (was === over ? was : over));
  }, []);
  useEffect(() => {
    checkHint();
    const view = stage.current;
    view?.addEventListener('scroll', checkHint);
    window.addEventListener('resize', checkHint);
    return () => {
      view?.removeEventListener('scroll', checkHint);
      window.removeEventListener('resize', checkHint);
    };
  });

  const apply = (next: (h: History) => History) => {
    setHint(false);
    setHist((h) => (h ? next(h) : h));
  };
  const doc = hist?.doc;
  // The thing a drawn part is: a part in a box counts within that box, any other within its zone.
  const idAt = (part: Part): string | undefined => {
    if (part.section !== undefined) return doc?.sections[part.section]?.entries[part.index];
    return (ZONES as readonly string[]).includes(part.slot)
      ? doc?.zones[part.slot as Zone]?.[part.index]
      : undefined;
  };
  // The part a thing is, as the canvas names it.
  const partOfId = (at: Doc, id: string): Part | undefined => {
    const home = homeOf(at, id);
    const thing = at.things[id];
    if (!home || !thing) return undefined;
    const field = thing.kind !== 'files' && thing.kind !== 'link' ? { field: id } : {};
    if ('section' in home)
      return {
        type,
        slot: 'body',
        section: home.section,
        index: at.sections[home.section]?.entries.indexOf(id) ?? 0,
        ...field,
      };
    return { type, slot: home.zone, index: at.zones[home.zone].indexOf(id), ...field };
  };

  // Where the boxes, their names and the fixed sections are drawn, measured after every draw.
  useLayoutEffect(() => {
    const root = wrap.current?.querySelector('.st-canvas');
    if (!root) {
      setBoxRects((was) => (was.length === 0 ? was : []));
      setFixeds((was) => (was.length === 0 ? was : []));
      setZoneRects((was) => (Object.keys(was).length === 0 ? was : {}));
      return;
    }
    const origin = root.getBoundingClientRect();
    const rectOf = (element: Element | null): Rect => {
      const r = element?.getBoundingClientRect();
      return r
        ? {
            top: Math.round(r.top - origin.top),
            left: Math.round(r.left - origin.left),
            width: Math.round(r.width),
            height: Math.round(r.height),
          }
        : { top: 0, left: 0, width: 0, height: 0 };
    };
    const sections = [...root.querySelectorAll('.st-canvas-view section.detail-section')];
    const boxes: BoxRect[] = [];
    const fixed: Fixed[] = [];
    const zones: { header?: Rect; side?: Rect } = {};
    for (const section of sections) {
      const at = section.getAttribute('data-section');
      const label = section.querySelector('.detail-section-label');
      if (at !== null) {
        boxes[Number(at)] = {
          rect: rectOf(section),
          body: rectOf(section.querySelector('.detail-section-body')),
          label: rectOf(label?.querySelector('span') ?? label),
        };
      } else if (section.querySelector('.timeline')) {
        fixed.push({ name: t('customize.fixedHistory'), rect: rectOf(section) });
      } else if (label) {
        fixed.push({ name: label.textContent?.trim() ?? '', rect: rectOf(label) });
        if (section.querySelector('.fields-meta')) zones.side = rectOf(section);
      }
    }
    const head = root.querySelector('.st-canvas-view .detail-head');
    if (head) {
      zones.header = rectOf(head);
      const title = head.querySelector('h1');
      if (title) fixed.push({ name: t('customize.fixedTitle'), rect: rectOf(title) });
      const state = head.querySelector('.detail-head-row');
      if (state) fixed.push({ name: t('customize.fixedState'), rect: rectOf(state) });
    }
    setZoneRects((was) => (JSON.stringify(was) === JSON.stringify(zones) ? was : zones));
    const dense = boxes.filter(Boolean);
    setBoxRects((was) => (JSON.stringify(was) === JSON.stringify(dense) ? was : dense));
    setFixeds((was) => (JSON.stringify(was) === JSON.stringify(fixed) ? was : fixed));
  });
  // What settles after the draw (images, fonts, a resize) moves the boxes without a render of ours.
  const [, setTick] = useState(0);
  useEffect(() => {
    const element = wrap.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setTick((n) => n + 1));
    observer.observe(element);
    const load = () => setTick((n) => n + 1);
    element.addEventListener('load', load, true);
    return () => {
      observer.disconnect();
      element.removeEventListener('load', load, true);
    };
  }, []);

  const facet: Facet = view === 'form' ? 'intake' : view === 'row' ? 'row' : 'detail';

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
    type Spot = {
      zone: Zone | 'section';
      section?: number;
      rect: Rect;
      body?: Rect;
      parts: Placed[];
    };
    const spots: Spot[] = boxesRef.current.map((each, section) => ({
      zone: 'section',
      section,
      rect: each.rect,
      body: each.body,
      parts: placed.filter(({ part }) => part.section === section && part.index >= 0),
    }));
    const loose = placed.filter(
      ({ part }) => part.section === undefined && (ZONES as readonly string[]).includes(part.slot),
    );
    const inSlot = (slot: string) =>
      loose.filter(({ part }) => part.slot === slot && part.index >= 0);
    // Under the title and Details are drawn as a whole even with nothing in them.
    for (const zone of ['header', 'side'] as const) {
      const rect = zonesRef.current[zone];
      if (rect) spots.push({ zone, rect, parts: inSlot(zone) });
    }
    for (const { slot, rect } of slotBoxes(loose))
      if (slot === 'row' || slot === 'intake')
        spots.push({ zone: slot, rect, parts: inSlot(slot) });
    const area = (r: Rect) => r.width * r.height;
    const spot = spots
      .filter(
        ({ rect }) =>
          x >= rect.left - 8 &&
          x <= rect.left + rect.width + 8 &&
          y >= rect.top - 8 &&
          y <= rect.top + rect.height + 8,
      )
      .sort((a, b) => area(a.rect) - area(b.rect))[0];
    if (!spot) return none;
    const seen = new Set<number>();
    const parts = spot.parts
      .sort((a, b) => a.rect.top - b.rect.top)
      .filter(({ part }) => (seen.has(part.index) ? false : !!seen.add(part.index)));
    const before = parts.filter(({ rect }) => rect.top + rect.height / 2 < y).length;
    const why = refusal(thing.kind, spot.zone);
    const anchor = parts[before];
    const prev = parts[before - 1];
    const frame = spot.body ?? spot.rect;
    const top = anchor
      ? anchor.rect.top - 3
      : prev
        ? prev.rect.top + prev.rect.height + 3
        : spot.zone === 'header'
          ? frame.top + frame.height - 4
          : frame.top;
    const rect = (anchor ?? prev ?? { rect: frame }).rect;
    return {
      over: {
        zone: spot.zone,
        index: parts.length === 0 ? 0 : before,
        ...(spot.section === undefined ? {} : { section: spot.section }),
      },
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
      swallowClick();
      const h = histRef.current;
      if (!h || !last?.over) return;
      if (last.why) {
        say(last.why);
        return;
      }
      const over = last.over;
      if (over.zone === 'panel') {
        const hid = hide(h.doc, id, facet);
        if (hid.refused) return say(hid.refused);
        if (JSON.stringify(hid.doc) === JSON.stringify(h.doc)) return;
        apply((cur) => commit(cur, hid.doc));
        say(t('customize.hiddenFrom', { name: h.doc.things[id]?.name ?? id }), () => apply(undo));
        return;
      }
      let index = over.index;
      const list =
        over.zone === 'section'
          ? (h.doc.sections[over.section ?? 0]?.entries ?? [])
          : h.doc.zones[over.zone];
      const from = list.indexOf(id);
      if (from >= 0 && from < index) index -= 1;
      const result = move(h.doc, id, { ...over, index });
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

  const startBoxDrag = (index: number, event: React.PointerEvent) => {
    if (event.button !== 0 || previewing) return;
    event.preventDefault();
    const x0 = event.clientX;
    const y0 = event.clientY;
    let moved = false;
    let last: Boxing | undefined;
    const where = (cx: number, cy: number): Boxing => {
      const lifted: Boxing = { index, x: cx, y: cy };
      const root = wrap.current?.querySelector('.st-canvas')?.getBoundingClientRect();
      const boxes = boxesRef.current;
      if (!root || boxes.length === 0) return lifted;
      const x = cx - root.left;
      const y = cy - root.top;
      for (const [other, each] of boxes.entries()) {
        const r = each.rect;
        if (
          other !== index &&
          x >= r.left + (r.width * 2) / 3 &&
          x <= r.left + r.width + 20 &&
          y >= r.top &&
          y <= r.top + r.height
        )
          return { ...lifted, beside: other };
      }
      const others = boxes.filter((_, other) => other !== index);
      const at = others.filter(({ rect }) => rect.top + rect.height / 2 < y).length;
      const left = Math.min(...boxes.map(({ rect }) => rect.left));
      const right = Math.max(...boxes.map(({ rect }) => rect.left + rect.width));
      const next = others[at];
      const tail = others[others.length - 1];
      const top = next ? next.rect.top - 8 : tail ? tail.rect.top + tail.rect.height + 8 : 0;
      return { ...lifted, at, line: { top, left, width: right - left } };
    };
    const onMove = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return;
      moved = true;
      last = where(e.clientX, e.clientY);
      setBoxing(last);
    };
    const finish = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      setBoxing(undefined);
      if (!moved || e.type === 'pointercancel') return;
      swallowClick();
      const h = histRef.current;
      if (!h || !last) return;
      const name = h.doc.sections[index]?.title ?? '';
      let next: Doc = h.doc;
      if (last.beside !== undefined) {
        const result = dropBeside(h.doc, index, last.beside);
        if (result.refused) return say(result.refused);
        next = result.doc;
      } else if (last.at !== undefined) next = moveBox(h.doc, index, last.at);
      if (JSON.stringify(next) === JSON.stringify(h.doc)) return;
      apply((cur) => commit(cur, next));
      say(t('customize.boxMoved', { name }), () => apply(undo));
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
  const closeBoxMenu = useCallback(() => {
    setBoxMenu(undefined);
    setBoxDraft(undefined);
    typing.current = undefined;
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
          ? [
              ...boxRects.map(({ rect }, at) => ({
                key: `box${at}`,
                zone: 'section' as const,
                rect,
              })),
              ...(['header', 'side'] as const).flatMap((zone) => {
                const rect = zoneRects[zone];
                return rect ? [{ key: zone, zone, rect }] : [];
              }),
              ...slotBoxes(
                placed.filter(({ part }) => part.slot === 'row' || part.slot === 'intake'),
              ).map(({ slot, rect }) => ({ key: slot, zone: slot as Zone, rect })),
            ].map(({ key, zone, rect }) => (
              <div
                key={key}
                className="cz-zone"
                data-ok={refusal(validFor.kind, zone) ? 'no' : 'yes'}
                style={{
                  top: rect.top - 8,
                  left: rect.left - 8,
                  width: rect.width + 16,
                  height: rect.height + 16,
                }}
              >
                {zone === 'header' || zone === 'side' ? (
                  <span className="cz-zonetag">{zoneWord(zone)}</span>
                ) : null}
              </div>
            ))
          : null}
        {placed.map(({ part, rect }) => {
          if (part.index < 0) return null;
          const id = idAt(part);
          const thing = id ? doc.things[id] : undefined;
          if (!id || !thing) return null;
          const fixed = FIXED.has(id);
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: the whole tile takes the pointer; the grip inside it is the keyboard way to the same moves
            <div
              key={`${part.slot}:${part.section ?? ''}:${part.index}`}
              className="cz-tile"
              data-fixed={fixed ? '' : undefined}
              data-slot={part.slot}
              data-boxed={part.section !== undefined ? '' : undefined}
              data-chosen={selected && samePart(part, selected) ? '' : undefined}
              onPointerDown={
                fixed
                  ? undefined
                  : (event) => {
                      if (event.target === event.currentTarget) startDrag(id, event);
                    }
              }
              onClick={
                fixed
                  ? undefined
                  : (event) => {
                      if (event.target === event.currentTarget) setSelected(part);
                    }
              }
              data-lifted={drag?.id === id ? '' : undefined}
              data-settled={settled === id ? '' : undefined}
              style={{
                top: rect.top - 4,
                left: rect.left - (part.slot === 'row' ? 6 : 26),
                width: rect.width + (part.slot === 'row' ? 12 : 34),
                height: rect.height + 8,
              }}
            >
              {fixed ? null : (
                <button
                  type="button"
                  className="cz-fgrip"
                  aria-label={t('cz.grip', { name: thing.name })}
                  onPointerDown={(event) => startDrag(id, event)}
                  onClick={() => setSelected(part)}
                >
                  <Grip />
                </button>
              )}
            </div>
          );
        })}
        {boxRects.map((each, at) => {
          const box = doc.sections[at];
          if (!box) return null;
          const { rect, label } = each;
          const pair = boxRows(doc.sections).find((row) => row.includes(at));
          const leads = pair?.length === 2 && pair[0] === at;
          const lifted = boxing?.index === at;
          const hot = boxing?.beside === at;
          return (
            <Fragment key={box.id}>
              <div
                className="cz-box"
                data-lifted={lifted ? '' : undefined}
                data-open={boxMenu === at ? '' : undefined}
                data-hot={hot ? '' : undefined}
                style={{
                  top: rect.top - 10,
                  left: rect.left - 26,
                  width: rect.width + 38,
                  height: rect.height + 20,
                }}
              >
                <button
                  type="button"
                  className="cz-boxgrip"
                  style={{ top: label.top + label.height / 2 - (rect.top - 10) - 12 }}
                  aria-label={t('cz.grip', { name: box.title })}
                  onPointerDown={(event) => startBoxDrag(at, event)}
                  onClick={() => {
                    setSelected(undefined);
                    setBoxMenu(boxMenu === at ? undefined : at);
                  }}
                >
                  <Grip />
                </button>
              </div>
              {renaming === at ? (
                <input
                  className="cz-boxinput"
                  aria-label={t('customize.boxName')}
                  defaultValue={box.title}
                  style={{
                    top: label.top - 5,
                    left: label.left - 7,
                    width: Math.max(label.width + 40, 200),
                  }}
                  // biome-ignore lint/a11y/noAutofocus: opened by a click on the name or New box
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onBlur={(event) => nameBox(at, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') nameBox(at, event.currentTarget.value);
                    if (event.key === 'Escape') setRenaming(undefined);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="cz-boxname"
                  aria-label={t('customize.rename')}
                  style={{
                    top: label.top - 3,
                    left: label.left - 4,
                    width: label.width + 8,
                    height: label.height + 6,
                  }}
                  onPointerDown={(event) => startBoxDrag(at, event)}
                  onClick={() => {
                    setSelected(undefined);
                    setBoxMenu(undefined);
                    setRenaming(at);
                  }}
                />
              )}
              {boxing && !lifted && (!pair || pair.length === 1 || pair.includes(boxing.index)) ? (
                <div
                  className="cz-beside"
                  data-hot={hot ? '' : undefined}
                  style={{
                    top: rect.top,
                    left: rect.left + (rect.width * 2) / 3,
                    width: rect.width / 3 + 8,
                    height: rect.height,
                  }}
                >
                  <span>{t('customize.besideTarget', { name: box.title })}</span>
                </div>
              ) : null}
            </Fragment>
          );
        })}
        {previewing || boxing
          ? null
          : fixeds.map(({ name, rect }) => (
              <button
                key={`${name}:${rect.top}`}
                type="button"
                className="cz-fixedlabel"
                aria-label={t('cz.fixed', { name })}
                style={{
                  top: rect.top - 2,
                  left: rect.left - 4,
                  width: rect.width + 8,
                  height: rect.height + 4,
                }}
                onClick={() => {
                  setSelected(undefined);
                  setBoxMenu(undefined);
                  say(t('cz.fixed', { name }));
                }}
              />
            ))}
        {boxing?.line ? (
          <div
            className="cz-line"
            style={{ top: boxing.line.top, left: boxing.line.left, width: boxing.line.width }}
          />
        ) : null}
        {boxMenu !== undefined && boxRects[boxMenu] && doc.sections[boxMenu] ? (
          <MenuSlot stage={stage} top={boxRects[boxMenu].rect.top}>
            {boxPanel(boxMenu)}
          </MenuSlot>
        ) : null}
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
            top={placed.find(({ part }) => samePart(part, selected))?.rect.top ?? 0}
          >
            {menu(selectedId, selectedThing)}
          </MenuSlot>
        ) : null}
      </>
    );
  };

  const homeName = (home: Home): string => ('zone' in home ? home.zone : `box:${home.section}`);

  function menu(id: string, thing: Thing): ReactNode {
    const now = doc as Doc;
    const field = thing.kind !== 'files' && thing.kind !== 'link';
    const home = homeOf(now, id);
    const homeId = home ? homeName(home) : undefined;
    const list = !home
      ? []
      : 'section' in home
        ? (now.sections[home.section]?.entries ?? [])
        : now.zones[home.zone];
    const at = list.indexOf(id);
    const roomZone = home ? ('section' in home ? 'section' : home.zone) : undefined;
    const go = (to: Drop) => {
      const result = move(now, id, to);
      if (result.refused) return say(result.refused);
      change(result.doc);
      setSelected(to.zone === 'panel' ? undefined : partOfId(result.doc, id));
    };
    const into = (place: string, index: number) =>
      go(
        place.startsWith('box:')
          ? { zone: 'section', section: Number(place.slice(4)), index }
          : { zone: place as Zone, index },
      );
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
        says={blockSays(thing)}
        kind={field ? (thing.kind as FieldKind) : 'short'}
        onKind={(kind) => {
          const room = roomZone ? refusal(kind, roomZone) : undefined;
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
        zones={[
          { id: 'header', label: zoneWord('header'), zone: 'header' as const },
          ...now.sections.map((box, section) => ({
            id: `box:${section}`,
            label: box.title,
            zone: 'section' as const,
          })),
          { id: 'side', label: zoneWord('side'), zone: 'side' as const },
        ].map(({ id: place, label, zone }) => {
          const why = refusal(thing.kind, zone);
          return { id: place, label, ...(why ? { title: why } : {}) };
        })}
        {...(homeId ? { zone: homeId } : {})}
        onZone={(place) => {
          if (place !== homeId) into(place, 0);
        }}
        onUp={() => homeId && into(homeId, at - 1)}
        onDown={() => homeId && into(homeId, at + 1)}
        upDisabled={!home || at <= 0}
        downDisabled={!home || at >= list.length - 1}
        onHide={() => {
          const hid = hide(now, id, facet);
          if (hid.refused) return say(hid.refused);
          change(hid.doc);
          setSelected(undefined);
          say(t('customize.hiddenFrom', { name: thing.name }), () => apply(undo));
        }}
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

  // Name a box where it stands: one change, whatever was typed.
  function nameBox(at: number, value: string) {
    setRenaming(undefined);
    const h = histRef.current;
    if (!h) return;
    const next = renameBox(h.doc, at, value);
    if (next !== h.doc) change(next);
  }

  function boxPanel(at: number): ReactNode {
    const now = doc as Doc;
    const box = now.sections[at];
    if (!box) return null;
    const row = boxRows(now.sections).find((each) => each.includes(at));
    const beside = row?.length === 2 && row[1] === at;
    const reach = (next: Doc, follow: number) => {
      change(next);
      setBoxDraft(undefined);
      typing.current = undefined;
      setBoxMenu(follow);
    };
    return (
      <BoxMenu
        name={boxDraft ?? box.title}
        onName={(name) => {
          setBoxDraft(name);
          if (!name.trim()) return;
          if (typing.current === box.id) {
            // Typing in the menu is one change, not one for every letter.
            setHist((h) => (h ? { ...h, doc: renameBox(h.doc, at, name), future: [] } : h));
          } else {
            typing.current = box.id;
            change(renameBox(now, at, name));
          }
        }}
        onClose={closeBoxMenu}
        onUp={() => reach(moveBox(now, at, at - 1), at - 1)}
        onDown={() => reach(moveBox(now, at, at + 1), at + 1)}
        upDisabled={at === 0}
        downDisabled={at >= now.sections.length - 1}
        beside={beside}
        canBeside={at > 0}
        onBeside={(on) => {
          const result = setBeside(now, at, on);
          if (result.refused) return say(result.refused);
          change(result.doc);
        }}
        canRemove
        onRemove={() => {
          change(removeBox(now, at));
          closeBoxMenu();
          say(t('customize.boxRemoved', { name: box.title }), () => apply(undo));
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
    closeBoxMenu();
    setRenaming(undefined);
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
      <ShowEmpty.Provider value={item.type}>
        <ItemDetail
          item={item}
          canWrite
          placeholders
          collection={preview.collection}
          collectionOf={() => preview.collection}
        />
      </ShowEmpty.Provider>,
    );
    drawn = device === 'phone' ? <div className="st-phone-frame">{detail}</div> : detail;
  } else drawn = <p className="t-small">{t('cz.noItem')}</p>;

  const discard = () => {
    const before = hist;
    storeDraft(presetName, undefined);
    setHist(start(hist.base));
    setSelected(undefined);
    setBoxMenu(undefined);
    say(t('customize.discarded'), () => setHist(before));
  };
  // Back goes to the item itself, open, not to whatever the history happens to hold.
  const back = () => {
    window.location.replace(
      itemId
        ? hashFor(itemId)
        : scope.template
          ? studioHash({ kind: 'preset', name: presetName })
          : '#/',
    );
  };
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (scope.template) {
        const done = await customizeTemplate(presetName, yaml);
        storeDraft(presetName, undefined);
        onApplied();
        if (saves(scope)) {
          announce(t('cz.saved', { name: done.preset }));
          window.location.hash =
            source.origin === 'official'
              ? customizeHash({ kind: 'preset', name: done.preset })
              : studioHash({ kind: 'preset', name: done.preset });
        } else {
          // A project template is saved once for all its boards; an official one is copied per board.
          const undone = done.boards.filter(
            ({ preset, previous }, at) => preset !== previous.preset || at === 0,
          );
          announce(t('cz.applied', { board: boardsText(scope) }), async () => {
            for (const each of undone) await revertBoard(each.board, each.previous);
          });
          window.location.hash = studioHash({ kind: 'preset', name: presetName });
        }
        return;
      }
      const done = await customizeBoard(board, yaml);
      storeDraft(presetName, undefined);
      onApplied();
      announce(t('cz.applied', { board }), () => revertBoard(board, done.previous));
      window.location.hash = itemId ? hashFor(itemId) : '#/';
    } catch {
      say(t('cz.failed'));
    } finally {
      setBusy(false);
    }
  };
  // What the view being edited does not show, even where another view still does.
  const hidden = Object.values(doc.things).filter(
    (thing) =>
      thing.kind !== 'files' &&
      thing.kind !== 'link' &&
      !FIXED.has(thing.id) &&
      !shown(doc, thing.id, facet),
  );
  const blocks = BLOCKS.flatMap(({ module }) =>
    Object.values(doc.things).filter((thing) => blockOf(thing) === module),
  );
  const addZone: Zone | 'section' = view === 'form' ? 'intake' : view === 'row' ? 'row' : 'section';
  const landing = (kind: Thing['kind']): Zone | 'section' =>
    refusal(kind, addZone) ? 'section' : addZone;
  const placeWord = (zone: Zone | 'section') =>
    zone === 'section' ? (doc.sections[0]?.title ?? zoneWord(zone)) : zoneWord(zone);
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
    if (zone === 'section') setSelected(partOfId(made.doc, made.id));
  };
  const place = (id: string) => {
    const thing = doc.things[id];
    if (!thing) return;
    const zone = landing(thing.kind);
    const section =
      thing.kind === 'link'
        ? Math.max(
            0,
            doc.sections.findIndex(({ id: each }) => each === 'structure'),
          )
        : 0;
    const list = zone === 'section' ? (doc.sections[section]?.entries ?? []) : doc.zones[zone];
    const result = move(doc, id, {
      zone,
      index: list.length,
      ...(zone === 'section' ? { section } : {}),
    });
    if (result.refused) return say(result.refused);
    change(result.doc);
    say(t('cz.moved', { name: thing.name }), () => apply(undo));
  };
  // "Customizing Bug view" in ink, what it reaches after it in the quiet color.
  const [heading = '', ...rest] = titleOf(scope, typeWord, presetName, board).split(' · ');
  const placedNow = drag ? doc.things[drag.id] && shown(doc, drag.id, facet) : false;
  const dropToHide = drag?.over?.zone === 'panel' && placedNow;

  return (
    <main className="cz-page" data-previewing={previewing ? '' : undefined}>
      <header className="cz-bar">
        {previewing ? null : (
          <Button variant="quiet" className="cz-back" onClick={back}>
            <Icon name="left" />
            {scope.template ? t('cz.backStudio') : t('cz.back', { id: idLabel })}
          </Button>
        )}
        <p className="cz-title">
          <b>{heading}</b>
          {rest.length > 0 ? ` · ${rest.join(' · ')}` : ''}
        </p>
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
        {dirty && changes.length > 0 ? (
          <span className="cz-status">{t('cz.status', { count: changes.length })}</span>
        ) : null}
        <Button variant="quiet" disabled={hist.past.length === 0} onClick={() => apply(undo)}>
          <Undo />
          {t('cz.undo')}
        </Button>
        <Button variant="quiet" disabled={hist.future.length === 0} onClick={() => apply(redo)}>
          <Redo />
          {t('cz.redo')}
        </Button>
        <Button variant="quiet" disabled={!dirty} onClick={discard}>
          {t('cz.discard')}
        </Button>
        <Button
          variant="primary"
          className="cz-apply"
          disabled={!dirty}
          onClick={() => setApplying(true)}
        >
          {applyOf(scope)}
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
                says: blockSays(thing),
                icon: BLOCKS.find(({ module }) => module === blockOf(thing))?.icon ?? 'attach',
                ...(at ? { usedIn: homeWord(doc, at) } : {}),
              };
            })}
            dropToHide={!!dropToHide}
            {...(drag ? { grabbing: drag.id } : {})}
            boxes={view === 'detail'}
            onNewBox={() => {
              const made = addBox(doc, 'New box');
              change(made.doc);
              setSelected(undefined);
              setBoxMenu(undefined);
              setRenaming(made.index);
              say(t('customize.boxAdded'), () => apply(undo));
            }}
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
          <div className="cz-sheet">
            <div className="cz-canvas" ref={wrap} data-view={view}>
              {drawn}
            </div>
            <div className="cz-float">
              {rows.length > 0 && view === 'detail' ? (
                <label className="cz-showing">
                  <span>{t('cz.showing', { id: '' }).trim()}</span>
                  <select
                    aria-label={t('cz.showing', { id: '' }).trim()}
                    value={shownId}
                    onChange={(event) => setChosen(event.target.value)}
                  >
                    {rows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.id}
                      </option>
                    ))}
                  </select>
                  <Icon name="chevron" />
                </label>
              ) : null}
              <div className="cz-seg cz-dev">
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
              <button
                type="button"
                className="cz-pv"
                aria-pressed={previewing}
                onClick={() => {
                  setPreviewing(!previewing);
                  setSelected(undefined);
                }}
              >
                {t('cz.preview')}
              </button>
              {previewing ? <p className="cz-none">{t('cz.previewNote')}</p> : null}
            </div>
          </div>
        </div>
      </div>
      {hint && !previewing ? (
        <p className="cz-hint" ref={hintEl} data-away={hintAway ? '' : undefined}>
          {t('cz.hint')}
        </p>
      ) : null}
      {boxing ? (
        <div className="cz-ghost" style={{ left: boxing.x + 12, top: boxing.y + 12 }}>
          {doc.sections[boxing.index]?.title}
        </div>
      ) : null}
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
          {toast.undo ? <span aria-hidden="true">·</span> : null}
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
          place={placeWord(landing(newKind))}
          onSubmit={submitNew}
          onCancel={closeAdd}
          style={{ position: 'fixed', left: adding.left, top: adding.top, width: 320, zIndex: 60 }}
        />
      ) : null}
      {applying ? (
        <ApplyDialog
          target={boardsText(scope)}
          save={saves(scope)}
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
    const low = Math.max(s.top, 0) - c.top + 56;
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
