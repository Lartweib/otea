import { type KeyboardEvent, useEffect, useState } from 'react';
import { evidenceFileUrl } from '../../api.ts';
import { Button } from '../../kit/index.ts';
import type { Evidence } from '../../types.ts';
import { stepWithArrows } from './arrows.ts';
import { FileMeta } from './FileMeta.tsx';

// The browser's own player, with its controls. Nothing plays until asked.
export function VideoPlayer({ evidence }: { evidence: Evidence }) {
  return (
    <figure className="ev-figure">
      <div className="ev-stage ev-video well">
        {/* biome-ignore lint/a11y/useMediaCaption: agents attach screen recordings without captions. */}
        <video
          className="ev-media"
          src={evidenceFileUrl(evidence.id)}
          controls
          preload="metadata"
          playsInline
        />
      </div>
      <figcaption>
        <FileMeta evidence={evidence} />
      </figcaption>
    </figure>
  );
}

const FRAME_COUNT = 8;
const FRAME_WIDTH = 480;
const WAIT_MS = 8000;

type Frame = { time: number; src: string };

type Frames = { status: 'reading' } | { status: 'ready'; frames: Frame[] } | { status: 'failed' };

function once(video: HTMLVideoElement, event: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error(`no ${event}`)), WAIT_MS);
    const done = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener(event, ok);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
      if (error) reject(error);
      else resolve();
    };
    const ok = () => done();
    const failed = () => done(new Error('unreadable video'));
    const aborted = () => done(new Error('aborted'));
    video.addEventListener(event, ok);
    video.addEventListener('error', failed);
    signal.addEventListener('abort', aborted);
  });
}

// Reads FRAME_COUNT frames spread over the video, by seeking a detached player and drawing it.
async function readFrames(url: string, signal: AbortSignal): Promise<Frame[]> {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  video.src = url;
  try {
    await once(video, 'loadeddata', signal);
    const { duration, videoWidth, videoHeight } = video;
    if (!Number.isFinite(duration) || duration <= 0 || videoWidth === 0) {
      throw new Error('no frames');
    }
    const width = Math.min(FRAME_WIDTH, videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((width * videoHeight) / videoWidth);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    const frames: Frame[] = [];
    for (let index = 0; index < FRAME_COUNT; index += 1) {
      const time = (duration * (index + 0.5)) / FRAME_COUNT;
      const seeked = once(video, 'seeked', signal);
      video.currentTime = time;
      await seeked;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ time, src: canvas.toDataURL('image/jpeg', 0.82) });
    }
    return frames;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

function useFrames(url: string): Frames {
  const [frames, setFrames] = useState<Frames>({ status: 'reading' });
  useEffect(() => {
    const controller = new AbortController();
    setFrames({ status: 'reading' });
    readFrames(url, controller.signal).then(
      (read) => setFrames({ status: 'ready', frames: read }),
      () => {
        if (!controller.signal.aborted) setFrames({ status: 'failed' });
      },
    );
    return () => controller.abort();
  }, [url]);
  return frames;
}

function seconds(time: number): string {
  return `${time.toFixed(1)} s`;
}

// The recording as a strip of frames to read at a glance; one is shown large. Left and right step
// through them. A file the browser cannot read frames from plays in the player instead.
export function VideoFrames({ evidence }: { evidence: Evidence }) {
  const frames = useFrames(evidenceFileUrl(evidence.id));
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  if (frames.status === 'failed' || playing) {
    return (
      <div className="ev-frames">
        {playing ? (
          <Button size="sm" className="ev-frames-switch" onClick={() => setPlaying(false)}>
            frames
          </Button>
        ) : (
          <p className="t-cap">No frames could be read from this file; it plays instead.</p>
        )}
        <VideoPlayer evidence={evidence} />
      </div>
    );
  }
  if (frames.status === 'reading') {
    return (
      <div className="ev-stage ev-reading well" aria-busy="true">
        <span className="t-cap">reading frames…</span>
      </div>
    );
  }
  const list = frames.frames;
  const current = list[Math.min(index, list.length - 1)];
  if (!current) return null;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) =>
    stepWithArrows(event, index, list.length, setIndex);
  return (
    <section
      className="ev-frames"
      aria-roledescription="frames"
      aria-label={evidence.filename}
      onKeyDown={onKeyDown}
    >
      <Button size="sm" className="ev-frames-switch" onClick={() => setPlaying(true)}>
        play
      </Button>
      <div className="ev-stage well">
        <img
          key={current.time}
          className="ev-img ev-set"
          src={current.src}
          alt={`Frame at ${seconds(current.time)}`}
        />
        <span className="ev-tag r" aria-live="polite">
          {seconds(current.time)}
        </span>
      </div>
      <ol className="ev-strip">
        {list.map((frame, at) => (
          <li key={frame.time}>
            <button
              type="button"
              className="ev-thumb well"
              aria-current={at === index ? 'true' : undefined}
              aria-label={`Frame at ${seconds(frame.time)}`}
              onClick={() => setIndex(at)}
            >
              <img src={frame.src} alt="" />
            </button>
            <span className="t-cap">{seconds(frame.time)}</span>
          </li>
        ))}
      </ol>
      <FileMeta evidence={evidence} />
    </section>
  );
}
