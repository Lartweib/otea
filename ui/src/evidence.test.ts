import { describe, expect, it } from 'vitest';
import {
  comparePair,
  emptyText,
  evidenceOf,
  latestFirst,
  leftovers,
  logView,
  moduleTitle,
  nudgeSplit,
  parseDiff,
  splitAt,
  stepIndex,
} from './evidence.ts';
import type { Evidence, LayoutEntry, TypeView } from './types.ts';

let next = 0;
function evidence(filename: string, more: Partial<Evidence> = {}): Evidence {
  next += 1;
  return {
    id: next,
    itemId: 'BUGS-1',
    role: 'single',
    module: null,
    kind: 'image',
    filename,
    contentType: 'image/png',
    size: 10,
    sha256: 'abc',
    caption: null,
    createdAt: 't',
    actor: { kind: 'agent', name: 'claude' },
    channel: 'cli',
    ...more,
  };
}

const compare: LayoutEntry = { module: 'images', id: 'shots', variant: 'compare' };
const log: LayoutEntry = { module: 'log', id: 'log', required: true };
const onPhone: LayoutEntry = { module: 'diff', id: 'patch' };

const bug: TypeView = {
  name: 'bug',
  label: 'Bug',
  initial: 'open',
  states: [],
  fields: [],
  layout: {
    header: [],
    evidence: [compare],
    body: [],
    side: [log],
    row: [],
    phone: [onPhone],
    intake: [],
  },
};

describe('evidence by module', () => {
  const before = evidence('before.png', { module: 'shots', role: 'before' });
  const run = evidence('run.log', { module: 'log', kind: 'log' });
  const patch = evidence('fix.diff', { module: 'patch', kind: 'diff' });
  const loose = evidence('notes.zip', { kind: 'file' });
  const all = [before, run, patch, loose];

  it('gives a module the evidence the server placed in it', () => {
    expect(evidenceOf(all, compare)).toEqual([before]);
    expect(evidenceOf(all, log)).toEqual([run]);
  });

  it('leaves out of the modules what none draws: no module, or one the detail does not draw', () => {
    expect(leftovers(bug, all)).toEqual([patch, loose]);
  });

  it('leaves everything to the plain list for a type without modules, or an unknown type', () => {
    expect(leftovers({ ...bug, layout: { ...bug.layout, evidence: [], side: [] } }, all)).toEqual(
      all,
    );
    expect(leftovers(undefined, all)).toEqual(all);
  });

  it('orders a module newest first', () => {
    expect(latestFirst([before, run]).map(({ id }) => id)).toEqual([run.id, before.id]);
  });
});

describe('comparePair', () => {
  it('pairs the latest before with the latest after', () => {
    const b1 = evidence('b1.png', { role: 'before' });
    const a1 = evidence('a1.png', { role: 'after' });
    const b2 = evidence('b2.png', { role: 'before' });

    expect(comparePair([b1, a1, b2])).toEqual({ before: b2, after: a1 });
    expect(comparePair([b1])).toEqual({ before: b1, after: undefined });
  });
});

describe('module titles and empty states', () => {
  it('uses the label, else names the module by what it draws', () => {
    expect(moduleTitle({ ...compare, label: 'Repro' })).toBe('Repro');
    expect(moduleTitle(compare)).toBe('Before and after');
    expect(moduleTitle({ module: 'images', variant: 'gallery' })).toBe('Screenshots');
    expect(moduleTitle({ module: 'images' })).toBe('Screenshot');
    expect(moduleTitle({ module: 'recording' })).toBe('Recording');
    expect(moduleTitle(log)).toBe('Log');
  });

  it('says what the agent should attach', () => {
    expect(emptyText(compare)).toBe('No before/after yet');
    expect(emptyText({ module: 'images', variant: 'gallery' })).toBe('No screenshots yet');
    expect(emptyText({ module: 'diff' })).toBe('No diff yet');
    expect(emptyText({ module: 'recording' })).toBe('No recording yet');
  });
});

