import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { evidenceFileUrl } from '../api.ts';
import {
  COMPARE_MODES,
  type CompareMode,
  FPS,
  frameAt,
  frameLabel,
  type Pins,
  pin,
  stepFrame,
  swap,
  timeOf,
} from '../compare.ts';
import { type PlainKey, t } from '../i18n/i18n.ts';
import { Button } from '../kit/index.ts';
import { type Round, roundFiles } from '../rounds.ts';
import type { Evidence } from '../types.ts';

const MODE_LABEL: Readonly<Record<CompareMode, PlainKey>> = {
  side: 'compare.side',
  slider: 'compare.slider',
  onion: 'compare.onion',
  difference: 'compare.difference',
};

// The module whose files the comparison shows: the first one both rounds hold, recordings first.
function sharedModule(a: Round | undefined, b: Round | undefined, modules: string[]) {
  const both = modules.filter((module) => roundFiles(a, module)[0] && roundFiles(b, module)[0]);
  const video = both.find((module) => roundFiles(b, module)[0]?.kind === 'video');
  return video ?? both[0];
}

type LayerProps = {
  entry: Evidence;
  side: 'a' | 'b';
  media: (role: 'a' | 'b', element: HTMLVideoElement | null) => void;
  onSize: (width: number, height: number) => void;
  onDuration: (seconds: number) => void;
};

function Layer({ entry, side, media, onSize, onDuration }: LayerProps) {
  const src = evidenceFileUrl(entry.id);
  if (entry.kind === 'video') {
    return (
      // biome-ignore lint/a11y/useMediaCaption: agents attach recordings without captions.
      <video
        ref={(element) => media(side, element)}
        className="cr-media"
        src={src}
        muted
        loop
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          onSize(video.videoWidth, video.videoHeight);
          onDuration(video.duration);
        }}
      />
    );
  }
  return (
    <img
      className="cr-media"
      src={src}
      alt={entry.filename}
      onLoad={(event) =>
        onSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
      }
    />
  );
}

type CompareRoundsProps = {
  rounds: Round[];
  modules: string[];
  marks: number[];
  onMark: (frame: number) => void;
};

