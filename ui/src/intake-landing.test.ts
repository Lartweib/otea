import { describe, expect, it } from 'vitest';
import { landingLook, landingNote, landingOf, ledeOf, nextId } from './intake.ts';
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

describe('the preview row (llega como)', () => {
  it('sits on your lane, yours, when the type starts on your turn', () => {
    const landing = landingOf(bug, { title: 'Ledge', steps: 'Jump' });
    expect(landingLook(landing)).toEqual({ lane: 'you', look: 'yours' });
  });

  it('waits on the agents lane, queued, when an agent starts it', () => {
    const landing = landingOf(bug, { title: 'Ledge', steps: '' });
    expect(landingLook(landing)).toEqual({ lane: 'ag', look: 'queued' });
  });

  it('is closed on the trunk when the type starts closed', () => {
    const closed: TypeView = {
      ...bug,
      states: [{ name: 'reported', turn: 'none', closes: 'done' }],
    };
    const landing = landingOf(closed, { title: 'Ledge', steps: 'Jump' });
    expect(landingLook(landing)).toEqual({ lane: 'none', look: 'done' });
  });
});

describe('the lede', () => {
  it('says the board, the parent, and who gets it in which step', () => {
    const landing = landingOf(bug, { title: 'Ledge', steps: 'Jump' });
    expect(ledeOf({ board: 'Errores', landing, step: 'Reported' })).toBe(
      'In Errores. It comes to you, in Reported.',
    );
    const agentSide = landingOf(bug, { title: 'Ledge', steps: '' });
    expect(
      ledeOf({ board: 'Errores', parent: 'ERR-1', landing: agentSide, step: 'Incomplete' }),
    ).toBe('In Errores, as a child of ERR-1. It goes to an agent, in Incomplete.');
    expect(
      ledeOf({ board: 'Repo tasks', parent: 'CHG-1', part: true, landing, step: 'Proposal' }),
    ).toBe('In Repo tasks, part of CHG-1. It comes to you, in Proposal.');
  });
});
