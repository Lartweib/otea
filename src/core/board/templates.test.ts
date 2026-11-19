import { describe, expect, it } from 'vitest';
import { assertIconName } from '../icons.ts';
import { viewsOf } from './analysis.ts';
import { sequenceIds } from './ids.ts';
import { mentionText } from './mentions.ts';
import { EVIDENCE_KINDS, EVIDENCE_SHOWS, partOf, usedRefs } from './model.ts';
import { problemsOf } from './problems.ts';
import {
  blankBoard,
  instantiate,
  instantiateSet,
  LISTED_KEYS,
  listedTemplates,
  requestsBoard,
  requireSet,
  requireTemplate,
  TEMPLATE_SETS,
  TEMPLATES,
  templateView,
} from './templates.ts';
import { CATALOGUE_TEMPLATES } from './templates-catalogue.ts';

describe('templates', () => {
  it('lists the templates of the design, in order, the sets last', () => {
    expect(listedTemplates('es').map(({ key, name }) => `${key}:${name}`)).toEqual([
      'todos:Pendientes',
      'bug-reports:Errores',
      'changes:Cambios',
      'mainline:Código en main',
      'research:Investigación',
      'decisions:Decisiones',
      'content:Contenido',
      'design:Diseño visual',
      'experiments:Experimentos',
      'ideas:Ideas → Tareas',
      'repos:Entregas con PR',
    ]);
  });

  for (const set of TEMPLATE_SETS) {
    for (const lang of ['en', 'es'] as const) {
      it(`copies the set ${set.key} in ${lang} into boards that publish without errors`, () => {
        const ids = set.boards.map((_, index) => ({ id: `b${index}` }));
        const defs = instantiateSet(set, lang, ids, sequenceIds());
        const boards = defs.map((def, index) => ({
          id: `b${index}`,
          name: def.name,
          ...(def.split ? { split: def.split } : {}),
        }));
        defs.forEach((def, index) => {
          expect(def.template).toBe(set.key);
          const problems = problemsOf(def, { id: `b${index}`, boards });
          expect(problems.filter(({ level }) => level === 'error')).toEqual([]);
        });
      });
    }
  }

  it('joins Trabajos to its Entregas by the child board id, always', () => {
    const [jobs, deliveries] = instantiateSet(requireSet('repos'), 'es', [
      { id: 'btra', name: 'Trabajos' },
      { id: 'bent' },
    ]);
    expect(jobs?.split).toEqual({ board: 'bent', always: true });
    expect(deliveries?.name).toBe('Entregas');
    expect(deliveries?.split).toBeUndefined();
    expect(jobs?.madeWith).toEqual(['bent']);
    expect(deliveries?.madeWith).toEqual(['btra']);
    const view = listedTemplates('es').find(({ key }) => key === 'repos');
    expect(view?.boards?.map(({ name, item }) => `${name}/${item}`)).toEqual([
      'Trabajos/Trabajo',
      'Entregas/Entrega',
    ]);
  });

  for (const template of TEMPLATES.filter(({ hidden }) => !hidden)) {
    for (const lang of ['en', 'es'] as const) {
      it(`copies ${template.key} in ${lang} into a board that publishes without errors`, () => {
        const def = instantiate(template, lang, {}, sequenceIds());
        expect(assertIconName(def.icon)).toBe(def.icon);
        expect(problemsOf(def, {}).filter(({ level }) => level === 'error')).toEqual([]);
        if (CATALOGUE_TEMPLATES.includes(template)) expect(problemsOf(def, {})).toEqual([]);
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

  it('maps the analysis roles where they fit: bugs by effort, risk and area, changes and tasks by effort', () => {
    const roles = (key: string) => {
      const def = instantiate(requireTemplate(key), 'es', {}, sequenceIds());
      return Object.fromEntries(
        Object.entries(def.analysis ?? {}).map(([role, ref]) => [role, partOf(def, ref)?.name]),
      );
    };

    expect(roles('bug-reports')).toEqual({ effort: 'Esfuerzo', risk: 'Riesgo', area: 'Área' });
    expect(roles('changes')).toEqual({ effort: 'Esfuerzo', impact: 'Impacto' });
    expect(roles('ideaboard')).toEqual({ effort: 'Esfuerzo', impact: 'Impacto' });
    expect(roles('implementation')).toEqual({ effort: 'Tamaño' });
  });

  it('opens the Matrix on Ideas and Cambios, an effort read as a size, never as «crítica»', () => {
    for (const key of ['ideaboard', 'changes', 'bug-reports']) {
      const def = instantiate(requireTemplate(key), 'es', {}, sequenceIds());
      if (key !== 'bug-reports') expect(viewsOf(def)).toEqual(['matrix']);
      const effort = partOf(def, def.analysis?.effort ?? '');
      expect(effort?.kind).toBe('choice');
      expect(effort?.options.map(({ name }) => name)).toEqual([
        'Pequeño',
        'Mediano',
        'Grande',
        'Enorme',
      ]);
      // The agent can estimate them at any step, and the person correct them.
      expect(def.anytime).toEqual(expect.arrayContaining([def.analysis?.effort]));
    }
    const en = instantiate(requireTemplate('changes'), 'en', {}, sequenceIds());
    expect(partOf(en, en.analysis?.effort ?? '')?.options.map(({ name }) => name)).toEqual([
      'Small',
      'Medium',
      'Large',
      'Huge',
    ]);
  });

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
    const one = instantiate(requireTemplate('design'), 'es', {
      name: 'Criaturas del pantano',
      item: 'Bicho',
    });
    const two = instantiate(requireTemplate('design'), 'es', {});
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
    expect(problemsOf(def, {})).toEqual([]);
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

describe('the Research template', () => {
  it('speaks of any project, not of a game', () => {
    for (const lang of ['en', 'es'] as const) {
      const def = instantiate(requireTemplate('research'), lang, {});
      const words = JSON.stringify([def.about, def.samples, def.steps.map((s) => s.instructions)]);
      expect(words).not.toMatch(/engine|wolves|saved game|motor|lobos|partida/i);
    }
  });
});

describe('the official catalogue', () => {
  // Every way the item page draws evidence must be offered by at least one template a person can
  // pick, or the catalogue never shows what the detail view can do.
  it('uses every evidence kind and every way of showing it', () => {
    const official = TEMPLATES.filter(({ key }) => LISTED_KEYS.includes(key)).concat(
      TEMPLATE_SETS.flatMap(({ boards }) => boards.map(requireTemplate)),
    );
    const used = new Set(
      official.flatMap(({ parts }) =>
        parts.flatMap(({ kind, show }) => {
          const shows = EVIDENCE_SHOWS[kind as keyof typeof EVIDENCE_SHOWS];
          return shows ? [`${kind}:${show ?? shows[0]}`] : [kind];
        }),
      ),
    );
    const wanted = EVIDENCE_KINDS.flatMap((kind) => {
      const shows = EVIDENCE_SHOWS[kind];
      return shows ? shows.map((show) => `${kind}:${show}`) : [kind];
    });
    expect(wanted.filter((kind) => !used.has(kind))).toEqual([]);
  });

  it('offers exactly the eleven starter templates, none named after a way of working', () => {
    expect(LISTED_KEYS).toHaveLength(11);
    for (const gone of [
      'playtest',
      'resume',
      'visual-iteration',
      'digest',
      'support',
      'assets',
      'repobugs',
    ]) {
      expect(TEMPLATES.some(({ key }) => key === gone)).toBe(false);
    }
  });
});

describe('templates that fit the work', () => {
  // What a step hands in, by the part's name, with the value of the part that makes it required.
  const handOf = (key: string, step: string) => {
    const def = instantiate(requireTemplate(key), 'es', {}, sequenceIds());
    const found = def.steps.find(({ name }) => name === step);
    return (found?.hand ?? []).map(({ ref, req, fresh, when }) => {
      const cond = when ? partOf(def, when.part) : undefined;
      const value = cond?.options.find(({ id }) => id === when?.value)?.name ?? when?.value;
      return [partOf(def, ref)?.name, req, fresh, cond ? `${cond.name}=${value}` : undefined];
    });
  };

  it('offers a board for work that is not code: no branch, no diff, no tests', () => {
    expect(LISTED_KEYS[0]).toBe('todos');
    const def = instantiate(requireTemplate('todos'), 'es', {}, sequenceIds());
    expect([def.name, def.item]).toEqual(['Pendientes', 'Pendiente']);
    expect(Object.values(def.parts).map(({ kind }) => kind)).not.toEqual(
      expect.arrayContaining(['branch']),
    );
    for (const kind of ['branch', 'code', 'log', 'test'])
      expect(Object.values(def.parts).some((part) => part.kind === kind)).toBe(false);
    expect(handOf('todos', 'Hacerlo')[0]).toEqual(['Lo que hice', 'always', false, undefined]);
  });

  it('asks a command-line change of Cambios for its terminal output, never for screenshots', () => {
    const hand = handOf('changes', 'Hacerlo');
    expect(hand).toContainEqual(['Capturas', 'when', true, 'Clase de cambio=Interfaz visual']);
    expect(hand).toContainEqual([
      'Salida en la terminal',
      'when',
      true,
      'Clase de cambio=Línea de comandos',
    ]);
  });

  it('asks Diseño visual for its branch and diff once, and only for a piece in the repository', () => {
    const create = handOf('design', 'Crear');
    expect(create).toContainEqual(['Rama', 'when', false, 'En el repositorio=yes']);
    expect(create).toContainEqual(['Cambios', 'when', false, 'En el repositorio=yes']);
    expect(create).toContainEqual(['Imágenes', 'always', true, undefined]);
    expect(handOf('design', 'Integrar')).toContainEqual([
      'Commit en main',
      'when',
      false,
      'En el repositorio=yes',
    ]);
    const def = instantiate(requireTemplate('design'), 'es', {}, sequenceIds());
    expect(Object.values(def.parts).find(({ name }) => name === 'Imágenes')?.show).toBe('gallery');
  });
});

describe('LISTED_KEYS', () => {
  it('holds the keys Studio offers, in its order', () => {
    expect(LISTED_KEYS).toEqual(listedTemplates('en').map(({ key }) => key));
  });
});