// Two rounds on one clock: pin any round as A and B, lay them side by side, wipe between them,
// fade B over A or show only what changed; recordings play and step together, and frames can be
// marked for the feedback.
export function CompareRounds({ rounds, modules, marks, onMark }: CompareRoundsProps) {
  const last = rounds.at(-1)?.n ?? 1;
  const [pins, setPins] = useState<Pins>({ a: Math.max(1, last - 1), b: last });
  const [mode, setMode] = useState<CompareMode>('side');
  const [slide, setSlide] = useState(50);
  const [mix, setMix] = useState(50);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ratio, setRatio] = useState(16 / 9);
  const [duration, setDuration] = useState(0);
  const videos = useRef<{ a: HTMLVideoElement | null; b: HTMLVideoElement | null }>({
    a: null,
    b: null,
  });
  const a = rounds.find(({ n }) => n === pins.a);
  const b = rounds.find(({ n }) => n === pins.b);
  const module = sharedModule(a, b, modules);
  const fileA = module ? roundFiles(a, module)[0] : undefined;
  const fileB = module ? roundFiles(b, module)[0] : undefined;
  const clocked = fileA?.kind === 'video' && fileB?.kind === 'video';
  const count = Math.max(1, Math.round(duration * FPS));

  const media = useCallback((role: 'a' | 'b', element: HTMLVideoElement | null) => {
    videos.current[role] = element;
  }, []);
  const onDuration = useCallback((seconds: number) => {
    if (Number.isFinite(seconds)) setDuration((current) => Math.max(current, seconds));
  }, []);
  const onSize = useCallback((width: number, height: number) => {
    if (width > 0 && height > 0) setRatio(width / height);
  }, []);

  // Paused, both players sit on the clock's frame.
  useEffect(() => {
    if (playing) return;
    for (const video of [videos.current.a, videos.current.b]) {
      if (video) video.currentTime = Math.min(timeOf(frame), video.duration || Infinity);
    }
  }, [frame, playing]);

  // Playing, A leads and B follows it, frame by frame.
  useEffect(() => {
    if (!playing) return;
    const { a: lead, b: follow } = videos.current;
    if (!lead) return;
    void lead.play().catch(() => setPlaying(false));
    void follow?.play().catch(() => {});
    let raf = 0;
    const tick = () => {
      if (follow && Math.abs(follow.currentTime - lead.currentTime) > 1 / FPS) {
        follow.currentTime = lead.currentTime;
      }
      setFrame(frameAt(lead.currentTime) % count);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lead.pause();
      follow?.pause();
    };
  }, [playing, count]);

  if (!a || !b || !fileA || !fileB || rounds.length < 2) return null;
  const step = (delta: number) => {
    setPlaying(false);
    setFrame((current) => stepFrame(current, delta, count));
  };
  const marked = marks.includes(frame);
  return (
    <section className="cr" aria-label={t('compare.title')}>
      <div className="cr-tools">
        <fieldset className="cr-seg" aria-label={t('compare.mode')}>
          {COMPARE_MODES.map((each) => (
            <button
              key={each}
              type="button"
              className="cr-segb"
              aria-pressed={mode === each}
              onClick={() => setMode(each)}
            >
              {t(MODE_LABEL[each])}
            </button>
          ))}
        </fieldset>
        {mode === 'onion' ? (
          <label className="cr-mix">
            <span className="t-label">{t('compare.opacity')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={mix}
              onChange={(event) => setMix(Number(event.target.value))}
            />
            <span className="t-cap">{mix}%</span>
          </label>
        ) : null}
        <Button size="sm" variant="quiet" className="cr-swap" onClick={() => setPins(swap)}>
          {t('compare.swap')}
        </Button>
      </div>
      <fieldset className="cr-pins" aria-label={t('compare.pins')}>
        {rounds.map((round) => (
          <span key={round.n} className="cr-pin">
            <span className="t-cap">{t('rounds.round', { n: round.n })}</span>
            <button
              type="button"
              className="cr-pinb"
              aria-pressed={pins.a === round.n}
              aria-label={t('compare.pinA', { n: round.n })}
              onClick={() => setPins((current) => pin(current, 'a', round.n))}
            >
              A
            </button>
            <button
              type="button"
              className="cr-pinb"
              aria-pressed={pins.b === round.n}
              aria-label={t('compare.pinB', { n: round.n })}
              onClick={() => setPins((current) => pin(current, 'b', round.n))}
            >
              B
            </button>
          </span>
        ))}
      </fieldset>
      <div
        className="cr-stage"
        data-mode={mode}
        style={
          { '--ratio': String(ratio), '--slide': `${slide}%`, '--mix': mix / 100 } as CSSProperties
        }
      >
        <div className="cr-layer" data-role="a">
          <Layer
            key={`a:${fileA.id}`}
            entry={fileA}
            side="a"
            media={media}
            onSize={onSize}
            onDuration={onDuration}
          />
          <span className="cr-tag">{t('compare.tagA', { n: a.n })}</span>
        </div>
        <div className="cr-layer" data-role="b">
          <Layer
            key={`b:${fileB.id}`}
            entry={fileB}
            side="b"
            media={media}
            onSize={onSize}
            onDuration={onDuration}
          />
          <span className="cr-tag" data-side="b">
            {t('compare.tagB', { n: b.n })}
          </span>
        </div>
        {mode === 'slider' ? (
          <>
            <i className="cr-handle" aria-hidden="true" />
            <input
              className="cr-wipe"
              type="range"
              min={0}
              max={100}
              value={slide}
              aria-label={t('compare.wipe')}
              onChange={(event) => setSlide(Number(event.target.value))}
            />
          </>
        ) : null}
        {mode === 'difference' ? (
          <span className="cr-tag cr-legend">{t('compare.legend')}</span>
        ) : null}
      </div>
      {clocked ? (
        <div className="cr-clock">
          <Button
            size="sm"
            icon
            aria-label={playing ? t('compare.pause') : t('compare.play')}
            onClick={() => setPlaying((current) => !current)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                className="cr-play"
                d={playing ? 'M5 3.5 V12.5 M11 3.5 V12.5' : 'M5 3 L13 8 L5 13 Z'}
              />
            </svg>
          </Button>
          <span className="cr-time">
            <span className="t-id">
              {frameLabel(frame)} / {count}
            </span>
            <span className="t-cap">
              {timeOf(frame).toFixed(2)} s · {FPS} fps
            </span>
          </span>
          <span className="cr-track">
            {marks.map((mark) => (
              <i
                key={mark}
                className="cr-mark"
                style={{ left: `${((mark + 0.5) / count) * 100}%` }}
              />
            ))}
            <input
              type="range"
              min={0}
              max={count - 1}
              value={frame}
              aria-label={t('compare.frame')}
              onChange={(event) => {
                setPlaying(false);
                setFrame(Number(event.target.value));
              }}
            />
          </span>
          <Button size="sm" variant="quiet" onClick={() => step(-1)}>
            {t('compare.back')}
          </Button>
          <Button size="sm" variant="quiet" onClick={() => step(1)}>
            {t('compare.forward')}
          </Button>
          <Button size="sm" aria-pressed={marked} onClick={() => onMark(frame)}>
            {marked ? t('compare.unmark') : t('compare.mark')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
