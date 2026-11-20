import { describe, expect, it } from 'vitest';
import { defaultLayout, type Layout, type LayoutEntry, readLayout } from './modules.ts';
import {
  evidenceModules,
  groupEvidence,
  holderOf,
  placeEvidence,
  readsAsDiff,
} from './placement.ts';

const FIELDS = { title: { module: 'text', required: 'create' } } as const;

function layoutOf(raw: Record<string, unknown>): Layout {
  const { layout, problems } = readLayout(raw, FIELDS, 'layout');
  expect(problems).toEqual([]);
  return layout;
}

const BUG = layoutOf({
  evidence: [
    { module: 'images', variant: 'compare', accepts: ['png', 'gif'], label: 'Before and after' },
    { module: 'log', required: true },
  ],
});

const IMPR = layoutOf({
  evidence: [{ module: 'images', id: 'screens', variant: 'gallery' }, { module: 'diff' }],
  side: [{ module: 'images', id: 'mockup' }, { module: 'recording' }],
});

const SUBJECT = 'BUGS-1 (bug)';

const ITEM = { id: 'BUGS-1', type: 'bug' };

const place = (layout: Layout, filename: string, more: { role?: string; module?: string } = {}) =>
  placeEvidence(layout, ITEM, { filename, ...more } as Parameters<typeof placeEvidence>[2]);

const refused = (run: () => unknown, code: string, message: string) => {
  expect(run).toThrow(expect.objectContaining({ code, message }));
};

describe('evidenceModules', () => {
  it('lists the evidence modules of a layout in slot order, with their ids', () => {
    expect(evidenceModules(IMPR).map(({ id }) => id)).toEqual([
      'screens',
      'diff',
      'mockup',
      'recording',
    ]);
  });
});

describe('placeEvidence', () => {
  it('takes any file, in any role, for a type that places no evidence module', () => {
    const layout = defaultLayout(FIELDS);

    expect(place(layout, 'notes.zip')).toEqual({ module: null, role: 'single' });
    expect(place(layout, 'a.png', { role: 'before' })).toEqual({ module: null, role: 'before' });
  });

  it('places a file in the only module that accepts its kind', () => {
    expect(place(BUG, 'run.log')).toEqual({ module: 'log', role: 'single' });
    expect(place(IMPR, 'fix.patch')).toEqual({ module: 'diff', role: 'single' });
    expect(place(IMPR, 'repro.webm')).toEqual({ module: 'recording', role: 'single' });
  });

  it('places a test report (JUnit XML, vitest or jest JSON) in a log module, as test output', () => {
    expect(place(BUG, 'junit.xml')).toEqual({ module: 'log', role: 'single' });
    expect(place(BUG, 'results.json')).toEqual({ module: 'log', role: 'single' });
    // A module that takes files still takes them; one that draws images never does.
    refused(
      () => place(IMPR, 'junit.xml'),
      'evidence_not_accepted',
      `${SUBJECT} does not take junit.xml. It takes: "screens" (images, gallery): image; "diff" (diff): diff; "mockup" (images): image; "recording" (recording): video`,
    );
  });

  it('honours accepts by extension', () => {
    expect(place(BUG, 'shot.PNG', { role: 'before' })).toEqual({
      module: 'images',
      role: 'before',
    });
    refused(
      () => place(BUG, 'shot.jpg', { role: 'before' }),
      'evidence_not_accepted',
      `${SUBJECT} does not take shot.jpg. It takes: "Before and after" (images, compare): png, gif; "log" (log): log`,
    );
  });

  it('asks which module when two accept the file', () => {
    refused(
      () => place(IMPR, 'home.png'),
      'module_required',
      'home.png fits more than one evidence module of BUGS-1 (bug): pass --module screens or --module mockup',
    );
    expect(place(IMPR, 'home.png', { module: 'mockup' })).toEqual({
      module: 'mockup',
      role: 'single',
    });
  });

  it('takes --role before or after as naming the one compare among several that fit', () => {
    const both = layoutOf({
      evidence: [
        { module: 'images', id: 'shots', variant: 'gallery' },
        { module: 'images', id: 'fix', variant: 'compare' },
      ],
    });
    expect(place(both, 'home.png', { role: 'before' })).toEqual({ module: 'fix', role: 'before' });
    refused(
      () => place(both, 'home.png'),
      'module_required',
      'home.png fits more than one evidence module of BUGS-1 (bug): pass --module shots or --module fix',
    );
  });

  it('refuses a module the type does not place', () => {
    refused(
      () => place(IMPR, 'home.png', { module: 'shots' }),
      'not_found',
      `${SUBJECT} has no evidence module "shots" (modules: screens, diff, mockup, recording)`,
    );
    refused(
      () => place(defaultLayout(FIELDS), 'home.png', { module: 'shots' }),
      'not_found',
      `${SUBJECT} has no evidence module "shots" (it places none)`,
    );
  });

  it('refuses a module that does not accept the file', () => {
    refused(
      () => place(IMPR, 'home.png', { module: 'diff' }),
      'evidence_not_accepted',
      '"diff" (diff) takes diff, not home.png',
    );
  });

  // P8-R3-5: a diff saved as .txt went to the log part, and the Diff part refused it with no way out.
  it('tells how to name a text file for a module that takes diffs', () => {
    refused(
      () => place(IMPR, 'fix.txt', { module: 'diff' }),
      'evidence_not_accepted',
      '"diff" (diff) takes diff, not fix.txt: a diff is known by its extension, so save it as fix.diff (or .patch) and attach that',
    );
  });

  it('needs a before or an after for a compare module', () => {
    expect(place(BUG, 'a.gif', { role: 'after' })).toEqual({ module: 'images', role: 'after' });
    for (const role of [undefined, 'single']) {
      refused(
        () => place(BUG, 'a.gif', role ? { role } : {}),
        'invalid_role',
        '"Before and after" (images, compare) compares a before and an after: pass --role before or --role after',
      );
    }
  });

  it('refuses a before or an after in a module that holds single files', () => {
    refused(
      () => place(IMPR, 'home.png', { module: 'screens', role: 'before' }),
      'invalid_role',
      '"screens" (images, gallery) holds single files, not a before and an after: drop --role before',
    );
  });
});

