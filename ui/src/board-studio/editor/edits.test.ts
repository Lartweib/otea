import { describe, expect, it } from 'vitest';
import { problemsOf } from '../../../../src/core/board/problems.ts';
import { creatures, step } from '../../../../src/core/board/testing.ts';
import {
  addChoice,
  addPart,
  addStep,
  addWay,
  editableText,
  moveStep,
  removeChoice,
  removePart,
  removeStep,
  removeWay,
  renamePart,
  replaceWay,
  reusePart,
  setBack,
  setChoices,
  setDoer,
  setFormRequired,
  setInstruction,
  setRequirement,
  setReviewer,
  setWhen,
  uniqueName,
} from './edits.ts';

const counter = () => {
  let n = 0;
  return (kind: string) => `${kind}new${++n}`;
};

const codes = (def: ReturnType<typeof creatures>) => problemsOf(def, {}).map((p) => p.code);

describe('addStep', () => {
  it('adds a step where asked: any agent does it, you review it, a unique name', () => {
    const def = creatures();
    const id = addStep(def, 1, 'Paso nuevo', counter());
    expect(id).toBe('snew1');
    expect(def.steps.map((s) => s.name)).toEqual(['Concepto', 'Paso nuevo', 'Animar', 'Pulir']);
    expect(def.steps[1]).toMatchObject({ doer: 'any', reviewer: 'you', hand: [], back: 'same' });
    addStep(def, 99, 'Paso nuevo', counter());
    expect(def.steps.at(-1)?.name).toBe('Paso nuevo 2');
  });
});

describe('uniqueName', () => {
  it('counts steps, used parts and the title, without case', () => {
    const def = creatures();
    expect(uniqueName(def, 'concepto')).toBe('concepto 2');
    expect(uniqueName(def, 'Título')).toBe('Título 2');
    expect(uniqueName(def, 'Nuevo')).toBe('Nuevo');
  });
});

describe('moveStep', () => {
  it('swaps a step with its neighbour and drops ways and backs that would point the wrong way', () => {
    const def = creatures();
    // Animar's send-back lands on Concepto; once Animar goes first it can only land on itself.
    moveStep(def, 'sanimate', -1);
    expect(def.steps.map((s) => s.id)).toEqual(['sanimate', 'sconcept', 'spolish']);
    expect(def.steps[0]?.back).toBe('same');
    expect(codes(def)).not.toContain('back_invalid');
    expect(codes(def)).not.toContain('way_invalid');
  });

  it('does nothing at the ends', () => {
    const def = creatures();
    moveStep(def, 'sconcept', -1);
    moveStep(def, 'spolish', 1);
    expect(def.steps.map((s) => s.id)).toEqual(['sconcept', 'sanimate', 'spolish']);
  });

  it('keeps a way to Done and drops one that now points back', () => {
    const def = creatures();
    def.steps[0] = { ...(def.steps[0] ?? step('x', 'x')), ways: ['spolish', 'done'] };
    moveStep(def, 'spolish', -1);
    moveStep(def, 'spolish', -1);
    expect(def.steps.map((s) => s.id)).toEqual(['spolish', 'sconcept', 'sanimate']);
    expect(def.steps[1]?.ways).toEqual(['done']);
  });
});

describe('removeStep', () => {
  it('removes the step and rewrites the ways and backs that pointed at it, keeping its parts', () => {
    const def = creatures();
    def.steps[0] = { ...(def.steps[0] ?? step('x', 'x')), ways: ['sanimate', 'done'] };
    def.steps[2] = { ...(def.steps[2] ?? step('x', 'x')), back: 'sanimate' };
    removeStep(def, 'sanimate');
    expect(def.steps.map((s) => s.id)).toEqual(['sconcept', 'spolish']);
    expect(def.steps[0]?.ways).toEqual(['done']);
    expect(def.steps[1]?.back).toBe('same');
    expect(def.parts.eanim).toBeDefined();
    expect(codes(def)).not.toContain('way_invalid');
    expect(codes(def)).not.toContain('back_invalid');
  });
});

