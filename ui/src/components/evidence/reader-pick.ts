import { t } from '../../i18n/i18n.ts';
import type { Evidence } from '../../types.ts';
import { fileViewOf } from './file-view.ts';

// The event a note's cite sends to open the reader at its line or node: { evidence, pick }.
export const READ_AT = 'otea:read-at';

// What the person picked in the reader to anchor a note to: a line of a text (its number when the
// viewer numbers it, its text as seen) or a node of a diagram, by its label.
export type ReaderPick = { line?: number; quote?: string; node?: string };

// What a note can be on inside a file, picked in the reader: a line of what reads as numbered lines
// (a diff, a log, code or plain text), a node of a diagram; null when the file is read whole.
export function pickableOn(
  evidence: Pick<Evidence, 'kind' | 'filename' | 'contentType'>,
): 'line' | 'node' | null {
  if (evidence.kind === 'diff' || evidence.kind === 'log') return 'line';
  if (evidence.kind === 'diagram') return 'node';
  if (evidence.kind === 'file' && fileViewOf(evidence) === 'text') return 'line';
  return null;
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

// The element of an anchor in the reader's viewer, to light it when a note's cite opens the reader.
export function findPick(root: ParentNode, pick: ReaderPick): HTMLElement | null {
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
