import type { DiffLine, LogLine } from './evidence.ts';

// ---- diff side by side: the old file on the left, the new on the right ----

type Old = Extract<DiffLine, { kind: 'ctx' | 'del' }>;
type New = Extract<DiffLine, { kind: 'ctx' | 'add' }>;
type Note = Extract<DiffLine, { kind: 'note' }>;

export type SideRow = { left?: Old; right?: New; note?: Note };

// A hunk's lines as rows of two columns. An unchanged line sits on both sides; a run of removed
// lines faces the added lines that replace it, row by row, and the longer run's rest faces nothing.
export function sideBySide(lines: readonly DiffLine[]): SideRow[] {
  const rows: SideRow[] = [];
  let dels: Old[] = [];
  let adds: New[] = [];
  const flush = () => {
    for (let at = 0; at < Math.max(dels.length, adds.length); at += 1) {
      const row: SideRow = {};
      const left = dels[at];
      const right = adds[at];
      if (left) row.left = left;
      if (right) row.right = right;
      rows.push(row);
    }
    dels = [];
    adds = [];
  };
  for (const line of lines) {
    if (line.kind === 'del') {
      if (adds.length) flush();
      dels.push(line);
    } else if (line.kind === 'add') adds.push(line);
    else {
      flush();
      if (line.kind === 'note') rows.push({ note: line });
      else rows.push({ left: line, right: line });
    }
  }
  flush();
  return rows;
}

// ---- log: search, and the lines that report a failure ----

const FAILURE = [
  /\b[A-Z]?[a-z]*Error:/,
  /^\s*error\b/i,
  /\bERR!/,
  /^\s*FAIL(?:ED)?\b/,
  /[✗✖]/,
  /\[(?:error|fatal|err)\]/i,
  /^\s*Traceback\b/,
  /^\s*(?:panic|fatal)\b[:!]?/i,
  /\bException\b/,
  /\b(?:ERROR|FATAL|CRITICAL)\b/,
  /\blevel=(?:error|fatal)\b/i,
];

export function isErrorLine(text: string): boolean {
  return FAILURE.some((pattern) => pattern.test(text));
}

// The numbers of the lines holding the search, whatever its case.
export function logMatches(lines: readonly LogLine[], query: string): number[] {
  const words = query.trim().toLowerCase();
  if (!words) return [];
  return lines.filter(({ text }) => text.toLowerCase().includes(words)).map(({ number }) => number);
}
