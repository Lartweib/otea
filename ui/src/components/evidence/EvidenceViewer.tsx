import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pairIn, roleWord } from '../../evidence.ts';
import { useFileUrl } from '../../evidence-files.ts';
import { t } from '../../i18n/i18n.ts';
import { Icon } from '../../kit/index.ts';
import type { Evidence } from '../../types.ts';
import { sendThenClear } from '../note-send.ts';
import { DiagramView } from './DiagramView.tsx';
import { FileMeta } from './FileMeta.tsx';
import { FileView } from './FileViews.tsx';
import { ImageCompare, ImageSingle } from './ImageViews.tsx';
import {
  findPick,
  pickAnchor,
  pickAt,
  pickableOn,
  pickHint,
  pickWords,
  type ReaderPick,
  revealUpright,
  spotOf,
} from './reader-pick.ts';
import { ReportOr } from './TestReportView.tsx';
import { DiffView, LogView } from './TextViews.tsx';
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per cite that opens the reader
  useEffect(() => {
    if (start && shownId !== undefined) setPick({ id: shownId, pick: start });
  }, [start]);
  const picked = pick && pick.id === shownId ? pick.pick : null;
  // An image takes a point (or, on the desk, a zone dragged over it) for the note.
  const spotting =
    note !== undefined && shown !== undefined && !compared && pickableOn(shown) === 'spot';
  const press = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<ReaderPick | null>(null);
  const [frame, setFrame] = useState<CSSProperties | null>(null);
  const imageOf = () => view.current?.querySelector<HTMLImageElement>('img.ev-img:not([hidden])');
  const spot = drag ?? (picked?.x !== undefined ? picked : null);
  // The spot is drawn over the image, so the layer follows the image's box as the page lays out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the image is found anew per file shown
  useLayoutEffect(() => {
    const root = view.current;
    const img = imageOf();
    if (!spot || !root || !img) {
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
    return () => {
      img.removeEventListener('load', measure);
      window.removeEventListener('resize', measure);
    };
  }, [spot?.x, spot?.y, spot?.w, spot?.h, shownId]);
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
  if (!shown) return null;
  const noteBox = note ? (
    <div className="ev-reader-note">
      <div className="ev-reader-on">
        <b>{t('notes.pick.on', { what: pickWords(picked) })}</b>
        <span>{compared ? t('notes.pick.hintCompare') : pickHint(shown, !!phone)}</span>
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
        <button type="button" className="btn quiet" onClick={decide.back.onClick}>
          {decide.back.label}
        </button>
      ) : null}
      {decide.approve ? (
        <button type="button" className="btn primary" onClick={decide.approve.onClick}>
          {decide.approve.label}
        </button>
      ) : null}
    </div>
  ) : null;
  return (
    <div className="ev-reader">
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
          <span>{t('evidence.reader.side', { side: roleWord(shown) ?? '' })}</span>
          <button
            type="button"
            className="btn quiet sm"
            aria-pressed={compared}
            onClick={() => setComparing(!compared)}
          >
            {t('evidence.reader.compare')}
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
        onPointerDown={
          spotting
            ? (e) => {
                const img = imageOf();
                if (!img || e.target !== img) return;
                e.preventDefault();
                press.current = { x: e.clientX, y: e.clientY };
                e.currentTarget.setPointerCapture?.(e.pointerId);
              }
            : undefined
        }
        onPointerMove={
          spotting && !phone
            ? (e) => {
                const img = imageOf();
                if (!press.current || !img) return;
                const at = { x: e.clientX, y: e.clientY };
                const zone = spotOf(img.getBoundingClientRect(), press.current, at, true);
                setDrag(zone?.w !== undefined ? zone : null);
              }
            : undefined
        }
        onPointerUp={
          spotting
            ? (e) => {
                const img = imageOf();
                const from = press.current;
                press.current = null;
                setDrag(null);
                if (!from || !img) return;
                const at = { x: e.clientX, y: e.clientY };
                const hit = spotOf(img.getBoundingClientRect(), from, at, !phone);
                if (hit) setPick({ id: shown.id, pick: hit });
              }
            : undefined
        }
        onClick={
          note
            ? (e) => {
                const hit = pickAt(e.target);
                if (hit) setPick({ id: shown.id, pick: hit.pick });
              }
            : undefined
        }
      >
        {compared && pair ? (
          <ImageCompare evidence={[pair.before, pair.after]} />
        ) : (
          <EvidenceViewer key={shown.id} evidence={shown} {...(phone ? { phone } : {})} />
        )}
        {spot && frame ? (
          <div className="ev-spot-layer" style={frame} aria-hidden="true">
            <span
              className="ev-spot"
              data-zone={spot.w !== undefined ? 'true' : undefined}
              style={{
                left: `${spot.x}%`,
                top: `${spot.y}%`,
                ...(spot.w !== undefined ? { width: `${spot.w}%`, height: `${spot.h}%` } : {}),
              }}
            />
          </div>
        ) : null}
      </div>
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
