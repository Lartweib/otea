import { describe, expect, it } from 'vitest';
import { assertIconName } from '../icons.ts';
import { isLandStep } from './engine.ts';
import { sequenceIds } from './ids.ts';
import { mentionText } from './mentions.ts';
import { type BoardDefinition, SAME } from './model.ts';
import { problemsOf } from './problems.ts';
import {
  instantiate,
  instantiateSet,
  listedTemplates,
  requireSet,
  requireTemplate,
} from './templates.ts';

const partNamed = (def: BoardDefinition, name: string) =>
  Object.values(def.parts).find((part) => part.name === name);
const stepNamed = (def: BoardDefinition, name: string) =>
  def.steps.find((step) => step.name === name);
const handOf = (def: BoardDefinition, step: string, part: string) =>
  stepNamed(def, step)?.hand.find(({ ref }) => ref === partNamed(def, part)?.id);

function made(set: string, lang: 'en' | 'es') {
  const boards = requireSet(set).boards.map((_, index) => ({ id: `b${index}` }));
  return instantiateSet(requireSet(set), lang, boards, sequenceIds());
}

describe('the Ideas set', () => {
  it('makes Ideas and Implementación, offered among the sets', () => {
    const [ideas, tasks] = made('ideas', 'es');
    expect([ideas?.name, ideas?.item, tasks?.name, tasks?.item]).toEqual([
      'Ideas',
      'Idea',
      'Implementación',
      'Tarea',
    ]);
    expect(ideas?.steps.map(({ name }) => name)).toEqual(['Refinar', 'Diseñar', 'Planificar']);
    expect(tasks?.steps.map(({ name }) => name)).toEqual(['Preparar', 'Hacer']);
    const view = listedTemplates('en').find(({ key }) => key === 'ideas');
    expect(view?.boards?.map(({ name }) => name)).toEqual(['Ideas', 'Implementation']);
  });

  it('asks for the Brief only of an Idea, and for the Options only of a Decision', () => {
    const [ideas] = made('ideas', 'es');
    if (!ideas) throw new Error('no Ideas board');
    const kind = partNamed(ideas, 'Qué es');
    const [idea, decision] = kind?.options ?? [];
    expect(kind?.initial).toBe(idea?.id);
    expect(handOf(ideas, 'Refinar', 'Brief')).toEqual({
      ref: partNamed(ideas, 'Brief')?.id,
      req: 'when',
      when: { part: kind?.id, value: idea?.id },
      fresh: false,
    });
    expect(handOf(ideas, 'Refinar', 'Opciones')?.when).toEqual({
      part: kind?.id,
      value: decision?.id,
    });
    expect(handOf(ideas, 'Diseñar', 'Diagramas')).toMatchObject({ req: 'when', fresh: true });
  });

  it('divides an idea into its decisions and a task into its subtasks, on its own board', () => {
    const [ideas, tasks] = made('ideas', 'en');
    expect(ideas?.split).toEqual({ board: SAME, always: false });
    expect(tasks?.split).toEqual({ board: SAME, always: false });
    expect(stepNamed(ideas as BoardDefinition, 'Design')?.waits).toEqual(['parts']);
    expect(stepNamed(tasks as BoardDefinition, 'Do it')?.waits).toEqual(['parts', 'blockers']);
  });

  for (const [set, lang] of [
    ['ideas', 'en'],
    ['ideas', 'es'],
    ['repos', 'en'],
    ['repos', 'es'],
  ] as const) {
    it(`reads ${set} well in ${lang}: real icons, every mention named, nothing left raw`, () => {
      const defs = made(set, lang);
      const split = defs.map((def) => def.split);
      const boards = defs.map((def, index) => ({
        id: `b${index}`,
        name: def.name,
        ...(split[index] ? { split: split[index] } : {}),
      }));
      defs.forEach((def, index) => {
        expect(assertIconName(def.icon)).toBe(def.icon);
        const problems = problemsOf(def, { id: `b${index}`, boards });
        // Only the reminder that an agent dropping an item names a motive may remain.
        expect(problems.filter(({ code }) => code !== 'motive_agent_drop')).toEqual([]);
        for (const step of def.steps)
          for (const text of Object.values(step.instructions)) {
            expect(mentionText(def, text)).not.toMatch(/@[[{]/);
          }
      });
    });
  }
});

describe('the Entregas con PR set', () => {
  it('divides each Trabajo into Entregas, which guard their branch and main', () => {
    const [jobs, deliveries] = made('repos', 'es');
    if (!jobs || !deliveries) throw new Error('no boards');
    expect(jobs.split).toEqual({ board: 'b1', always: true });
    expect(jobs.steps.map(({ name }) => name)).toEqual(['Analizar', 'Entregar']);
    expect(stepNamed(jobs, 'Entregar')?.waits).toEqual(['parts']);
    expect(
      deliveries.steps.map(({ name, doer, reviewer }) => `${name}:${doer}/${reviewer}`),
    ).toEqual(['Implementar:any/any', 'Aprobar el merge:you/none']);
    expect(stepNamed(deliveries, 'Aprobar el merge')?.waits).toEqual(['blockers']);
    expect(partNamed(deliveries, 'Rama')?.guard).toEqual({
      push: [stepNamed(deliveries, 'Implementar')?.id],
      repo: partNamed(deliveries, 'Repo')?.id,
      base: 'main',
    });
  });
});

describe('the Cambios template', () => {
  it('clarifies, does and lands each change, with one approval of yours', () => {
    const def = instantiate(requireTemplate('changes'), 'es', {}, sequenceIds());
    expect([def.name, def.item]).toEqual(['Cambios', 'Cambio']);
    expect(def.steps.map(({ name, doer, reviewer }) => `${name}:${doer}/${reviewer}`)).toEqual([
      'Aclarar:any/none',
      'Hacerlo:any/you',
      'Integrar:any/none',
    ]);
    const land = stepNamed(def, 'Integrar');
    expect(isLandStep(def, land?.id ?? '')).toBe(true);
    expect(partNamed(def, 'Rama')?.guard).toEqual({
      push: [stepNamed(def, 'Hacerlo')?.id, land?.id],
      base: 'main',
    });
  });

  it('asks for screenshots of an interface change and the test output of a bug', () => {
    const def = instantiate(requireTemplate('changes'), 'es', {}, sequenceIds());
    const kind = partNamed(def, 'Clase de cambio');
    const value = (name: string) => kind?.options.find((option) => option.name === name)?.id;
    expect(kind?.initial).toBe(value('Otro'));
    expect(handOf(def, 'Hacerlo', 'Capturas')).toMatchObject({
      req: 'when',
      when: { part: kind?.id, value: value('Interfaz') },
      fresh: true,
    });
    expect(handOf(def, 'Hacerlo', 'Salida de las pruebas')?.when).toEqual({
      part: kind?.id,
      value: value('Error'),
    });
  });

  for (const lang of ['en', 'es'] as const) {
    it(`reads well in ${lang}`, () => {
      const def = instantiate(requireTemplate('changes'), lang, {}, sequenceIds());
      expect(assertIconName(def.icon)).toBe(def.icon);
      expect(problemsOf(def, {})).toEqual([]);
      for (const step of def.steps)
        for (const text of Object.values(step.instructions))
          expect(mentionText(def, text)).not.toMatch(/@[[{]/);
    });
  }
});
