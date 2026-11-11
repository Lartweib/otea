import { describe, expect, it } from 'vitest';
import { assertIconName } from '../icons.ts';
import { sequenceIds } from './ids.ts';
import { mentionText } from './mentions.ts';
import { partOf, usedRefs } from './model.ts';
import { problemsOf } from './problems.ts';
import {
  blankBoard,
  instantiate,
  requestsBoard,
  requireTemplate,
  TEMPLATES,
  templateView,
} from './templates.ts';

const agents: { name: string; connected: boolean }[] = [];

describe('templates', () => {
  it('holds the five templates of the design, in order', () => {
    expect(TEMPLATES.map(({ key }) => key)).toEqual([
      'bugs',
      'assets',
      'blog',
      'tasks',
      'research',
    ]);
  });

  for (const template of TEMPLATES) {
    for (const lang of ['en', 'es'] as const) {
      it(`copies ${template.key} in ${lang} into a board that publishes without errors`, () => {
        const def = instantiate(template, lang, {}, sequenceIds());
        expect(assertIconName(def.icon)).toBe(def.icon);
        expect(problemsOf(def, { agents }).filter(({ level }) => level === 'error')).toEqual([]);
        for (const ref of usedRefs(def)) expect(partOf(def, ref)?.name).toBeTruthy();
        for (const step of def.steps) {
          for (const text of Object.values(step.instructions)) {
            expect(mentionText(def, text)).not.toContain('@');
            expect(mentionText(def, text)).not.toContain('…');
          }
        }
        expect(def.template).toBe(template.key);
        expect(def.samples.length).toBeGreaterThan(0);
      });
    }
  }

  it('speaks the language asked for', () => {
    const es = instantiate(requireTemplate('bugs'), 'es', {}, sequenceIds());
    const en = instantiate(requireTemplate('bugs'), 'en', {}, sequenceIds());
    expect([es.name, es.item, es.steps.map(({ name }) => name)]).toEqual([
      'Bugs',
      'Bug',
      ['Refinar', 'Arreglar'],
    ]);
    expect([en.name, en.item, en.steps.map(({ name }) => name)]).toEqual([
      'Bugs',
      'Bug',
      ['Refine', 'Fix'],
    ]);
    expect(es.title).toBe('Título');
    expect(en.title).toBe('Title');
  });

  it('takes the name and item name given, and fresh ids every time', () => {
    const one = instantiate(requireTemplate('assets'), 'es', {
      name: 'Criaturas del pantano',
      item: 'Bicho',
    });
    const two = instantiate(requireTemplate('assets'), 'es', {});
    expect([one.name, one.item]).toEqual(['Criaturas del pantano', 'Bicho']);
    expect(one.steps[0]?.id).not.toBe(two.steps[0]?.id);
  });

  it('describes a template for the home: its words and a definition to draw its route', () => {
    const view = templateView(requireTemplate('tasks'), 'es');
    expect(view.key).toBe('tasks');
    expect(view.name).toBe('Tareas simples');
    expect(view.description).toBe('Un solo paso: un agente lo hace y tú lo revisas.');
    expect(view.definition.steps.map(({ name }) => name)).toEqual(['Hacerlo']);
  });
});

describe('blankBoard', () => {
  it('already works: one step any agent does and you review', () => {
    const def = blankBoard('es', { name: 'Criaturas', item: 'Criatura' }, sequenceIds());
    expect(def.steps).toEqual([
      expect.objectContaining({ name: 'Hacerlo', doer: 'any', reviewer: 'you', hand: [] }),
    ]);
    expect(def.title).toBe('Título');
    expect(problemsOf(def, { agents })).toEqual([]);
    expect(blankBoard('en', { name: 'Creatures' }).item).toBe('Item');
  });
});

describe('requestsBoard', () => {
  it('is the project board for loose requests, with what you need and what was done', () => {
    const es = requestsBoard('es', sequenceIds());
    expect(es.name).toBe('Pedidos');
    expect(es.item).toBe('Pedido');
    expect(Object.values(es.parts).map(({ name }) => name)).toEqual(['Qué necesitas', 'Qué hice']);
    expect(requestsBoard('en').name).toBe('Requests');
  });
});
