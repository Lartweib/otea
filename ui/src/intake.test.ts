import { describe, expect, it } from 'vitest';
import { sequenceIds } from '../../src/core/board/ids.ts';
import { instantiate, requireTemplate } from '../../src/core/board/templates.ts';
import {
  canSubmit,
  fieldHint,
  fieldLabel,
  initialValues,
  intakeParts,
  landingOf,
  missingToCreate,
  payloadOf,
  startMessage,
  startOf,
} from './intake.ts';
import type { FieldView, Layout, TypeView } from './types.ts';

const title: FieldView = { name: 'title', module: 'text', required: 'create' };
const description: FieldView = { name: 'description', module: 'markdown', required: 'complete' };
const priority: FieldView = {
  name: 'priority',
  module: 'enum',
  values: ['low', 'medium', 'high'],
  default: 'medium',
};

const LAYOUT: Layout = {
  header: [],
  evidence: [],
  body: [],
  side: [],
  row: [],
  phone: [],
  intake: [],
};

const tasks: TypeView = {
  name: 'item',
  label: 'Item',
  initial: 'todo',
  states: [],
  incomplete: 'incomplete',
  fields: [title, description, priority],
  layout: LAYOUT,
};

const reviews: TypeView = {
  name: 'item',
  label: 'Item',
  initial: 'open',
  states: [],
  fields: [title],
  layout: LAYOUT,
};

describe('intake', () => {
  it('starts every field blank except those with a default', () => {
    expect(initialValues(tasks)).toEqual({ title: '', description: '', priority: 'medium' });
  });

  it('explains that a field required to complete can be left to an agent', () => {
    expect(fieldHint(description)).toBe('Optional now — if left empty, an agent will complete it');
    expect(fieldHint(title)).toBeUndefined();
    expect(fieldHint(priority)).toBeUndefined();
  });

  it.each([
    [{ title: '', description: '', priority: 'medium' }, ['title']],
    [{ title: '   ', description: 'D', priority: 'medium' }, ['title']],
    [{ title: 'Ship', description: '', priority: 'medium' }, []],
  ])('lists the fields required to create %j that are still blank', (values, missing) => {
    expect(missingToCreate(tasks, values)).toEqual(missing);
    expect(canSubmit(tasks, values)).toBe(missing.length === 0);
  });

  it('starts ready when every field required to complete is filled', () => {
    expect(startOf(tasks, { title: 'Ship', description: 'Now', priority: 'low' })).toEqual({
      state: 'todo',
      incomplete: false,
      missing: [],
    });
  });

  it('starts incomplete, with the agent, while a field required to complete is blank', () => {
    expect(startOf(tasks, { title: 'Ship', description: ' \n', priority: 'low' })).toEqual({
      state: 'incomplete',
      incomplete: true,
      missing: ['description'],
    });
  });

  it('starts in the initial state when the preset has nothing to complete', () => {
    expect(startOf(reviews, { title: '' })).toEqual({
      state: 'open',
      incomplete: false,
      missing: [],
    });
  });

  it('sends only the fields that are not blank', () => {
    expect(payloadOf({ title: 'Ship', description: '  ', priority: 'medium' })).toEqual({
      title: 'Ship',
      priority: 'medium',
    });
  });

  it.each([
    ['title', 'Title'],
    ['due_date', 'Due date'],
  ])('labels field %s as %s', (name, label) => {
    expect(fieldLabel(name)).toBe(label);
  });

  it('tells where the item will start before it is sent', () => {
    expect(startMessage({ state: 'todo', incomplete: false, missing: [] })).toBe(
      'Starts ready in todo.',
    );
    expect(
      startMessage({ state: 'incomplete', incomplete: true, missing: ['description', 'scope'] }),
    ).toBe('Starts in incomplete: an agent will complete description, scope first.');
  });
});

describe('the new item form, as compact as the mock', () => {
  const f = (name: string, module: string, required?: 'create' | 'complete') =>
    ({ field: { name, module, ...(required ? { required } : {}) }, at: name }) as never;

  it('shows the title, the description and the choices, and folds the long fields', () => {
    const slots = [
      f('title', 'text', 'create'),
      f('description', 'markdown', 'complete'),
      f('steps', 'markdown', 'complete'),
      f('severity', 'severity', 'complete'),
      f('category', 'enum'),
      f('area', 'text'),
      f('repo', 'text', 'create'),
    ];
    const { shown, more } = intakeParts(slots);
    const names = (xs: { field: { name: string } }[]) => xs.map((x) => x.field.name);
    expect(names(shown)).toEqual(['title', 'description', 'severity', 'category', 'repo']);
    expect(names(more)).toEqual(['steps', 'area']);
  });
});

// A board whose first step nobody reviews and an item already has everything for starts at the
// next step: the form says where it really lands, as Pendientes' «Lo hago yo» decides (P4-R2-12).
describe('where a new item lands on a board that skips its first step', () => {
  const def = instantiate(requireTemplate('todos'), 'es', {}, sequenceIds());
  const ref = (name: string) => Object.values(def.parts).find((p) => p.name === name)?.id ?? '';
  const step = (name: string) => def.steps.find((s) => s.name === name)?.id ?? '';
  const todos: TypeView = {
    ...reviews,
    initial: step('Tu parte'),
    states: [
      { name: step('Tu parte'), turn: 'human' },
      { name: step('Hacerlo'), turn: 'agent' },
    ] as TypeView['states'],
    fields: [title],
  };

  it('goes to an agent unless the person keeps it', () => {
    const values = { title: 'Fotos', [ref('Qué hace falta')]: 'Fotos del local' };
    expect(landingOf(todos, { ...values, [ref('Lo hago yo')]: 'no' }, def)).toMatchObject({
      state: step('Hacerlo'),
      turn: 'agent',
    });
    expect(landingOf(todos, { ...values, [ref('Lo hago yo')]: 'yes' }, def)).toMatchObject({
      state: step('Tu parte'),
      turn: 'human',
    });
  });
});
