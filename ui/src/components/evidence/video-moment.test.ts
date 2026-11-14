import { describe, expect, it } from 'vitest';
import { noteAnchor, SEEK_EVENT, seekVideo, videoMoment, videoSelector } from './video-moment.ts';

// A note on a recording keeps the moment the person was at in it, and its timestamp in the thread
// takes the recording back there. Both find the recording on the page by the evidence id it shows:
// its player, or its strip of frames (the moment of the frame picked, if one was).

type FakeVideo = { tagName: 'VIDEO'; currentTime: number; played: { length: number } };
type FakeFrames = {
  tagName: 'SECTION';
  dataset: { evAt?: string };
  sent: Event[];
  dispatchEvent(event: Event): boolean;
};

const page = (shown: Record<number, FakeVideo | FakeFrames>) => ({
  querySelector(selector: string) {
    const id = Number(/data-ev-video="(\d+)"/.exec(selector)?.[1]);
    return (shown[id] ?? null) as unknown as Element | null;
  },
});

const video = (currentTime: number, played = 1): FakeVideo => ({
  tagName: 'VIDEO',
  currentTime,
  played: { length: played },
});

const frames = (evAt?: string): FakeFrames => ({
  tagName: 'SECTION',
  dataset: evAt === undefined ? {} : { evAt },
  sent: [],
  dispatchEvent(event) {
    this.sent.push(event);
    return true;
  },
});

describe('the moment in a recording', () => {
  it('is where the person is in the player, to a tenth of a second', () => {
    expect(videoMoment(4, page({ 4: video(62.437) }))).toBe(62.4);
  });

  it('is none for a player never played nor moved, or one not on the page', () => {
    expect(videoMoment(4, page({ 4: video(0, 0) }))).toBeUndefined();
    expect(videoMoment(5, page({ 4: video(3) }))).toBeUndefined();
  });

  it('is the start when the person played it and went back there', () => {
    expect(videoMoment(4, page({ 4: video(0, 1) }))).toBe(0);
  });

  it('is the frame picked in the strip of frames, none before one is picked', () => {
    expect(videoMoment(4, page({ 4: frames('3.1875') }))).toBe(3.2);
    expect(videoMoment(4, page({ 4: frames() }))).toBeUndefined();
  });

  it('finds the recording by the evidence it shows', () => {
    expect(videoSelector(12)).toBe('[data-ev-video="12"]');
  });
});

describe('the anchor a note is sent with', () => {
  it('carries the moment when the piece is a recording on the page', () => {
    expect(noteAnchor(4, page({ 4: video(2.44) }))).toEqual({ evidence: 4, seconds: 2.4 });
  });

  it('is the piece alone otherwise, and none without a piece', () => {
    expect(noteAnchor(5, page({}))).toEqual({ evidence: 5 });
    expect(noteAnchor(null, page({}))).toBeUndefined();
  });
});

describe('seeking from a note', () => {
  it('moves the player to the moment the note was on', () => {
    const v = video(1);
    expect(seekVideo(4, 62.4, page({ 4: v }))).toBe(true);
    expect(v.currentTime).toBe(62.4);
  });

  it('asks a strip of frames to play from that moment', () => {
    const f = frames();
    expect(seekVideo(4, 62.4, page({ 4: f }))).toBe(true);
    expect(f.sent.map((e) => [e.type, (e as CustomEvent).detail])).toEqual([[SEEK_EVENT, 62.4]]);
  });

  it('says so when the recording is not on the page', () => {
    expect(seekVideo(4, 2, page({}))).toBe(false);
  });
});
