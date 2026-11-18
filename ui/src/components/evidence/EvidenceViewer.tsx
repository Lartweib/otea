import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { parseTestReport } from '../../../../src/core/test-report.ts';
import { pairIn } from '../../evidence.ts';
import { useFileUrl } from '../../evidence-files.ts';
import { t } from '../../i18n/i18n.ts';
import { Icon } from '../../kit/index.ts';
import { useBlind, useSideWord } from '../../preset-words.ts';
import type { Evidence } from '../../types.ts';
import type { ItemNote } from '../../views/detail/notes.ts';
import { keepDraftThen, sendThenClear } from '../note-send.ts';
import { readerStep } from './arrows.ts';
import { pickNoteText, pickOf } from './blind-pick.ts';
import { DiagramView } from './DiagramView.tsx';
import { FileMeta } from './FileMeta.tsx';
import { FileView } from './FileViews.tsx';
import { ImageCompare, ImageSingle } from './ImageViews.tsx';
import { ZOOM_MAX, ZOOM_MIN, zoomIn, zoomOut } from './pdf-view.ts';
import {
  findPick,
  pickAnchor,
  pickAt,
  pickableOn,
  pickHint,
  pickOfAnchor,
  pickWords,
  type ReaderPick,
  revealUpright,
  selectedPhrase,
  spotOf,
} from './reader-pick.ts';
import { mayBeReport, ReportOr } from './TestReportView.tsx';
import { DiffView, LogView, useEvidenceText } from './TextViews.tsx';
import { VideoPlayer } from './VideoViews.tsx';

// How one piece of evidence is read, whatever module holds it: nothing opens as a raw file.
export type View = 'image' | 'gif' | 'video' | 'audio' | 'diff' | 'log' | 'diagram' | 'file';

export function viewOf(evidence: Pick<Evidence, 'kind' | 'contentType' | 'filename'>): View {
  if (evidence.kind === 'image') {
    const gif = evidence.contentType === 'image/gif' || /\.gif$/i.test(evidence.filename);
    return gif ? 'gif' : 'image';
  }
  return evidence.kind;
}

// The browser's own audio player: a voice note or a recorded sound, with its name below.
export function AudioPlayer({ evidence }: { evidence: Evidence }) {
  const fileUrl = useFileUrl();
  return (
    <figure className="ev-figure ev-audio">
      <div className="ev-stage well">
        {/* biome-ignore lint/a11y/useMediaCaption: a voice note has no captions to offer. */}
        <audio className="ev-audio-player" src={fileUrl(evidence)} controls preload="metadata" />
      </div>
      <figcaption>
        <FileMeta evidence={evidence} />
      </figcaption>
    </figure>
  );
}

// An animated GIF plays as it came; Pause holds the frame it is on (drawn once onto a canvas), Play
// lets it run again.
export function GifView({ evidence }: { evidence: Evidence }) {
  const fileUrl = useFileUrl();
  const img = useRef<HTMLImageElement>(null);
  const still = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const toggle = () => {
    const from = img.current;
    const to = still.current;
    if (!paused && from && to) {
      to.width = from.naturalWidth;
      to.height = from.naturalHeight;
      to.getContext('2d')?.drawImage(from, 0, 0);
    }
    setPaused(!paused);
  };
  return (
    <figure className="ev-figure ev-gif">
      <div className="ev-stage well">
        <img
          ref={img}
          className="ev-img ev-set"
          src={fileUrl(evidence)}
          alt={evidence.caption ?? evidence.filename}
          hidden={paused}
        />
        <canvas
          ref={still}
          className="ev-img ev-set"
          hidden={!paused}
          role="img"
          aria-label={evidence.caption ?? evidence.filename}
        />
        <button
          type="button"
          className="btn quiet sm ev-gif-toggle"
          aria-pressed={paused}
          onClick={toggle}
        >
          {paused ? t('evidence.play') : t('evidence.pause')}
        </button>
      </div>
      <figcaption>
        <FileMeta evidence={evidence} />
      </figcaption>
    </figure>
  );
}