describe('holderOf', () => {
  // A file falls back to the first module accepting it when none was recorded or that one is gone.
  it.each([
    ['keeps the module evidence was attached to', IMPR, 'mockup', 'a.png', 'mockup'],
    ['falls back when no module was recorded', IMPR, null, 'a.png', 'screens'],
    ['falls back when the module is gone', IMPR, 'shots', 'a.png', 'screens'],
    ['falls back when the module no longer accepts the file', IMPR, 'diff', 'a.png', 'screens'],
    ['finds no holder when no module accepts the file', BUG, null, 'a.mp4', null],
    [
      'finds no holder in a layout without evidence modules',
      defaultLayout(FIELDS),
      null,
      'a.png',
      null,
    ],
  ])('%s', (_, layout, module, filename, holder) => {
    expect(holderOf(layout, { module, filename })).toBe(holder);
  });
});

describe('groupEvidence', () => {
  it('groups evidence under its module in layout order, the rest as other files', () => {
    const evidence = [
      { id: 1, module: 'log', filename: 'run.log' },
      { id: 2, module: null, filename: 'before.png' },
      { id: 3, module: null, filename: 'clip.mp4' },
    ];

    const { modules, others } = groupEvidence(BUG, evidence);

    const ids = (group: { module: LayoutEntry; evidence: { id: number }[] }) => [
      group.module.id,
      group.evidence.map(({ id }) => id),
    ];
    expect(modules.map(ids)).toEqual([
      ['images', [2]],
      ['log', [1]],
    ]);
    expect(others.map(({ id }) => id)).toEqual([3]);
  });
});

// A diff saved as text is told by its lines (P8-R3-5): git's header, or a file pair and a hunk.
describe('readsAsDiff', () => {
  it('reads git diff and diff -u output as a diff', () => {
    expect(readsAsDiff('diff --git a/x.ts b/x.ts\nindex 1..2\n')).toBe(true);
    expect(readsAsDiff('--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,3 @@\n x\n+y\n')).toBe(true);
    expect(readsAsDiff('--- a/x.ts\r\n+++ b/x.ts\r\n@@ -1 +1 @@\r\n')).toBe(true);
  });

  it('never reads a log that only draws a rule as one', () => {
    expect(readsAsDiff('ok 12 tests\n--- summary\n+++ 3 skipped\n')).toBe(false);
    expect(readsAsDiff('PASS src/a.test.ts\n')).toBe(false);
  });
});
