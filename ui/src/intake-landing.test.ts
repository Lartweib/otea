import { describe, expect, it } from 'vitest';
import { landingNote, landingOf, nextId } from './intake.ts';
import type { FieldView, Layout, TypeView } from './types.ts';

const LAYOUT: Layout = {
  header: [],
  evidence: [],
  body: [],
  side: [],
  row: [],
  phone: [],
  intake: [],
};
const title: FieldView = { name: 'title', module: 'text', required: 'create' };
const steps: FieldView = { name: 'steps', module: 'markdown', required: 'complete' };

const bug: TypeView = {
  name: 'bug',
  label: 'Bug',
  initial: 'reported',
  incomplete: 'incomplete',
  states: [
    { name: 'reported', turn: 'human' },
    { name: 'incomplete', turn: 'agent' },
  ],
  fields: [title, steps],
  layout: LAYOUT,
};

describe('where a new item lands', () => {
  it('is a draft until it can be created', () => {
    const landing = landingOf(bug, { title: '', steps: '' });

    expect(landing).toMatchObject({ ready: false, kind: 'incomplete', missing: ['title'] });
    expect(landingNote(landing)).toBe('draft · Title to create');
  });

  it('lands on the lane of the state it starts in', () => {
    const complete = landingOf(bug, { title: 'Ledge', steps: 'Jump' });
    const incomplete = landingOf(bug, { title: 'Ledge', steps: '' });

    expect(complete).toMatchObject({ ready: true, state: 'reported', turn: 'human', kind: 'you' });
    expect(landingNote(complete)).toBe('on your lane, reported');
    expect(incomplete).toMatchObject({ state: 'incomplete', turn: 'agent', kind: 'incomplete' });
    expect(landingNote(incomplete)).toBe('on the agent lane, incomplete');
  });

  it('guesses the next id of the collection', () => {
    expect(nextId('BUGS', ['BUGS-1', 'BUGS-18', 'TASKS-40', 'BUGS-x'])).toBe('BUGS-19');
    expect(nextId('BUGS', [])).toBe('BUGS-1');
  });
});