// One piece of evidence read the way its kind is. `phone` reads a diff unified and wrapped, as the
// narrow screen needs.
export function EvidenceViewer({
  evidence,
  phone,
  split,
}: {
  evidence: Evidence;
  phone?: boolean;
  // A diff opens side by side (the desk only).
  split?: boolean;
}) {
  switch (viewOf(evidence)) {
    case 'image':
      return <ImageSingle evidence={evidence} />;
    case 'gif':
      return <GifView evidence={evidence} />;
    case 'video':
      return <VideoPlayer evidence={evidence} />;
    case 'audio':
      return <AudioPlayer evidence={evidence} />;
    case 'diff':
      return (
        <DiffView
          evidence={evidence}
          {...(phone ? { wrap: true } : split !== undefined ? { split } : {})}
        />
      );
    case 'log':
      return (
        <ReportOr evidence={evidence}>
          <LogView evidence={evidence} />
        </ReportOr>
      );
    case 'diagram':
      return <DiagramView evidence={[evidence]} />;
    default:
      return <FileView evidence={evidence} />;
  }
}

// Deciding from inside the reader, when the item waits for your verdict: how many of its files you
// opened, and the moves themselves. Approve never waits for the files left unopened.
export type ReaderDecide = {
  seen: number;
  // A line that never holds the moves: review comments that go with a send-back.
  notice?: string | undefined;
  back?: { label: string; onClick: () => void } | undefined;
  approve?: { label: string; onClick: () => void } | undefined;
};

// A note to the agent at work from inside the reader, on the file read: on the line or diagram node
// clicked, else on the whole file. True once it went: what was typed stays until then.
export type ReaderNote = {
  onSend: (text: string, anchor: { evidence: number } & ReaderPick) => Promise<boolean>;
  // The person's notes already left on these files: listed under the file they are on and drawn
  // where they are; those of the review still open (`pending`) can be changed or taken back (P5-3).
  left?: readonly ItemNote[] | undefined;
  pending?: ((note: ItemNote) => boolean) | undefined;
  onEdit?: ((note: number, text: string) => Promise<boolean>) | undefined;
  onWithdraw?: ((note: number) => Promise<boolean>) | undefined;
};

// A line, node or spot picked in a file, by the file's evidence id.
export type Picked = { id: number; pick: ReaderPick };

