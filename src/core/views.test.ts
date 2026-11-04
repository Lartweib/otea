import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePreset } from './preset.ts';
import { readSamples } from './samples.ts';
import { MIXED_YAML, tasksPreset } from './testing.ts';
import { draftCollectionView, itemMoves, sampleItem, sampleItemView, typeViews } from './views.ts';

const desk = { actor: { kind: 'human', name: 'you' }, channel: 'ui' } as const;

const NOW = '2026-11-04T12:00:00.000Z';

const official = (name: string) => {
  const dir = new URL(`../../presets/${name}/`, import.meta.url);
  const preset = parsePreset(readFileSync(new URL('preset.yaml', dir), 'utf8'));
  const samples = readSamples(readFileSync(new URL('samples.yaml', dir), 'utf8'), preset, [
    'wall-slide-before.png',
    'wall-slide-after.png',
  ]);
  return { preset, samples: samples.samples };
};

describe('typeViews', () => {
  it('gives each type its fields in order, its states, layout and gates', () => {
    const [bug, impr] = typeViews(parsePreset(MIXED_YAML).types);

    expect(bug).toMatchObject({
      name: 'bug',
      label: 'Bug',
      initial: 'reported',
      fields: [
        { name: 'title', module: 'text', required: 'create' },
        { name: 'area', module: 'text' },
        { name: 'severity', module: 'severity', required: 'create' },
      ],
    });
    expect(impr).toMatchObject({ name: 'impr', initial: 'idea', incomplete: 'draft' });
    expect(bug).not.toHaveProperty('gates');
  });
});

describe('itemMoves', () => {
  it('offers the moves the performer may make, what chat may relay, and what is missing', () => {
    const [task] = tasksPreset.types;
    if (!task) throw new Error('tasks has a type');

    expect(itemMoves(task, 'review', {}, desk)).toEqual({
      transitions: [
        { to: 'done', by: 'human-ui', reasonRequired: false, turn: 'none', closes: 'done' },
        { to: 'todo', by: 'human-ui', reasonRequired: true, turn: 'agent' },
        { to: 'discarded', by: 'human', reasonRequired: true, turn: 'none', closes: 'discarded' },
      ],
      relayable: [
        { to: 'discarded', by: 'human', reasonRequired: true, turn: 'none', closes: 'discarded' },
      ],
      missing: ['description'],
    });
  });
});

describe('sampleItemView', () => {
  it('draws a sample as the server draws an item: turn, moves, events, evidence and links', () => {
    const { preset, samples } = official('bug-triage');
    const sample = samples.find(({ id }) => id === 'BUGS-1');
    if (!sample) throw new Error('bug-triage ships BUGS-1');

    const view = sampleItemView(preset, sample, { collection: 'bugs', now: NOW, performer: desk });

    expect(view).toMatchObject({
      id: 'BUGS-1',
      collection: 'bugs',
      seq: 1,
      type: 'bug',
      title: 'Wall-slide jump drops the buffered input',
      state: 'reported',
      turn: 'human',
      presetVersion: preset.version,
      lease: null,
      createdAt: '2026-11-04T11:58:00.000Z',
      createdBy: { kind: 'agent', name: 'claude-a' },
      events: [
        {
          id: 1,
          itemId: 'BUGS-1',
          type: 'created',
          actor: { kind: 'agent', name: 'claude-a' },
          at: '2026-11-04T11:58:00.000Z',
          data: { state: 'reported' },
        },
      ],
      missing: [],
      relations: [
        {
          kind: 'blocks',
          id: 'WORK-2',
          collection: 'work',
          type: 'task',
          title: 'Coyote time on moving platforms',
          state: 'todo',
          turn: 'agent',
          lease: null,
        },
      ],
    });
    expect(view.fields).toMatchObject({ severity: 'high', category: 'gameplay' });
    expect(view.transitions.map(({ to }) => to)).toContain('accepted');
    expect(view.evidence).toEqual([
      expect.objectContaining({
        id: 1,
        itemId: 'BUGS-1',
        role: 'before',
        kind: 'image',
        filename: 'wall-slide-before.png',
        contentType: 'image/png',
        caption: 'The press lands on the floor frame',
        module: null,
      }),
      expect.objectContaining({ id: 2, role: 'after', filename: 'wall-slide-after.png' }),
    ]);
  });

  it('reads the turn of a related item of the same preset, and sums up a parent children', () => {
    const { preset, samples } = official('change');
    const change = samples.find(({ type }) => type === 'change');
    if (!change) throw new Error('change ships a change');

    const view = sampleItemView(preset, change, { collection: 'changes', now: NOW });

    expect(view.relations.map(({ turn }) => turn)).toEqual(['human', 'agent']);
    expect(view.children).toEqual({ total: 2, open: 2, done: 0, discarded: 0 });
    // Without a performer, the desk's browser: every move a human may make in the web UI.
    expect(view.transitions.map(({ to }) => to)).toEqual(['verify', 'discarded']);
  });

  it('gives a sample without history its creation now, by you', () => {
    const preset = parsePreset(MIXED_YAML);
    const sample = {
      type: 'bug',
      id: 'X',
      title: 'A bug',
      state: 'fixed',
      fields: {},
      evidence: [],
      relations: [],
      history: [],
    };

    expect(sampleItem(preset, sample, { collection: 'work', now: NOW })).toMatchObject({
      seq: 1,
      turn: 'none',
      closes: 'done',
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: { kind: 'human', name: 'you' },
    });
  });
});

describe('draftCollectionView', () => {
  it('draws a collection of the draft preset, with its icon unless given its own', () => {
    expect(draftCollectionView(tasksPreset, { name: 'work' })).toEqual({
      name: 'work',
      prefix: 'WORK',
      preset: 'tasks',
      icon: 'checklist',
      types: typeViews(tasksPreset.types),
      view: tasksPreset.view,
    });
  });
});
