import {
  type KeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
  useRef,
  useState,
} from 'react';
import { comparePair, nudgeSplit, splitAt, stepIndex } from '../../evidence.ts';
import { useFileUrl } from '../../evidence-files.ts';
import { t } from '../../i18n/i18n.ts';
import { Button, Icon } from '../../kit/index.ts';
import type { Evidence } from '../../types.ts';
import { stepWithArrows } from './arrows.ts';
import { FileMeta } from './FileMeta.tsx';

function altOf(evidence: Evidence): string {
  return evidence.caption ?? evidence.filename;
}

export function ImageSingle({ evidence }: { evidence: Evidence }) {
  const fileUrl = useFileUrl();
  return (
    <figure className="ev-figure">
      <div className="ev-stage well">
        <img className="ev-img ev-set" src={fileUrl(evidence)} alt={altOf(evidence)} />
      </div>
      <figcaption>
        <FileMeta evidence={evidence} />
      </figcaption>
    </figure>
  );
}

// Every image, oldest first: one large, the rest as thumbnails. It opens on the newest (the latest
// round's), and follows a newer one that arrives until another is picked. Left and right step
// through them.
export function ImageGallery({ evidence, label }: { evidence: Evidence[]; label: string }) {
  const fileUrl = useFileUrl();
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const at = evidence.findIndex(({ id }) => id === picked);
  const index = at >= 0 ? at : evidence.length - 1;
  const current = evidence[index];
  if (!current) return null;
  const many = evidence.length > 1;
  const setIndex = (to: number) => setPicked(evidence[to]?.id);
  const step = (delta: number) => setIndex(stepIndex(index, delta, evidence.length));
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) =>
    stepWithArrows(event, index, evidence.length, setIndex);
  return (
    <section
      className="ev-gallery"
      aria-roledescription={t('evidence.galleryRole')}
      aria-label={label}
      onKeyDown={many ? onKeyDown : undefined}
    >
      <div className="ev-stage well">
        <img
          key={current.id}
          className="ev-img ev-set"
          src={fileUrl(current)}
          alt={altOf(current)}
        />
        {many ? (
          <>
            <span className="ev-tag r" aria-live="polite">
              {index + 1} / {evidence.length}
            </span>
            <Button
              className="ev-nav l"
              size="sm"
              icon
              aria-label={t('evidence.previous')}
              onClick={() => step(-1)}
            >
              <Icon name="left" />
            </Button>
            <Button
              className="ev-nav r"
              size="sm"
              icon
              aria-label={t('evidence.next')}
              onClick={() => step(1)}
            >
              <Icon name="right" />
            </Button>
          </>
        ) : null}
      </div>
      <FileMeta evidence={current} />
      {many ? (
        <ul className="ev-thumbs">
          {evidence.map((entry, at) => (
            <li key={entry.id}>
              <button
                type="button"
                className="ev-thumb well"
                aria-current={at === index ? 'true' : undefined}
                aria-label={t('evidence.show', { file: entry.filename })}
                onClick={() => setIndex(at)}
              >
                <img src={fileUrl(entry)} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export type CompareMode = 'slider' | 'side';

type Side = 'before' | 'after';

// What each side is called: before and after, A and B on a blind compare (P5-4), or the rounds
// they come from (P5-5).
export type SideNames = Readonly<Record<Side, string>>;

const BLIND: SideNames = { before: 'A', after: 'B' };

const sideNames = (): SideNames => ({ before: t('evidence.before'), after: t('evidence.after') });

const sideAlt = (label: string, evidence: Evidence) =>
  t('evidence.alt', { side: label, alt: altOf(evidence) });

function Missing({ side, blind }: { side: Side; blind: boolean }) {
  return (
    <div className="ev-frame ev-missing well">
      <span className="t-cap">
        {blind
          ? t('evidence.blindEmpty')
          : t(side === 'before' ? 'evidence.noBefore' : 'evidence.noAfter')}
      </span>
    </div>
  );
}

function Framed({ evidence, label }: { evidence: Evidence; label: string }) {
  const fileUrl = useFileUrl();
  return (
    <figure className="ev-frame">
      <div className="ev-stage well">
        <img className="ev-img" src={fileUrl(evidence)} alt={sideAlt(label, evidence)} />
        <span className="ev-tag l">{label}</span>
      </div>
      <figcaption>
        <FileMeta evidence={evidence} />
      </figcaption>
    </figure>
  );
}

// The latest before and after on one frame, a divider between them: drag it, or focus it and use the
// arrow keys. Side by side shows them apart.
export function ImageCompare({
  evidence,
  blind = false,
  names,
  initial = 'slider',
}: {
  evidence: Evidence[];
  blind?: boolean;
  names?: SideNames | undefined;
  initial?: CompareMode;
}) {
  const fileUrl = useFileUrl();
  const { before, after } = comparePair(evidence);
  const [mode, setMode] = useState<CompareMode>(initial);
  const label = names ?? (blind ? BLIND : sideNames());
  const [split, setSplit] = useState(50);
  const [ratio, setRatio] = useState<number | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  if (!before || !after) {
    return (
      <div className="ev-pair">
        {before ? (
          <Framed evidence={before} label={label.before} />
        ) : (
          <Missing side="before" blind={blind} />
        )}
        {after ? (
          <Framed evidence={after} label={label.after} />
        ) : (
          <Missing side="after" blind={blind} />
        )}
      </div>
    );
  }
  const follow = (event: PointerEvent) => {
    const box = frame.current?.getBoundingClientRect();
    if (box) setSplit(splitAt(event.clientX, box.left, box.width));
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    follow(event);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (dragging) follow(event);
  };
  const stop = () => setDragging(false);
  const onKeyDown = (event: KeyboardEvent) => {
    const to = nudgeSplit(split, event.key, event.shiftKey);
    if (to === undefined) return;
    event.preventDefault();
    setSplit(to);
  };
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) setRatio(naturalWidth / naturalHeight);
  };
  const shown = Math.round(split);
  return (
    <div className="ev-compare" data-mode={mode}>
      <fieldset className="ev-modes" aria-label={t('evidence.howToCompare')}>
        <Button size="sm" aria-pressed={mode === 'slider'} onClick={() => setMode('slider')}>
          {t('evidence.slider')}
        </Button>
        <Button size="sm" aria-pressed={mode === 'side'} onClick={() => setMode('side')}>
          {t('evidence.sideBySide')}
        </Button>
      </fieldset>
      {mode === 'slider' ? (
        <figure className="ev-frame">
          <div
            ref={frame}
            className="ev-cmp well"
            data-dragging={dragging ? 'true' : undefined}
            style={ratio ? { aspectRatio: String(ratio) } : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stop}
            onPointerCancel={stop}
          >
            <img
              className="ev-img"
              src={fileUrl(after)}
              alt={sideAlt(label.after, after)}
              onLoad={onLoad}
              draggable={false}
            />
            <img
              className="ev-img ev-cmp-before"
              src={fileUrl(before)}
              alt={sideAlt(label.before, before)}
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
              draggable={false}
            />
            <span className="ev-tag l">{label.before}</span>
            <span className="ev-tag r">{label.after}</span>
            <div
              className="ev-divider"
              style={{ left: `${split}%` }}
              role="slider"
              tabIndex={0}
              aria-label={t(blind ? 'evidence.dividerBlind' : 'evidence.divider')}
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={shown}
              aria-valuetext={
                names || blind
                  ? `${label.before} ${shown} % · ${label.after} ${100 - shown} %`
                  : t('evidence.split', { before: shown, after: 100 - shown })
              }
              onKeyDown={onKeyDown}
            >
              <span className="ev-knob" aria-hidden="true">
                <Icon name="left" />
                <Icon name="right" />
              </span>
            </div>
          </div>
          <figcaption className="ev-pair-meta">
            <FileMeta evidence={before} />
            <FileMeta evidence={after} />
          </figcaption>
        </figure>
      ) : (
        <div className="ev-pair">
          <Framed evidence={before} label={label.before} />
          <Framed evidence={after} label={label.after} />
        </div>
      )}
    </div>
  );
}
