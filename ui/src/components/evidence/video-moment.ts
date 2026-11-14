// A note on a recording keeps the moment the person was at in it (when the note is sent), and the
// note's timestamp in the thread takes the recording back there. Both find the recording on the
// page by the evidence id it shows (data-ev-video): its player (VideoPlayer), or its strip of
// frames (VideoFrames), which keeps the moment of the frame picked in data-ev-at and answers a
// seek by playing from there.

type Finder = Pick<ParentNode, 'querySelector'>;

// What a strip of frames is sent to play from a moment; its detail is the seconds.
export const SEEK_EVENT = 'otea-seek';

export const videoSelector = (evidence: number) => `[data-ev-video="${evidence}"]`;

const shownOf = (evidence: number, root: Finder) =>
  root.querySelector(videoSelector(evidence)) as HTMLElement | null;

const isPlayer = (el: HTMLElement): el is HTMLVideoElement => el.tagName === 'VIDEO';

const tenth = (seconds: number) => Math.round(seconds * 10) / 10;

// Where the person is in the recording, to a tenth of a second; none when it is not on the page,
// its player was never played nor moved, or no frame was picked (its start then says nothing).
export function videoMoment(evidence: number, root: Finder = document): number | undefined {
  const shown = shownOf(evidence, root);
  if (!shown) return undefined;
  if (!isPlayer(shown)) {
    const at = Number(shown.dataset.evAt);
    return shown.dataset.evAt !== undefined && Number.isFinite(at) ? tenth(at) : undefined;
  }
  const at = shown.currentTime;
  if (!Number.isFinite(at) || at < 0 || (at === 0 && shown.played.length === 0)) return undefined;
  return tenth(at);
}

// The anchor a note is sent with: the piece picked, and on a recording the moment it is at.
export function noteAnchor(
  evidence: number | null,
  root: Finder = document,
): { evidence: number; seconds?: number } | undefined {
  if (evidence === null) return undefined;
  const seconds = videoMoment(evidence, root);
  return seconds === undefined ? { evidence } : { evidence, seconds };
}

// Takes the recording to a note's moment: its player seeks there, its strip of frames plays from
// there. False when the recording is not on the page.
export function seekVideo(evidence: number, seconds: number, root: Finder = document): boolean {
  const shown = shownOf(evidence, root);
  if (!shown) return false;
  if (isPlayer(shown)) shown.currentTime = seconds;
  else shown.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: seconds }));
  return true;
}
