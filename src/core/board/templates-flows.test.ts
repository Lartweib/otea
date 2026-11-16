import { describe, expect, it } from 'vitest';
import { assertIconName } from '../icons.ts';
import { sequenceIds } from './ids.ts';
import { mentionText } from './mentions.ts';
import { type BoardDefinition, SAME } from './model.ts';
import { problemsOf } from './problems.ts';
import { instantiateSet, listedTemplates, requireSet } from './templates.ts';

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
    const kind = partNamed(ideas, 'Tipo');
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

  for (const lang of ['en', 'es'] as const) {
    it(`reads well in ${lang}: real icons, every mention named, nothing left raw`, () => {
      const defs = made('ideas', lang);
      const boards = defs.map((def, index) => ({ id: `b${index}`, name: def.name }));
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
