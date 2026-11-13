import { describe, expect, it } from 'vitest';
import { freshIds, ID_PATTERN, newId, sequenceIds } from './ids.ts';
import { type BoardDefinition, boardDefaults, stepDefaults } from './model.ts';
import { creatures } from './testing.ts';

const def = (): BoardDefinition => ({
  schema: 2,
  ...boardDefaults(),
  name: 'Criaturas',
  item: 'Criatura',
  icon: 'board',
  title: 'Título',
  parts: {
    f1: {
      id: 'f1',
      name: 'Bioma',
      kind: 'choice',
      hint: '',
      options: [{ id: 'c1', name: 'Pantano' }],
    },
    e1: { id: 'e1', name: 'Arte', kind: 'images', hint: '', options: [], show: 'gallery' },
  },
  form: [{ ref: 'f1', required: true }],
  steps: [
    {
      id: 's1',
      name: 'Concepto',
      doer: 'any',
      reviewer: 'you',
      hand: [{ ref: 'e1', req: 'when', when: { part: 'f1', value: 'c1' }, fresh: true }],
      ways: ['s2', 'done'],
      back: 'same',
      instructions: { take: 'Mira @[f1]', before: '', review: '' },
      ...stepDefaults(),
    },
    {
      id: 's2',
      name: 'Animar',
      doer: 'any',
      reviewer: 'none',
      hand: [],
      ways: [],
      back: 's1',
      instructions: { take: '', before: '', review: '' },
      ...stepDefaults(),
    },
  ],
  anytime: ['f1'],
  layout: { f1: 'side', e1: 'main' },
  row: ['f1'],
  about: 'Sobre @[e1]',
  idle: '',
  cap: { on: false, n: 3 },
  samples: [],
});

describe('newId', () => {
  it('makes ids that are valid field keys and module ids, with their kind as the first letter', () => {
    for (const kind of ['b', 's', 'f', 'e', 'c'] as const) {
      const id = newId(kind);
      expect(id).toMatch(ID_PATTERN);
      expect(id[0]).toBe(kind);
      expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId('s')));
    expect(ids.size).toBe(500);
  });
});

describe('freshIds', () => {
  it('gives every step, part and choice a new id and rewrites every reference to it', () => {
    const before = def();
    const after = freshIds(before, sequenceIds());
    const [concept, animate] = after.steps;
    expect(concept?.id).not.toBe('s1');
    expect(animate?.back).toBe(concept?.id);
    expect(concept?.ways).toEqual([animate?.id, 'done']);
    expect(concept?.back).toBe('same');
    const bioma = Object.values(after.parts).find((part) => part.name === 'Bioma');
    const arte = Object.values(after.parts).find((part) => part.name === 'Arte');
    expect(bioma && after.parts[bioma.id]).toBe(bioma);
    expect(after.form).toEqual([{ ref: bioma?.id, required: true }]);
    expect(concept?.hand[0]).toEqual({
      ref: arte?.id,
      req: 'when',
      when: { part: bioma?.id, value: bioma?.options[0]?.id },
      fresh: true,
    });
    expect(bioma?.options[0]?.id).not.toBe('c1');
    expect(after.anytime).toEqual([bioma?.id]);
    expect(after.row).toEqual([bioma?.id]);
    expect(after.layout).toEqual({ [bioma?.id ?? '']: 'side', [arte?.id ?? '']: 'main' });
    expect(concept?.instructions.take).toBe(`Mira @[${bioma?.id}]`);
    expect(after.about).toBe(`Sobre @[${arte?.id}]`);
    expect(before.steps[0]?.id).toBe('s1');
  });

  it('rewrites the references the later settings hold: ways back, guard, start value, grouping and motives', () => {
    const before = creatures();
    before.steps[1] = { ...before.steps[1]!, ways: ['sconcept'] };
    before.parts.fbranch = {
      id: 'fbranch',
      name: 'Rama',
      kind: 'branch',
      hint: '',
      options: [],
      guard: { push: ['sanimate'], repo: 'fdesc', base: 'main' },
    };
    before.parts.fbiome = { ...before.parts.fbiome!, initial: 'cwood' };
    before.list = { as: 'table', group: 'fbiome' };
    before.drop = { by: 'page', motives: [{ id: 'dup', name: 'Duplicado' }] };
    before.layout = { ...before.layout, rounds: 'main' };
    before.split = { board: 'bother', always: true };
    const after = freshIds(before, sequenceIds());
    const [concept, animate] = after.steps;
    const named = (name: string) => Object.values(after.parts).find((part) => part.name === name);
    expect(animate?.ways).toEqual([concept?.id]);
    expect(named('Rama')?.guard).toEqual({
      push: [animate?.id],
      repo: named('Descripción')?.id,
      base: 'main',
    });
    const bioma = named('Bioma');
    expect(bioma?.initial).toBe(bioma?.options.find((c) => c.name === 'Bosque')?.id);
    expect(after.list).toEqual({ as: 'table', group: bioma?.id });
    expect(after.drop.motives[0]?.id).not.toBe('dup');
    expect(after.drop.motives[0]?.id).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(after.layout.rounds).toBe('main');
    expect(after.split).toEqual({ board: 'bother', always: true });
  });
});
