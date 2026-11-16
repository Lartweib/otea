import { useEffect, useRef, useState } from 'react';
import { useFileUrl } from '../../evidence-files.ts';
import { t } from '../../i18n/i18n.ts';
import { Icon } from '../../kit/index.ts';
import type { Evidence } from '../../types.ts';
import { DiagramView } from './DiagramView.tsx';
import { FileMeta } from './FileMeta.tsx';
import { FileView } from './FileViews.tsx';
import { ImageSingle } from './ImageViews.tsx';
import { findPick, pickAnchor, pickAt, pickWords, type ReaderPick } from './reader-pick.ts';
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
  back?: { label: string; onClick: () => void } | undefined;
  approve?: { label: string; onClick: () => void } | undefined;
};

// A note to the agent at work from inside the reader, on the file read: on the line or diagram node
// clicked, else on the whole file.
export type ReaderNote = {
  onSend: (text: string, anchor: { evidence: number } & ReaderPick) => void;
};

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
}) {
  const shown = evidence[at];
  const view = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<{ id: number; pick: ReaderPick } | null>(null);
  const [text, setText] = useState(draft);
  const shownId = shown?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per cite that opens the reader
  useEffect(() => {
    if (start && shownId !== undefined) setPick({ id: shownId, pick: start });
  }, [start]);
  const picked = pick && pick.id === shownId ? pick.pick : null;
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
        el.scrollIntoView?.({ block: 'nearest' });
      } else if (tries++ < 90) frame = requestAnimationFrame(light);
    };
    light();
    return () => cancelAnimationFrame(frame);
  }, [picked, shownId]);
  if (!shown) return null;
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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a click on a line picks it for the note; the note is also sent without one */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: picking is optional, the note goes on the whole file */}
      <div
        ref={view}
        className="ev-reader-view"
        data-picking={note ? 'true' : undefined}
        onClick={
          note
            ? (e) => {
                const hit = pickAt(e.target);
                if (hit) setPick({ id: shown.id, pick: hit.pick });
              }
            : undefined
        }
      >
        <EvidenceViewer key={shown.id} evidence={shown} {...(phone ? { phone } : {})} />
      </div>
      {note ? (
        <div className="ev-reader-note">
          <div className="ev-reader-on">
            <b>{t('notes.pick.on', { what: pickWords(picked) })}</b>
            <span>{t(phone ? 'notes.pick.hintTouch' : 'notes.pick.hint')}</span>
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
            disabled={!text.trim()}
            onClick={() => {
              note.onSend(text.trim(), pickAnchor(shown.id, picked));
              setText('');
              setPick(null);
            }}
          >
            {t('notes.pick.send')}
          </button>
        </div>
      ) : null}
      {decide ? (
        <div className="ev-reader-decide">
          <span className="ev-reader-seen">
            {t('evidence.seenOf', { n: decide.seen, total: evidence.length })}
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
      ) : null}
    </div>
  );
}
