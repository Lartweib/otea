import { describe, expect, it } from 'vitest';
import { defaultLayout, type Layout, type LayoutEntry, readLayout } from './modules.ts';
import { evidenceModules, groupEvidence, holderOf, placeEvidence } from './placement.ts';

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

  it('finds none in a layout without evidence modules', () => {
    expect(evidenceModules(defaultLayout(FIELDS))).toEqual([]);
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

  it('honours accepts by extension', () => {
    expect(place(BUG, 'shot.PNG', { role: 'before' })).toEqual({
      module: 'images',
      role: 'before',
    });
    refused(
      () => place(BUG, 'shot.jpg', { role: 'before' }),
      'evidence_not_accepted',
      `${SUBJECT} does not take shot.jpg. It takes: "images" (images, compare): png, gif; "log" (log): log`,
    );
  });

  it('refuses a kind no module accepts, listing what the type takes', () => {
    refused(
      () => place(IMPR, 'notes.zip'),
      'evidence_not_accepted',
      `${SUBJECT} does not take notes.zip. It takes: "screens" (images, gallery): image; "diff" (diff): diff; "mockup" (images): image; "recording" (recording): video`,
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

  it('needs a before or an after for a compare module', () => {
    expect(place(BUG, 'a.gif', { role: 'after' })).toEqual({ module: 'images', role: 'after' });
    for (const role of [undefined, 'single']) {
      refused(
        () => place(BUG, 'a.gif', role ? { role } : {}),
        'invalid_role',
        '"images" (images, compare) compares a before and an after: pass --role before or --role after',
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
  it('keeps the module evidence was attached to', () => {
    expect(holderOf(IMPR, { module: 'mockup', filename: 'a.png' })).toBe('mockup');
  });

  it('falls back to the first module accepting the file when none was recorded or it is gone', () => {
    expect(holderOf(IMPR, { module: null, filename: 'a.png' })).toBe('screens');
    expect(holderOf(IMPR, { module: 'shots', filename: 'a.png' })).toBe('screens');
    expect(holderOf(IMPR, { module: 'diff', filename: 'a.png' })).toBe('screens');
  });

  it('finds no holder for a file no module accepts', () => {
    expect(holderOf(BUG, { module: null, filename: 'a.mp4' })).toBeNull();
    expect(holderOf(defaultLayout(FIELDS), { module: null, filename: 'a.png' })).toBeNull();
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