describe('stepIndex', () => {
  it('moves within the list and wraps around', () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});

describe('parseDiff', () => {
  const GIT = [
    'diff --git a/src/save.ts b/src/save.ts',
    'index 1a2b3c4..5d6e7f8 100644',
    '--- a/src/save.ts',
    '+++ b/src/save.ts',
    '@@ -10,4 +10,5 @@ export function save() {',
    '   const slot = pick();',
    '-  write(slot);',
    '+  await write(slot);',
    '+  verify(slot);',
    '   return slot;',
    '\\ No newline at end of file',
    'diff --git a/README.md b/README.md',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/README.md',
    '@@ -0,0 +1 @@',
    '+# Save',
    '',
  ].join('\n');

  it('reads files, hunks and line numbers from a git diff', () => {
    const [save, readme] = parseDiff(GIT);

    expect(save).toMatchObject({ path: 'src/save.ts', additions: 2, deletions: 1 });
    expect(save?.meta).toEqual(['index 1a2b3c4..5d6e7f8 100644']);
    expect(save?.hunks[0]?.header).toBe('@@ -10,4 +10,5 @@ export function save() {');
    expect(save?.hunks[0]?.lines).toEqual([
      { kind: 'ctx', old: 10, new: 10, text: '  const slot = pick();' },
      { kind: 'del', old: 11, text: '  write(slot);' },
      { kind: 'add', new: 11, text: '  await write(slot);' },
      { kind: 'add', new: 12, text: '  verify(slot);' },
      { kind: 'ctx', old: 12, new: 13, text: '  return slot;' },
      { kind: 'note', text: '\\ No newline at end of file' },
    ]);
    expect(readme).toMatchObject({ path: 'README.md', additions: 1, deletions: 0 });
    expect(readme?.hunks[0]?.lines).toEqual([{ kind: 'add', new: 1, text: '# Save' }]);
  });

  it('names a deleted file by its old path', () => {
    const [gone] = parseDiff('--- a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n');

    expect(gone).toMatchObject({ path: 'old.ts', deletions: 1 });
  });

  it('reads a plain unified diff and bare hunks', () => {
    expect(parseDiff('--- a.txt\t2026-01-01\n+++ b.txt\n@@ -1 +1 @@\n-a\n+b\n')[0]?.path).toBe(
      'b.txt',
    );
    expect(parseDiff('@@ -1 +1 @@\n-a\n+b\n')).toEqual([
      expect.objectContaining({ path: '', additions: 1, deletions: 1 }),
    ]);
  });

  it('finds no files in text that is not a diff', () => {
    expect(parseDiff('just some notes\n')).toEqual([]);
  });
});

describe('logView', () => {
  const lines = (count: number) =>
    Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');

  it('numbers every line of a short log and hides nothing', () => {
    expect(logView('a\nb\n', false)).toEqual({
      head: [
        { number: 1, text: 'a' },
        { number: 2, text: 'b' },
      ],
      tail: [],
      hidden: 0,
      total: 2,
    });
  });

  it('keeps the start and the end of a long log, hiding the middle until shown', () => {
    const view = logView(lines(500), false);

    expect(view.head).toHaveLength(60);
    expect(view.tail.map(({ number }) => number)).toEqual(
      Array.from({ length: 60 }, (_, index) => 441 + index),
    );
    expect(view.hidden).toBe(380);
    expect(logView(lines(500), true)).toMatchObject({ hidden: 0, total: 500 });
  });
});

describe('the compare divider', () => {
  it('follows the pointer inside the image, clamped to its edges', () => {
    expect(splitAt(150, 100, 200)).toBe(25);
    expect(splitAt(0, 100, 200)).toBe(0);
    expect(splitAt(900, 100, 200)).toBe(100);
    expect(splitAt(150, 100, 0)).toBe(50);
  });

  it('moves with the keys a slider takes', () => {
    expect(nudgeSplit(50, 'ArrowLeft', false)).toBe(48);
    expect(nudgeSplit(50, 'ArrowRight', true)).toBe(60);
    expect(nudgeSplit(99, 'ArrowUp', false)).toBe(100);
    expect(nudgeSplit(50, 'Home', false)).toBe(0);
    expect(nudgeSplit(50, 'End', false)).toBe(100);
    expect(nudgeSplit(50, 'Enter', false)).toBeUndefined();
  });
});