describe('who', () => {
  it('sets who does it and who reviews it; a reviewer other than you keeps no send-back', () => {
    const def = creatures();
    setDoer(def, 'sconcept', 'you');
    expect(def.steps[0]?.doer).toBe('you');
    setBack(def, 'spolish', 'sconcept');
    setReviewer(def, 'spolish', 'you');
    expect(def.steps[2]?.back).toBe('sconcept');
    setReviewer(def, 'spolish', 'none');
    expect(def.steps[2]?.back).toBe('same');
  });
});

describe('parts', () => {
  const words = { name: 'Imágenes', options: ['Una', 'Otra'] };

  it('adds a new part to a step with a unique name, its default show and zone', () => {
    const def = creatures();
    const id = addPart(def, { type: 'step', step: 'spolish' }, 'images', words, counter());
    expect(id).toBe('enew1');
    expect(def.parts[id]).toMatchObject({ name: 'Imágenes', kind: 'images', show: 'gallery' });
    expect(def.layout[id]).toBe('main');
    expect(def.steps[2]?.hand).toEqual([{ ref: id, req: 'always', fresh: true }]);
    const again = addPart(def, { type: 'step', step: 'spolish' }, 'images', words, counter());
    expect(def.parts[again]?.name).toBe('Imágenes 2');
  });

  it('gives a choice its starting options and puts short fields at the side', () => {
    const def = creatures();
    const ids = counter();
    const id = addPart(
      def,
      { type: 'form' },
      'choice',
      { name: 'Opción', options: ['Una', 'Otra'] },
      ids,
    );
    expect(def.parts[id]?.options.map((o) => o.name)).toEqual(['Una', 'Otra']);
    expect(def.parts[id]?.options.every((o) => o.id.startsWith('c'))).toBe(true);
    expect(def.layout[id]).toBe('side');
    expect(def.form.at(-1)).toEqual({ ref: id, required: false });
    const any = addPart(def, { type: 'anytime' }, 'number', { name: 'Número', options: [] }, ids);
    expect(def.anytime).toEqual([any]);
  });

  it('reuses a part on a step once, and removes it from a list but keeps it for undo', () => {
    const def = creatures();
    reusePart(def, { type: 'step', step: 'spolish' }, 'eart');
    reusePart(def, { type: 'step', step: 'spolish' }, 'eart');
    expect(def.steps[2]?.hand.map((h) => h.ref)).toEqual(['eart']);
    removePart(def, { type: 'step', step: 'spolish' }, 'eart');
    expect(def.steps[2]?.hand).toEqual([]);
    removePart(def, { type: 'form' }, 'fbiome');
    expect(def.form.map((f) => f.ref)).toEqual(['fdesc']);
    expect(def.parts.fbiome).toBeDefined();
    // Concepto's "only when Bioma is Pantano" can no longer read it: it becomes required always.
    expect(def.steps[0]?.hand[1]).toEqual({ ref: 'eswamp', req: 'always', fresh: false });
  });

  it('renames a part and every mention follows', () => {
    const def = creatures();
    renamePart(def, 'eart', 'Bocetos');
    expect(editableText(def, def.steps[1]?.instructions.take ?? '')).toBe(
      'Parte del @Bocetos de @Concepto.',
    );
  });

  it('sets whether the form asks for a part', () => {
    const def = creatures();
    setFormRequired(def, 'fbiome', true);
    expect(def.form[1]).toEqual({ ref: 'fbiome', required: true });
  });
});

describe('setRequirement', () => {
  it('sets always, only when and optional, with new each round', () => {
    const def = creatures();
    setRequirement(def, 'sanimate', 'ecode', 'always', true);
    expect(def.steps[1]?.hand[1]).toEqual({ ref: 'ecode', req: 'always', fresh: true });
    setRequirement(def, 'sanimate', 'ecode', 'no');
    expect(def.steps[1]?.hand[1]).toEqual({ ref: 'ecode', req: 'no', fresh: false });
    setRequirement(def, 'sanimate', 'ecode', 'when');
    setWhen(def, 'sanimate', 'ecode', { part: 'fbiome', value: 'cwood' });
    expect(def.steps[1]?.hand[1]).toEqual({
      ref: 'ecode',
      req: 'when',
      fresh: false,
      when: { part: 'fbiome', value: 'cwood' },
    });
    setRequirement(def, 'sanimate', 'ecode', 'always');
    expect(def.steps[1]?.hand[1]?.when).toBeUndefined();
  });
});

