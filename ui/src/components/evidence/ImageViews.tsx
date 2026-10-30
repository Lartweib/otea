import {
  type KeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
  useRef,
  useState,
} from 'react';
import { evidenceFileUrl } from '../../api.ts';
import { comparePair, nudgeSplit, splitAt, stepIndex } from '../../evidence.ts';
import { Button, Icon } from '../../kit/index.ts';
import type { Evidence } from '../../types.ts';
import { stepWithArrows } from './arrows.ts';
import { FileMeta } from './FileMeta.tsx';

function altOf(evidence: Evidence): string {
  return evidence.caption ?? evidence.filename;
}

export function ImageSingle({ evidence }: { evidence: Evidence }) {
  return (
    <figure className="ev-figure">
      <div className="ev-stage well">
        <img className="ev-img ev-set" src={evidenceFileUrl(evidence.id)} alt={altOf(evidence)} />
      </div>
      <figcaption>
        <FileMeta evidence={evidence} />
      </figcaption>
    </figure>
  );
}

// Every image, oldest first: one large, the rest as thumbnails. Left and right step through them.
export function ImageGallery({ evidence, label }: { evidence: Evidence[]; label: string }) {
  const [index, setIndex] = useState(0);
  const current = evidence[Math.min(index, evidence.length - 1)];
  if (!current) return null;
  const many = evidence.length > 1;
  const step = (delta: number) => setIndex((at) => stepIndex(at, delta, evidence.length));
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) =>
    stepWithArrows(event, index, evidence.length, setIndex);
  return (
    <section
      className="ev-gallery"
      aria-roledescription="gallery"
      aria-label={label}
      onKeyDown={many ? onKeyDown : undefined}
    >
      <div className="ev-stage well">
        <img
          key={current.id}
          className="ev-img ev-set"
          src={evidenceFileUrl(current.id)}
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
              aria-label="Previous image"
              onClick={() => step(-1)}
            >
              <Icon name="left" />
            </Button>
            <Button
              className="ev-nav r"
              size="sm"
              icon
              aria-label="Next image"
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
                aria-label={`Show ${entry.filename}`}
                onClick={() => setIndex(at)}
              >
                <img src={evidenceFileUrl(entry.id)} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

type CompareMode = 'slider' | 'side';

function Missing({ side }: { side: 'before' | 'after' }) {
  return (
    <div className="ev-frame ev-missing well">
      <span className="t-cap">no {side} yet</span>
    </div>
  );
}

function Framed({ evidence, side }: { evidence: Evidence; side: 'before' | 'after' }) {
  return (
    <figure className="ev-frame">
      <div className="ev-stage well">
        <img
          className="ev-img"
          src={evidenceFileUrl(evidence.id)}
          alt={`${side}: ${altOf(evidence)}`}
        />
        <span className="ev-tag l">{side}</span>
      </div>
      <figcaption>
        <FileMeta evidence={evidence} />
      </figcaption>
    </figure>
  );
}

// The latest before and after on one frame, a divider between them: drag it, or focus it and use the
// arrow keys. Side by side shows them apart.
export function ImageCompare({ evidence }: { evidence: Evidence[] }) {
  const { before, after } = comparePair(evidence);
  const [mode, setMode] = useState<CompareMode>('slider');
  const [split, setSplit] = useState(50);
  const [ratio, setRatio] = useState<number | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  if (!before || !after) {
    return (
      <div className="ev-pair">
        {before ? <Framed evidence={before} side="before" /> : <Missing side="before" />}
        {after ? <Framed evidence={after} side="after" /> : <Missing side="after" />}
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
      <fieldset className="ev-modes" aria-label="How to compare">
        <Button size="sm" aria-pressed={mode === 'slider'} onClick={() => setMode('slider')}>
          slider
        </Button>
        <Button size="sm" aria-pressed={mode === 'side'} onClick={() => setMode('side')}>
          side by side
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
              src={evidenceFileUrl(after.id)}
              alt={`after: ${altOf(after)}`}
              onLoad={onLoad}
              draggable={false}
            />
            <img
              className="ev-img ev-cmp-before"
              src={evidenceFileUrl(before.id)}
              alt={`before: ${altOf(before)}`}
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
              draggable={false}
            />
            <span className="ev-tag l">before</span>
            <span className="ev-tag r">after</span>
            <div
              className="ev-divider"
              style={{ left: `${split}%` }}
              role="slider"
              tabIndex={0}
              aria-label="Divider between before and after"
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={shown}
              aria-valuetext={`${shown}% before, ${100 - shown}% after`}
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
          <Framed evidence={before} side="before" />
          <Framed evidence={after} side="after" />
        </div>
      )}
    </div>
  );
}
