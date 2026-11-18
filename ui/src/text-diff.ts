// What changed in a text from one version to the next, read the way a person reads prose: by
// paragraph, and inside a paragraph that changed, by word. Once more than a third of the words
// changed, word marks are noise: the text reads paragraph by paragraph, words a toggle away.
export type WordPiece = { op: 'same' | 'del' | 'ins'; text: string };

export type TextBlock =
  | { kind: 'same'; text: string }
  | { kind: 'added'; text: string }
  | { kind: 'removed'; text: string }
  | { kind: 'changed'; before: string; after: string; words: WordPiece[] };

export type TextDiffMode = 'words' | 'paragraphs';

export type TextDiff = {
  blocks: TextBlock[];
  // The share of words removed or added, over both versions' words (0 to 1).
  changedShare: number;
  mode: TextDiffMode;
};

type Op<T> = { op: 'same' | 'del' | 'ins'; value: T };

// The longest common subsequence of two lists, as the edits that turn `a` into `b`; removals come
// before additions at the same place.
function edits<T>(a: readonly T[], b: readonly T[]): Op<T>[] {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  const out: Op<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', value: a[i] as T });
      i++;
      j++;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      out.push({ op: 'del', value: a[i++] as T });
    } else out.push({ op: 'ins', value: b[j++] as T });
  }
  while (i < n) out.push({ op: 'del', value: a[i++] as T });
  while (j < m) out.push({ op: 'ins', value: b[j++] as T });
  return out;
}

const paragraphsOf = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

const tokensOf = (text: string) => text.match(/\s+|[^\s]+/g) ?? [];

const wordCount = (text: string) => text.match(/[^\s]+/g)?.length ?? 0;

// One paragraph against its new version, word by word; neighbours of one kind joined. A run of
// changes kept apart only by spaces reads as one change: what went, then what came (DR3-2), never
// «gato perro negro blanco» word by word.
function wordPieces(before: string, after: string): WordPiece[] {
  const ops = edits(tokensOf(before), tokensOf(after));
  const pieces: WordPiece[] = [];
  const push = (op: WordPiece['op'], text: string) => {
    if (text === '') return;
    const last = pieces.at(-1);
    if (last && last.op === op) last.text += text;
    else pieces.push({ op, text });
  };
  let at = 0;
  while (at < ops.length) {
    const first = ops[at] as Op<string>;
    if (first.op === 'same') {
      push('same', first.value);
      at++;
      continue;
    }
    // The run: changes, and the blank stretches between them that both versions keep.
    let end = at;
    let del = '';
    let ins = '';
    while (end < ops.length) {
      const one = ops[end] as Op<string>;
      if (one.op === 'del') del += one.value;
      else if (one.op === 'ins') ins += one.value;
      else {
        const next = ops[end + 1];
        if (!/^\s+$/.test(one.value) || !next || next.op === 'same') break;
        del += one.value;
        ins += one.value;
      }
      end++;
    }
    push('del', del);
    push('ins', ins);
    at = end;
  }
  return pieces;
}

export function diffText(before: string, after: string, mode?: TextDiffMode): TextDiff {
  const blocks: TextBlock[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  let changedWords = 0;
  const flush = () => {
    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < pairs; k++) {
      const words = wordPieces(removed[k] ?? '', added[k] ?? '');
      for (const piece of words) if (piece.op !== 'same') changedWords += wordCount(piece.text);
      blocks.push({ kind: 'changed', before: removed[k] ?? '', after: added[k] ?? '', words });
    }
    for (const text of removed.slice(pairs)) {
      changedWords += wordCount(text);
      blocks.push({ kind: 'removed', text });
    }
    for (const text of added.slice(pairs)) {
      changedWords += wordCount(text);
      blocks.push({ kind: 'added', text });
    }
    removed = [];
    added = [];
  };
  for (const { op, value } of edits(paragraphsOf(before), paragraphsOf(after))) {
    if (op === 'same') {
      flush();
      blocks.push({ kind: 'same', text: value });
    } else if (op === 'del') removed.push(value);
    else added.push(value);
  }
  flush();
  const total = wordCount(before) + wordCount(after);
  const changedShare = total === 0 ? 0 : changedWords / total;
  return { blocks, changedShare, mode: mode ?? (changedShare > 1 / 3 ? 'paragraphs' : 'words') };
}

// A piece of Markdown as words, its marks dropped: a heading's #, a quote's >, a list's bullet or
// number at a line's start, and emphasis and code marks anywhere (DR3-2).
export function plainMarkdown(text: string): string {
  return text
    .replace(/(^|\n)[ \t]*(#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)/g, '$1')
    .replace(/(\*\*|__|`)/g, '');
}