// The files of a round read one at a time, the same viewer as the desk's: where you are among them
// ("2 of 7") and a step to the one before or after. `start` lights a line or node on opening, as a
// note's cite asks.
export function EvidenceReader({
  evidence,
  at,
  onAt,
  phone,
  decide,
  note,
  start,
  draft = '',
  onDraft,
  draftPick = null,
  onDraftPick,
}: {
  evidence: readonly Evidence[];
  at: number;
  onAt: (at: number) => void;
  phone?: boolean;
  decide?: ReaderDecide | undefined;
  note?: ReaderNote | undefined;
  start?: ReaderPick | undefined;
  // The note already begun elsewhere (the phone's note sheet), carried into the reader's.
  draft?: string;
  // The note as it is typed, kept by the caller: closing the reader never loses it (DR2-10).
  onDraft?: ((text: string) => void) | undefined;
  // The line, node or spot that note is on, kept by the caller too (DR3-16).
  draftPick?: Picked | null;
  onDraftPick?: ((pick: Picked | null) => void) | undefined;
}) {
  const shown = evidence[at];
  const view = useRef<HTMLDivElement>(null);
  const [pick, setPickHere] = useState<Picked | null>(draftPick);
  const setPick = (value: Picked | null) => {
    setPickHere(value);
    onDraftPick?.(value);
  };
  const [text, setTextHere] = useState(draft);
  const setText = (value: string) => {
    setTextHere(value);
    onDraft?.(value);
  };
  const [sending, setSending] = useState(false);
  const shownId = shown?.id;
  // A before or an after of an image, with its other side among the files: compared on one frame.
  const pair = shown && shown.kind === 'image' ? pairIn(evidence, shown) : null;
  const [comparing, setComparing] = useState(false);
  const compared = comparing && pair !== null;
  const roleWord = useSideWord();
  const blindOf = useBlind();
  const blind = !!pair && !!shown && blindOf(shown);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per cite that opens the reader
  useEffect(() => {
    if (start && shownId !== undefined) setPick({ id: shownId, pick: start });
  }, [start]);
  const picked = pick && pick.id === shownId ? pick.pick : null;
  // An image takes a point (or, on the desk, a zone dragged over it) for the note.
  const spotting =
    note !== undefined && shown !== undefined && !compared && pickableOn(shown) === 'spot';
  const press = useRef<{ x: number; y: number; el: HTMLElement; page?: number } | null>(null);
  const [drag, setDrag] = useState<ReaderPick | null>(null);
  const [frame, setFrame] = useState<CSSProperties | null>(null);
  const imageOf = () => view.current?.querySelector<HTMLImageElement>('img.ev-img:not([hidden])');
  // What a press lands on to mark a spot: the image, or a page of a PDF (P5-6).
  const spotTarget = (target: EventTarget | null): { el: HTMLElement; page?: number } | null => {
    if (!(target instanceof Element)) return null;
    const img = imageOf();
    if (img && target === img) return { el: img };
    const page = target.closest<HTMLElement>('.ev-pdf-page[data-page]');
    return page ? { el: page, page: Number(page.dataset.page) } : null;
  };
  const spot = drag ?? (picked?.x !== undefined ? picked : null);
  // A screenshot zoomed in the reader, by the PDF's steps (P4-11); each file opens fitted.
  const [zoom, setZoom] = useState(1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each file opens fitted
  useEffect(() => setZoom(1), [shownId]);
  const zoomable = !!shown && !compared && viewOf(shown) === 'image';
  // The notes already left on the file shown, numbered as listed; the points and zones among them
  // are drawn over the image, or on their page of a PDF, beside the one being picked (P5-3).
  const leftHere = (note?.left ?? []).filter((n) => n.anchor?.evidence === shownId);
  const allSpots = compared
    ? []
    : leftHere.flatMap((n, k) => (n.anchor?.x !== undefined ? [{ k: k + 1, a: n.anchor }] : []));
  const savedSpots = allSpots.filter(({ a }) => a.page === undefined);
  const pageSpots = allSpots.filter(({ a }) => a.page !== undefined);
  const imageSpot = spot && spot.page === undefined ? spot : null;
  const pageSpot = spot && spot.page !== undefined ? spot : null;
  const spotsKey = savedSpots.map(({ a }) => `${a.x},${a.y},${a.w},${a.h}`).join(';');
  // The pages of a PDF shown, once drawn, to draw the spots on them.
  const [pages, setPages] = useState<ReadonlyMap<number, HTMLElement>>(new Map());
  const wantPages = pageSpots.length > 0 || pageSpot !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: found anew per file shown
  useEffect(() => {
    if (!wantPages) return;
    let tries = 0;
    let timer = 0;
    const find = () => {
      const found = new Map<number, HTMLElement>();
      const els = view.current?.querySelectorAll<HTMLElement>('.ev-pdf-page[data-page]') ?? [];
      for (const el of els) found.set(Number(el.dataset.page), el);
      if (found.size) setPages(found);
      else if (tries++ < 40) timer = window.setTimeout(find, 150);
    };
    find();
    return () => clearTimeout(timer);
  }, [shownId, wantPages]);
  // The spot is drawn over the image, so the layer follows the image's box as the page lays out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the image is found anew per file shown
  useLayoutEffect(() => {
    const root = view.current;
    const img = imageOf();
    if ((!imageSpot && !spotsKey) || !root || !img) {
      setFrame(null);
      return;
    }
    const measure = () => {
      const a = img.getBoundingClientRect();
      const r = root.getBoundingClientRect();
      setFrame({
        left: a.left - r.left + root.scrollLeft,
        top: a.top - r.top + root.scrollTop,
        width: a.width,
        height: a.height,
      });
    };
    measure();
    img.addEventListener('load', measure);
    window.addEventListener('resize', measure);
    // A zoomed image scrolls in its stage: the spots follow it.
    root.addEventListener('scroll', measure, true);
    return () => {
      img.removeEventListener('load', measure);
      window.removeEventListener('resize', measure);
      root.removeEventListener('scroll', measure, true);
    };
  }, [imageSpot?.x, imageSpot?.y, imageSpot?.w, imageSpot?.h, shownId, spotsKey, zoom]);
  // The lines and nodes notes were left on are marked with their number, once drawn.
  const markedKey = leftHere.map((n) => `${n.note}:${n.anchor?.line}:${n.anchor?.node}`).join(';');
  // biome-ignore lint/correctness/useExhaustiveDependencies: marked anew per file and per note
  useEffect(() => {
    const root = view.current;
    if (!root) return;
    for (const el of root.querySelectorAll('[data-noted]')) el.removeAttribute('data-noted');
    const marks = leftHere.flatMap((n, k) => {
      const at = n.anchor ? pickOfAnchor(n.anchor) : null;
      return at && at.x === undefined ? [{ k: k + 1, at }] : [];
    });
    if (marks.length === 0) return;
    let tries = 0;
    let frame = 0;
    const mark = () => {
      let found = 0;
      for (const { k, at } of marks) {
        const el = findPick(root, at);
        if (el) {
          found++;
          if (!el.hasAttribute('data-noted')) el.setAttribute('data-noted', String(k));
        }
      }
      if (found < marks.length && tries++ < 90) frame = requestAnimationFrame(mark);
    };
    mark();
    return () => cancelAnimationFrame(frame);
  }, [markedKey, shownId]);
  // The picked line or node is lit once its viewer has drawn it (a text is fetched first).
  // biome-ignore lint/correctness/useExhaustiveDependencies: another file shown clears the light
  useEffect(() => {
    const root = view.current;
    if (!root) return;
    for (const el of root.querySelectorAll('[data-picked]')) el.removeAttribute('data-picked');
    if (!picked) return;
    let tries = 0;
    let frame = 0;
    const light = () => {
      const el = findPick(root, picked);
      if (el) {
        el.setAttribute('data-picked', 'true');
        revealUpright(el);
      } else if (tries++ < 90) frame = requestAnimationFrame(light);
    };
    light();
    return () => cancelAnimationFrame(frame);
  }, [picked, shownId]);
  // A move from inside the reader takes the note still in its box with it, first (P7-3).
  const withDraft = (move: () => void) => () => {
    if (!note || !shown) return move();
    setSending(true);
    void keepDraftThen(
      text,
      (typed) =>
        note.onSend(typed, pickAnchor(shown.id, picked)).then((went) => {
          if (went) {
            setText('');
            setPick(null);
          }
          return went;
        }),
      move,
    ).finally(() => setSending(false));
  };
  if (!shown) return null;
  const noteBox = note ? (
    <div className="ev-reader-note">
      <div className="ev-reader-on">
        <b>{t('notes.pick.on', { what: pickWords(picked) })}</b>
        <span>
          {compared ? t('notes.pick.hintCompare') : <PickHint evidence={shown} phone={!!phone} />}
        </span>
      </div>
      <textarea
        rows={2}
        value={text}
        placeholder={t('notes.pick.placeholder')}
        aria-label={t('notes.pick.on', { what: pickWords(picked) })}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      <button
        type="button"
        className="btn primary"
        disabled={!text.trim() || sending}
        onClick={() => {
          setSending(true);
          void sendThenClear(
            () => note.onSend(text.trim(), pickAnchor(shown.id, picked)),
            () => {
              setText('');
              setPick(null);
            },
          ).finally(() => setSending(false));
        }}
      >
        {t('notes.pick.send')}
      </button>
    </div>
  ) : null;
  const decideBar = decide ? (
    <div className="ev-reader-decide">
      <span className="ev-reader-seen">
        {t('evidence.seenOf', { n: decide.seen, total: evidence.length })}
        {decide.notice ? <small className="ev-reader-notice">{decide.notice}</small> : null}
      </span>
      {decide.back ? (
        <button
          type="button"
          className="btn quiet"
          disabled={sending}
          onClick={withDraft(decide.back.onClick)}
        >
          {decide.back.label}
        </button>
      ) : null}
      {decide.approve ? (
        <button
          type="button"
          className="btn primary"
          disabled={sending}
          onClick={withDraft(decide.approve.onClick)}
        >
          {decide.approve.label}
        </button>
      ) : null}
    </div>
  ) : null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ← and → step files from anywhere inside it (P5-9)
    <div className="ev-reader" onKeyDown={(e) => stepByKey(e, at, evidence.length, onAt)}>
      <div className="ev-reader-bar">
        <button
          type="button"
          className="btn quiet icon"
          disabled={at === 0}
          aria-label={t('evidence.prevFile')}
          onClick={() => onAt(at - 1)}
        >
          <Icon name="left" />
        </button>
        <span className="ev-reader-where">
          <b>{t('evidence.ofFiles', { n: at + 1, total: evidence.length })}</b>
          <span className="ev-reader-name">{shown.filename}</span>
        </span>
        <button
          type="button"
          className="btn quiet icon"
          disabled={at === evidence.length - 1}
          aria-label={t('evidence.nextFile')}
          onClick={() => onAt(at + 1)}
        >
          <Icon name="right" />
        </button>
      </div>
      {pair ? (
        <div className="ev-reader-pair">
          <span>
            {t(blind ? 'evidence.reader.sideBlind' : 'evidence.reader.side', {
              side: roleWord(shown) ?? '',
            })}
          </span>
          {blind && note ? (
            <BlindPick
              ids={[pair.before.id, pair.after.id]}
              shown={shown}
              side={(roleWord(shown) ?? 'A') as 'A' | 'B'}
              note={note}
            />
          ) : null}
          <button
            type="button"
            className="btn quiet sm"
            aria-pressed={compared}
            onClick={() => setComparing(!compared)}
          >
            {t(blind ? 'evidence.reader.compareBlind' : 'evidence.reader.compare')}
          </button>
        </div>
      ) : null}
      {zoomable ? (
        <div className="ev-reader-zoom">
          <button
            type="button"
            className="btn quiet sm icon"
            disabled={zoom <= ZOOM_MIN}
            aria-label={t('evidence.pdf.zoomOut')}
            onClick={() => setZoom(zoomOut(zoom))}
          >
            −
          </button>
          <button
            type="button"
            className="btn quiet sm"
            aria-pressed={zoom === 1}
            aria-label={t('evidence.pdf.fit')}
            title={t('evidence.pdf.fit')}
            onClick={() => setZoom(1)}
          >
            {zoom === 1 ? t('evidence.pdf.fitShort') : `${Math.round(zoom * 100)} %`}
          </button>
          <button
            type="button"
            className="btn quiet sm icon"
            disabled={zoom >= ZOOM_MAX}
            aria-label={t('evidence.pdf.zoomIn')}
            onClick={() => setZoom(zoomIn(zoom))}
          >
            +
          </button>
        </div>
      ) : null}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a click on a line picks it for the note; the note is also sent without one */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: picking is optional, the note goes on the whole file */}
      <div
        ref={view}
        className="ev-reader-view"
        data-picking={note ? 'true' : undefined}
        data-spotting={spotting ? 'true' : undefined}
        data-zoomed={zoom !== 1 ? 'true' : undefined}
        style={zoom !== 1 ? ({ '--zoom': String(zoom) } as CSSProperties) : undefined}
        onPointerDown={
          spotting
            ? (e) => {
                const on = spotTarget(e.target);
                if (!on) return;
                // A PDF page scrolls under a finger: only the image holds the press.
                if (on.page === undefined) e.preventDefault();
                press.current = { x: e.clientX, y: e.clientY, ...on };
                e.currentTarget.setPointerCapture?.(e.pointerId);
              }
            : undefined
        }
        onPointerMove={
          spotting && !phone
            ? (e) => {
                const from = press.current;
                if (!from) return;
                const at = { x: e.clientX, y: e.clientY };
                const zone = spotOf(from.el.getBoundingClientRect(), from, at, true);
                setDrag(
                  zone?.w !== undefined
                    ? { ...zone, ...(from.page === undefined ? {} : { page: from.page }) }
                    : null,
                );
              }
            : undefined
        }
        onPointerUp={
          spotting
            ? (e) => {
                const from = press.current;
                press.current = null;
                setDrag(null);
                if (!from) return;
                const at = { x: e.clientX, y: e.clientY };
                const hit = spotOf(from.el.getBoundingClientRect(), from, at, !phone);
                if (hit)
                  setPick({
                    id: shown.id,
                    pick: { ...hit, ...(from.page === undefined ? {} : { page: from.page }) },
                  });
              }
            : undefined
        }
        onPointerCancel={() => {
          press.current = null;
          setDrag(null);
        }}
        onClick={
          note
            ? (e) => {
                const root = view.current;
                const phrase = root ? selectedPhrase(root) : null;
                const hit = phrase ? { pick: phrase } : pickAt(e.target);
                if (hit) setPick({ id: shown.id, pick: hit.pick });
              }
            : undefined
        }
      >
        {compared && pair ? (
          <ImageCompare evidence={[pair.before, pair.after]} blind={blind} />
        ) : (
          <EvidenceViewer key={shown.id} evidence={shown} {...(phone ? { phone } : {})} />
        )}
        {pageSpots.map(({ k, a }) => {
          const el = a.page === undefined ? undefined : pages.get(a.page);
          return el
            ? createPortal(
                <span
                  className="ev-spot"
                  data-saved="true"
                  data-zone={a.w !== undefined ? 'true' : undefined}
                  style={spotStyle(a)}
                  aria-hidden="true"
                >
                  <i>{k}</i>
                </span>,
                el,
                `page-${k}`,
              )
            : null;
        })}
        {pageSpot?.page !== undefined && pages.get(pageSpot.page)
          ? createPortal(
              <span
                className="ev-spot"
                data-zone={pageSpot.w !== undefined ? 'true' : undefined}
                style={spotStyle(pageSpot)}
                aria-hidden="true"
              />,
              pages.get(pageSpot.page) as HTMLElement,
              'page-pick',
            )
          : null}
        {(imageSpot || savedSpots.length) && frame ? (
          <div className="ev-spot-layer" style={frame} aria-hidden="true">
            {savedSpots.map(({ k, a }) => (
              <span
                key={`saved-${k}`}
                className="ev-spot"
                data-saved="true"
                data-zone={a.w !== undefined ? 'true' : undefined}
                style={spotStyle(a)}
              >
                <i>{k}</i>
              </span>
            ))}
            {imageSpot ? (
              <span
                className="ev-spot"
                data-zone={imageSpot.w !== undefined ? 'true' : undefined}
                style={spotStyle(imageSpot)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {note && leftHere.length ? (
        <LeftNotes
          key={shown.id}
          notes={leftHere}
          note={note}
          phrase={pickableOn(shown) === 'phrase'}
        />
      ) : null}
      {phone && (note || decide) ? (
        // On the phone the note and the moves share one foot that stays at the sheet's bottom: two
        // sticky feet laid the moves over the note box (DR2-10).
        <div className="ev-reader-foot">
          {noteBox}
          {decideBar}
        </div>
      ) : (
        <>
          {noteBox}
          {decideBar}
        </>
      )}
    </div>
  );
}

// «Me quedo con A» on a blind compare's file: a comment of the review on it, which replaces a pick
// of the other side (P5-4).
export function BlindPick({
  ids,
  shown,
  side,
  note,
}: {
  ids: readonly number[];
  shown: Evidence;
  side: 'A' | 'B';
  note: ReaderNote;
}) {
  const [busy, setBusy] = useState(false);
  const pending = note.pending ?? (() => false);
  const picked = pickOf(note.left ?? [], ids, pending);
  const here = picked?.anchor?.evidence === shown.id;
  if (here) return <span className="ev-picked">{t('compare.picked', { side })}</span>;
  const pickIt = async () => {
    if (picked) await note.onWithdraw?.(picked.note);
    await note.onSend(pickNoteText(side), { evidence: shown.id });
  };
  return (
    <button
      type="button"
      className="btn quiet sm"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void pickIt().finally(() => setBusy(false));
      }}
    >
      {t('compare.pick', { side })}
    </button>
  );
}

// ← and → from anywhere in the reader step to the file before or after, unless what has the focus
// takes them itself (P5-9).
export function stepByKey(
  e: KeyboardEvent<HTMLElement>,
  at: number,
  total: number,
  onAt: (at: number) => void,
): void {
  if (e.defaultPrevented) return;
  const el = e.target instanceof HTMLElement ? e.target : null;
  const to = readerStep(
    e.key,
    {
      tagName: el?.tagName ?? '',
      role: el?.getAttribute('role') ?? null,
      editable: !!el?.isContentEditable,
    },
    at,
    total,
  );
  if (to === null) return;
  e.preventDefault();
  onAt(to);
}

function spotStyle(at: ReaderPick): CSSProperties {
  return {
    left: `${at.x}%`,
    top: `${at.y}%`,
    ...(at.w !== undefined ? { width: `${at.w}%`, height: `${at.h}%` } : {}),
  };
}

// The notes already left on the file shown, numbered as the pins over it are: what each says and
// where it is. A comment of the review still open can be changed or taken back before it goes.
function LeftNotes({
  notes,
  note,
  phrase,
}: {
  notes: readonly ItemNote[];
  note: ReaderNote;
  // The file is a document: a quote is a phrase of it, not a line.
  phrase: boolean;
}) {
  const [editing, setEditing] = useState<{ note: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (act: () => Promise<boolean>, done?: () => void) => {
    setBusy(true);
    void act()
      .catch(() => false)
      .then((went) => {
        if (went) done?.();
      })
      .finally(() => setBusy(false));
  };
  return (
    <div className="ev-reader-left">
      <b className="ev-left-head">{t('notes.left.title', { count: notes.length })}</b>
      <ol>
        {notes.map((n, k) => {
          const pending = !!note.pending?.(n);
          const at = n.anchor ? pickOfAnchor(n.anchor) : null;
          const where = pickWords(at && phrase ? { ...at, phrase: true } : at);
          const open = editing?.note === n.note ? editing : null;
          return (
            <li key={n.note} data-pending={pending ? 'true' : undefined}>
              <span className="ev-left-k" aria-hidden="true">
                {k + 1}
              </span>
              <div className="ev-left-body">
                <span className="ev-left-on">{where}</span>
                {open ? (
                  <textarea
                    rows={2}
                    value={open.text}
                    aria-label={t('notes.left.editAria', { n: k + 1 })}
                    onChange={(e) => setEditing({ note: n.note, text: e.currentTarget.value })}
                  />
                ) : (
                  <p>{n.text}</p>
                )}
              </div>
              {pending && note.onEdit && note.onWithdraw ? (
                <span className="ev-left-acts">
                  {open ? (
                    <>
                      <button
                        type="button"
                        className="btn primary sm"
                        disabled={busy || !open.text.trim()}
                        onClick={() =>
                          run(
                            () => note.onEdit?.(n.note, open.text.trim()) ?? Promise.resolve(false),
                            () => setEditing(null),
                          )
                        }
                      >
                        {t('notes.left.save')}
                      </button>
                      <button
                        type="button"
                        className="btn quiet sm"
                        onClick={() => setEditing(null)}
                      >
                        {t('notes.left.cancel')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn quiet sm"
                        disabled={busy}
                        onClick={() => setEditing({ note: n.note, text: n.text })}
                      >
                        {t('notes.left.edit')}
                      </button>
                      <button
                        type="button"
                        className="btn quiet sm"
                        disabled={busy}
                        onClick={() =>
                          run(() => note.onWithdraw?.(n.note) ?? Promise.resolve(false))
                        }
                      >
                        {t('notes.left.remove')}
                      </button>
                    </>
                  )}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// What the note box says a click does on the file shown. A test report (JUnit XML, vitest or jest
// JSON, a log that is one) is drawn as its results, not as lines: it is commented whole (UI2-9).
function PickHint({ evidence, phone }: { evidence: Evidence; phone: boolean }) {
  if (!mayBeReport(evidence)) return <>{pickHint(evidence, phone)}</>;
  // Keyed by the file: the text it reads is that file's, never the one shown before.
  return <ReportHint key={evidence.id} evidence={evidence} phone={phone} />;
}

function ReportHint({ evidence, phone }: { evidence: Evidence; phone: boolean }) {
  const state = useEvidenceText(evidence);
  const report = state.status === 'ready' && parseTestReport(state.text) !== null;
  return <>{report ? t('notes.pick.hintFile') : pickHint(evidence, phone)}</>;
}
