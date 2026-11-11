import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePreset } from '../preset.ts';
import { compileBoard } from './compile.ts';
import { boardFromPreset } from './from-preset.ts';
import { problemsOf } from './problems.ts';

const official = (name: string) =>
  parsePreset(
    readFileSync(new URL(`../../../presets/${name}/preset.yaml`, import.meta.url), 'utf8'),
  );

describe('boardFromPreset', () => {
  it('reads the tasks preset as one step any agent does and you review', () => {
    const { definition, states } = boardFromPreset(official('tasks'), {
      name: 'Tareas',
      lang: 'es',
    });
    expect(definition.name).toBe('Tareas');
    expect(definition.item).toBe('Tarea');
    expect(definition.steps).toEqual([
      expect.objectContaining({
        id: 'todo',
        name: 'En curso',
        doer: 'any',
        reviewer: 'you',
        back: 'same',
      }),
    ]);
    expect(states).toEqual({
      incomplete: 'todo',
      todo: 'todo',
      in_progress: 'todo',
      review: 'todo__review',
      done: 'done',
      discarded: 'dropped',
    });
    expect(Object.keys(definition.parts)).toEqual(['description', 'priority']);
    expect(definition.parts.priority).toEqual(
      expect.objectContaining({
        kind: 'choice',
        options: [
          { id: 'low', name: 'baja' },
          { id: 'medium', name: 'media' },
          { id: 'high', name: 'alta' },
        ],
      }),
    );
    expect(definition.title).toBe('Título');
  });

  it('keeps every field and its values under their old keys, so items keep their data', () => {
    const { definition } = boardFromPreset(official('bug-triage'), { name: 'Errores', lang: 'en' });
    const preset = compileBoard('berrores', 1, definition);
    for (const key of Object.keys(official('bug-triage').fields)) {
      expect(preset.fields[key]).toBeDefined();
    }
  });

  it('reads bug triage as your triage, then the agents, with your review at the end', () => {
    const { definition, states } = boardFromPreset(official('bug-triage'), {
      name: 'Errores',
      lang: 'en',
    });
    expect(definition.steps.map(({ id, doer, reviewer }) => `${id}:${doer}/${reviewer}`)).toEqual([
      'reported:you/none',
      'needs_info:any/none',
      'accepted:any/you',
    ]);
    expect(states.fixing).toBe('accepted');
    expect(states.verify).toBe('accepted__review');
    expect(states.wont_fix).toBe('dropped');
    expect(definition.steps[0]?.ways).toEqual(['accepted']);
    expect(problemsOf(definition, { agents: [] }).filter(({ level }) => level === 'error')).toEqual(
      [],
    );
  });

  it('reads a revising state reached by a send-back as the next round of the reviewed step', () => {
    const { definition, states } = boardFromPreset(official('architecture'), {
      name: 'A',
      lang: 'en',
    });
    expect(states.revising).toBe(states.drafting);
    expect(definition.steps.every((s) => s.id !== 'revising')).toBe(true);
  });

  it('compiles what it reads for every official preset', () => {
    for (const name of ['tasks', 'bug-triage', 'change', 'review', 'architecture']) {
      const { definition } = boardFromPreset(official(name), { name, lang: 'en' });
      expect(() => compileBoard('bx', 1, definition)).not.toThrow();
    }
  });
});