describe('ways and backs', () => {
  it('adds, replaces and removes a way', () => {
    const def = creatures();
    addWay(def, 'sanimate', 'done');
    addWay(def, 'sanimate', 'done');
    expect(def.steps[1]?.ways).toEqual(['done']);
    replaceWay(def, 'sconcept', 'done', 'spolish');
    expect(def.steps[0]?.ways).toEqual(['spolish']);
    removeWay(def, 'sconcept', 'spolish');
    expect(def.steps[0]?.ways).toEqual([]);
  });

  it('sets where a send-back lands', () => {
    const def = creatures();
    setBack(def, 'sanimate', 'same');
    expect(def.steps[1]?.back).toBe('same');
  });
});

describe('setInstruction', () => {
  it('stores typed mentions as tokens, for a step and for the board', () => {
    const def = creatures();
    setInstruction(def, { step: 'sconcept', key: 'take' }, 'Mira la @Descripción y el @Bioma.');
    expect(def.steps[0]?.instructions.take).toBe('Mira la @[fdesc] y el @[fbiome].');
    expect(editableText(def, def.steps[0]?.instructions.take ?? '')).toBe(
      'Mira la @Descripción y el @Bioma.',
    );
    setInstruction(def, { board: 'about' }, 'Todo empieza en @Concepto.');
    expect(def.about).toBe('Todo empieza en @[sconcept].');
    setInstruction(def, { board: 'idle' }, 'Nada.');
    expect(def.idle).toBe('Nada.');
  });

  it('shows the title by its name', () => {
    const def = creatures();
    setInstruction(def, { step: 'sconcept', key: 'before' }, 'Repite el @Título.');
    expect(def.steps[0]?.instructions.before).toBe('Repite el @[title].');
  });
});

describe('choices', () => {
  it('keeps the ids of choices that stay, gives new ones fresh ids and clears a when that lost its value', () => {
    const def = creatures();
    setChoices(def, 'fbiome', ['Bosque', 'Muelle'], counter());
    expect(def.parts.fbiome?.options).toEqual([
      { id: 'cwood', name: 'Bosque' },
      { id: 'cnew1', name: 'Muelle' },
    ]);
    // Concepto asked for Barro only when Bioma was Pantano, which is gone.
    expect(def.steps[0]?.hand[1]).toMatchObject({
      req: 'when',
      when: { part: 'fbiome', value: '' },
    });
    addChoice(def, 'fbiome', 'Cueva', counter());
    expect(def.parts.fbiome?.options.map((o) => o.name)).toEqual(['Bosque', 'Muelle', 'Cueva']);
    removeChoice(def, 'fbiome', 'cwood');
    expect(def.parts.fbiome?.options.map((o) => o.name)).toEqual(['Muelle', 'Cueva']);
  });

  it('ignores an empty or repeated choice', () => {
    const def = creatures();
    addChoice(def, 'fbiome', '  ', counter());
    addChoice(def, 'fbiome', 'pantano', counter());
    expect(def.parts.fbiome?.options.map((o) => o.name)).toEqual(['Pantano', 'Bosque']);
  });
});

describe('mentionChoices', () => {
  it('lists the steps, the title and the parts in use', async () => {
    const { mentionChoices } = await import('./edits.ts');
    const names = mentionChoices(creatures()).map((m) => m.name);
    expect(names.slice(0, 4)).toEqual(['Concepto', 'Animar', 'Pulir', 'Título']);
    expect(names).toContain('Arte conceptual');
    expect(names).not.toContain('Barro2');
  });
});
