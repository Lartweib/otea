import { useRef, useState } from 'react';
import { useFileUrl } from '../../evidence-files.ts';
import { t } from '../../i18n/i18n.ts';
import { Icon } from '../../kit/index.ts';
import type { Evidence } from '../../types.ts';
import { DiagramView } from './DiagramView.tsx';
import { FileMeta } from './FileMeta.tsx';
import { FileView } from './FileViews.tsx';
import { ImageSingle } from './ImageViews.tsx';
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
      return <LogView evidence={evidence} />;
    case 'diagram':
      return <DiagramView evidence={[evidence]} />;
    default:
      return <FileView evidence={evidence} />;
  }
}

// The files of a round read one at a time, the same viewer as the desk's: where you are among them
// ("2 of 7") and a step to the one before or after.
export function EvidenceReader({
  evidence,
  at,
  onAt,
  phone,
}: {
  evidence: readonly Evidence[];
  at: number;
  onAt: (at: number) => void;
  phone?: boolean;
}) {
  const shown = evidence[at];
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
      <EvidenceViewer key={shown.id} evidence={shown} {...(phone ? { phone } : {})} />
    </div>
  );
}
