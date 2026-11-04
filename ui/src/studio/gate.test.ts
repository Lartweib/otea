import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPreset } from '../../../src/core/preset.ts';
import { draftCollectionView } from '../../../src/core/views.ts';
import type { PresetView } from '../types.ts';
import { readBlueprintDraft } from './blueprint.ts';
import { rawOf } from './draft.ts';
import { copyName, gateOf, waitingDraft, waitStateFor } from './gate.ts';

const file = (preset: string) =>
  readFileSync(new URL(`../../../presets/${preset}/preset.yaml`, import.meta.url), 'utf8');

function view(name: string, origin: 'official' | 'project' = 'official'): PresetView {
  const reading = readPreset(file(name));
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  const { types } = draftCollectionView(reading.preset, { name });
  return { name, version: reading.preset.version, origin, types } as PresetView;
}

const BOARDS = [
  { name: 'work', preset: 'tasks' },
  { name: 'bugs', preset: 'bug-triage' },
];
const DRAFT = { boards: BOARDS, connections: ['bugs.bug blocks work.task'], playbook: null };

describe('the gate a link meets', () => {
  it('reads a blocks link into a type that waits for nothing, with the fix it offers', () => {
    const presets = [view('tasks'), view('bug-triage')];
    const [link] = readBlueprintDraft('product', DRAFT, presets).connections;
    if (!link) throw new Error('no link');

    expect(gateOf(link, 'product', DRAFT, presets)).toEqual({
      kind: 'nothing',
      fix: {
        board: 'work',
        preset: 'tasks',
        type: 'task',
        state: 'in_progress',
        copy: 'product-tasks',
      },
    });
  });

  it('reads one whose target waits, and one that is only a pointer', () => {
    const waiting = view('tasks');
    const task = waiting.types[0];
    const progress = task?.states.find(({ name }) => name === 'in_progress');
    if (progress) progress.requires = ['blockers_closed'];
    const presets = [waiting, view('bug-triage', 'project')];
    const relates = { ...DRAFT, connections: ['bugs.bug relates work.task'] };
    const [blocks] = readBlueprintDraft('product', DRAFT, presets).connections;
    const [pointer] = readBlueprintDraft('product', relates, presets).connections;
    if (!blocks || !pointer) throw new Error('no link');

    expect(gateOf(blocks, 'product', DRAFT, presets)).toEqual({
      kind: 'waits',
      state: 'in_progress',
    });
    expect(gateOf(pointer, 'product', relates, presets)).toEqual({ kind: 'pointer' });
  });

  it('copies only an official preset, under a name no preset has', () => {
    expect(copyName('product', 'tasks', ['tasks', 'product-tasks'])).toBe('product-tasks-2');
  });

  it('waits in the first open state past the initial one', () => {
    expect(waitStateFor(view('tasks').types[0])).toBe('in_progress');
  });

  it('writes requires: [blockers_closed] into that state of the draft', () => {
    const yaml = waitingDraft(file('tasks'), 'task', 'in_progress');

    expect(rawOf(yaml).workflow?.states?.in_progress?.requires).toEqual(['blockers_closed']);
  });
});
