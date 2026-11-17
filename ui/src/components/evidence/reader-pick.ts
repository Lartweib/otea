import { t } from '../../i18n/i18n.ts';
import type { Evidence } from '../../types.ts';
import { fileViewOf } from './file-view.ts';

// The event a note's cite sends to open the reader at its line or node: { evidence, pick }.
export const READ_AT = 'otea:read-at';

// What the person picked in the reader to anchor a note to: a line of a text (its number when the
// viewer numbers it, its text as seen), a node of a diagram, by its label, or a point (x, y) or a
// zone (x, y, w, h) of an image, in percent from its top left corner.
export type ReaderPick = {
  line?: number;
  quote?: string;
  node?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

// What a note can be on inside a file, picked in the reader: a line of what reads as numbered lines
// (a diff, a log, code or plain text), a node of a diagram, a spot of an image; null when the file
// is read whole.
export function pickableOn(
  evidence: Pick<Evidence, 'kind' | 'filename' | 'contentType'>,
): 'line' | 'node' | 'spot' | null {
  if (evidence.kind === 'image') return 'spot';
  if (evidence.kind === 'diff' || evidence.kind === 'log') return 'line';
  if (evidence.kind === 'diagram') return 'node';
  if (evidence.kind === 'file' && fileViewOf(evidence) === 'text') return 'line';
  return null;
}

// What the note box says a click does on the file shown: only what the file takes.
export function pickHint(
  evidence: Pick<Evidence, 'kind' | 'filename' | 'contentType'>,
  phone: boolean,
): string {
  const on = pickableOn(evidence);
  if (on === 'spot') return t(phone ? 'notes.pick.hintImageTouch' : 'notes.pick.hintImage');
  if (on === 'line') return t(phone ? 'notes.pick.hintLineTouch' : 'notes.pick.hintLine');
  if (on === 'node') return t(phone ? 'notes.pick.hintNodeTouch' : 'notes.pick.hintNode');
  return t('notes.pick.hintFile');
}

// What a click read from the viewer: a line's numbers (a diff has the old and the new), its text
// and the sign drawn before it; or a node's label.
export type PickSource = {
  line?: { number?: string; numbers: readonly string[]; text: string; sign: string };
  node?: string;
};

export function pickOf(source: PickSource): ReaderPick | null {
  if (source.line) {
    const { number, numbers, text, sign } = source.line;
    const shown = number ?? [...numbers].reverse().find((n) => n.trim() !== '');
    const line = shown === undefined ? Number.NaN : Number.parseInt(shown, 10);
    const quote = (sign && text.startsWith(sign) ? text.slice(sign.length) : text).trim();
    const pick: ReaderPick = {
      ...(Number.isInteger(line) && line > 0 ? { line } : {}),
      ...(quote ? { quote } : {}),
    };
    return Object.keys(pick).length ? pick : null;
  }
  const node = source.node?.trim();
  return node ? { node } : null;
}

// What the note will be on, in a few words.
export function pickWords(pick: ReaderPick | null): string {
  if (!pick) return t('notes.pick.file');
  if (pick.x !== undefined)
    return pick.w !== undefined ? t('notes.pick.zone') : t('notes.pick.point');
  if (pick.node !== undefined) return t('notes.pick.node', { node: pick.node });
  if (pick.line !== undefined) return t('notes.pick.line', { n: pick.line });
  return t('notes.pick.quote');
}

export function pickAnchor(
  evidence: number,
  pick: ReaderPick | null,
): { evidence: number } & ReaderPick {
  return { evidence, ...(pick ?? {}) };
}

// What a click in the reader's viewer picked, read from the page: the line or diagram node under it.
export function pickAt(target: EventTarget | null): { el: HTMLElement; pick: ReaderPick } | null {
  if (!(target instanceof Element)) return null;
  const line = target.closest<HTMLElement>('.ev-line');
  if (line && line.dataset.kind !== 'hunk') {
    const text = line.querySelector('.ev-text')?.textContent ?? '';
    const sign = line.querySelector('.ev-sign')?.textContent ?? '';
    const numbers = [...line.querySelectorAll('.ev-no')].map((n) => n.textContent ?? '');
    const pick = pickOf({
      line: { ...(line.dataset.line ? { number: line.dataset.line } : {}), numbers, text, sign },
    });
    return pick ? { el: line, pick } : null;
  }
  const node = target.closest<HTMLElement>('.dg-node');
  if (node) {
    const pick = pickOf({ node: node.textContent ?? '' });
    return pick ? { el: node, pick } : null;
  }
  return null;
}

// What a note's anchor was picked on inside its file, to open the reader there; null when the note
// is on the file whole (or a moment of a recording, which the player seeks).
export function pickOfAnchor(anchor: ReaderPick): ReaderPick | null {
  const pick: ReaderPick = {};
  for (const key of ['line', 'quote', 'node', 'x', 'y', 'w', 'h'] as const) {
    const value = anchor[key];
    if (value !== undefined) Object.assign(pick, { [key]: value });
  }
  return Object.keys(pick).length ? pick : null;
}

const tenth = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;

// A press on an image and where it was let go, in page coordinates, read against the image's box:
// a point where it was pressed, or (where zones are allowed) the zone dragged, once it spans more
// than a few pixels.
export function spotOf(
  box: { left: number; top: number; width: number; height: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
  zones: boolean,
): ReaderPick | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const px = (v: number) => ((v - box.left) / box.width) * 100;
  const py = (v: number) => ((v - box.top) / box.height) * 100;
  const dragged = Math.abs(to.x - from.x) > 6 || Math.abs(to.y - from.y) > 6;
  if (!zones || !dragged) {
    const x = px(from.x);
    const y = py(from.y);
    if (x < 0 || x > 100 || y < 0 || y > 100) return null;
    return { x: tenth(x), y: tenth(y) };
  }
  const x0 = tenth(Math.min(px(from.x), px(to.x)));
  const y0 = tenth(Math.min(py(from.y), py(to.y)));
  const x1 = tenth(Math.max(px(from.x), px(to.x)));
  const y1 = tenth(Math.max(py(from.y), py(to.y)));
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return null;
  return { x: x0, y: y0, w: tenth(x1 - x0), h: tenth(y1 - y0) };
}

// The element of an anchor in the reader's viewer, to light it when a note's cite opens the reader.
export function findPick(root: ParentNode, pick: ReaderPick): HTMLElement | null {
  // A spot of an image is drawn over it, not found in it.
  if (pick.x !== undefined) return null;
  if (pick.node !== undefined) {
    return (
      [...root.querySelectorAll<HTMLElement>('.dg-node')].find(
        (n) => n.textContent?.trim() === pick.node,
      ) ?? null
    );
  }
  return pickAtLine([...root.querySelectorAll<HTMLElement>('.ev-line')], pick) ?? null;
}

function pickAtLine(lines: HTMLElement[], pick: ReaderPick): HTMLElement | undefined {
  return lines.find((el) => {
    const read = pickAt(el)?.pick;
    if (!read) return false;
    if (pick.line !== undefined) {
      return read.line === pick.line && (pick.quote === undefined || read.quote === pick.quote);
    }
    return pick.quote !== undefined && read.quote === pick.quote;
  });
}

// Brings a picked line or node into view up or down only: a diff's long line would otherwise scroll
// its well sideways and cut the +/− signs off. Every box around it keeps its sideways scroll.
export function revealUpright(el: HTMLElement): void {
  const kept: [HTMLElement, number][] = [];
  for (let at = el.parentElement; at; at = at.parentElement) kept.push([at, at.scrollLeft]);
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  for (const [box, left] of kept) if (box.scrollLeft !== left) box.scrollLeft = left;
}
