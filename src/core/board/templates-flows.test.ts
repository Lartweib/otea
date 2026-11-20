import { describe, expect, it } from 'vitest';
import { isLandStep } from './engine.ts';
import { sequenceIds } from './ids.ts';
import { mentionText } from './mentions.ts';
import { type BoardDefinition, SAME } from './model.ts';
import {
  instantiate,
  instantiateSet,
  listedTemplates,
  requireSet,
  requireTemplate,
  TEMPLATES,
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
    expect(tasks?.steps.map(({ name }) => name)).toEqual(['Preparar', 'Hacer', 'Integrar']);
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
});

// P7-8: TAR-1..3 went «Aprobar → Hecho · se cierra» while their code sat on an unpushed agent
// branch and main was untouched: the board recorded no branch, so neither the drift warning nor the
// merge gates applied. Like Cambios, each task names its Rama and lands on main once approved.
describe('the Implementación board', () => {
  it('says where the code goes: each task on its Rama, landed on main once you approve it', () => {
    const [, tasks] = made('ideas', 'es');
    if (!tasks) throw new Error('no Implementación');
    expect(tasks.steps.map(({ name, doer, reviewer }) => `${name}:${doer}/${reviewer}`)).toEqual([
      'Preparar:any/none',
      'Hacer:any/you',
      'Integrar:any/none',
    ]);
    const land = stepNamed(tasks, 'Integrar');
    expect(isLandStep(tasks, land?.id ?? '')).toBe(true);
    expect(partNamed(tasks, 'Rama')?.guard).toEqual({
      push: [stepNamed(tasks, 'Hacer')?.id, land?.id],
      base: 'main',
    });
    expect(handOf(tasks, 'Hacer', 'Rama')).toMatchObject({ req: 'always' });
    expect(handOf(tasks, 'Integrar', 'Commit en main')).toMatchObject({ req: 'always' });
    expect(stepNamed(tasks, 'Integrar')?.ways).toEqual([stepNamed(tasks, 'Hacer')?.id]);
  });
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

  it('says which branch and repo to work on in words that read with the fields named', () => {
    const [, es] = made('repos', 'es');
    const [, en] = made('repos', 'en');
    if (!es || !en) throw new Error('no Entregas');
    const take = (def: BoardDefinition) =>
      mentionText(def, stepNamed(def, def.steps[0]?.name ?? '')?.instructions.take ?? '');
    expect(take(es)).toContain('Trabaja en la rama que dice Rama, en el repo que dice Repo,');
    expect(take(en)).toContain('Work on the branch Branch names, in the repo Repo names,');
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

  it('asks for screenshots of a visual change, the terminal output of a command-line one and the test output of a bug', () => {
    const def = instantiate(requireTemplate('changes'), 'es', {}, sequenceIds());
    const kind = partNamed(def, 'Clase de cambio');
    const value = (name: string) => kind?.options.find((option) => option.name === name)?.id;
    expect(kind?.initial).toBe(value('Otro'));
    expect(handOf(def, 'Hacerlo', 'Capturas')).toMatchObject({
      req: 'when',
      when: { part: kind?.id, value: value('Interfaz visual') },
      fresh: true,
    });
    expect(handOf(def, 'Hacerlo', 'Salida en la terminal')).toMatchObject({
      req: 'when',
      when: { part: kind?.id, value: value('Línea de comandos') },
      fresh: true,
    });
    expect(handOf(def, 'Hacerlo', 'Salida de las pruebas')?.when).toEqual({
      part: kind?.id,
      value: value('Error'),
    });
  });
});

describe('the words of the catalogue', () => {
  // What a template says, as an agent or the person reads it, mentions named.
  const read = (key: string, lang: 'en' | 'es') => {
    const def = instantiate(requireTemplate(key), lang, {}, sequenceIds());
    return [def.about, ...def.steps.flatMap(({ instructions }) => Object.values(instructions))]
      .map((text) => mentionText(def, text))
      .join('\n');
  };

  it('reads in neutral Spanish, and names a part without an article that clashes with it (IDEA3-8)', () => {
    const es = TEMPLATES.map(({ key }) => read(key, 'es')).join('\n');
    expect(es).not.toMatch(/\bchicos?\b/);
    expect(es).not.toContain('Lee el issue de Issue');
    expect(es).not.toContain('a partir del Secciones');
    expect(read('jobs', 'en')).toContain('Read the Issue (and its sub-issues)');
  });
});
