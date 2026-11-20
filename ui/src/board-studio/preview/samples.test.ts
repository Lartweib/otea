import { afterEach, describe, expect, it } from 'vitest';
import { handoffCheck } from '../../../../src/core/board/engine.ts';
import { sequenceIds } from '../../../../src/core/board/ids.ts';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { instantiate, requireTemplate } from '../../../../src/core/board/templates.ts';
import { creatures } from '../../../../src/core/board/testing.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import {
  boardPrefix,
  itemPrefix,
  sampleFacts,
  sampleId,
  sampleItems,
  sampleRaw,
  sampleSkipped,
  sampleTitle,
  sampleValue,
  setBoardPrefixes,
} from './samples.ts';

afterEach(() => {
  setLanguage('en');
  setBoardPrefixes(new Map());
});

const part = (id: string) => {
  const found = creatures().parts[id];
  if (!found) throw new Error(id);
  return found;
};

describe('itemPrefix', () => {
  it('takes the first three letters of the item, without accents', () => {
    expect(itemPrefix('Criatura')).toBe('CRI');
    expect(itemPrefix('Úlcera')).toBe('ULC');
    expect(itemPrefix('Bug')).toBe('BUG');
    expect(itemPrefix('')).toBe('ITM');
  });
});

describe('boardPrefix', () => {
  it('uses the prefix a board’s items already go by, else three letters of the item', () => {
    const def = creatures();
    expect(boardPrefix(def)).toBe('CRI');
    expect(sampleId(def)).toBe('CRI-12');
    setBoardPrefixes(new Map([['Criaturas', 'CRIATURAS']]));
    expect(boardPrefix(def)).toBe('CRIATURAS');
    expect(sampleId(def)).toBe('CRIATURAS-12');
    expect(sampleItems(def)[0]?.id).toBe('CRIATURAS-1');
    expect(boardPrefix({ ...def, name: 'Otra' })).toBe('CRI');
  });
});

describe('sampleTitle', () => {
  it('uses the board samples, then «{item} de ejemplo»', () => {
    const def = creatures();
    expect(sampleTitle(def, 0)).toBe('Tortuga musgosa');
    def.samples = [];
    setLanguage('es');
    expect(sampleTitle(def, 0)).toBe('Criatura de ejemplo');
  });
});

describe('sampleItems', () => {
  it('puts items at every step in every look, then one in Hecho', () => {
    const items = sampleItems(creatures());
    const shape = items.map(({ step, phase, look, agent, round }) => [
      step,
      phase,
      look,
      agent,
      round,
    ]);
    expect(shape).toEqual([
      ['sconcept', 'doing', 'working', null, 1],
      ['sconcept', 'review', 'yours', null, 2],
      ['sanimate', 'doing', 'working', null, 1],
      ['sanimate', 'review', 'working', null, 1],
      ['spolish', 'doing', 'yours', null, 1],
      [null, null, 'done', null, 1],
    ]);
    expect(items.map(({ id }) => id)).toEqual([
      'CRI-1',
      'CRI-2',
      'CRI-3',
      'CRI-4',
      'CRI-5',
      'CRI-6',
    ]);
    expect(items[0]?.title).toBe('Tortuga musgosa');
    expect(items[1]?.title).toBe('Tortuga musgosa (2)');
  });

  it('shows an agent at work at a step any agent does, and another agent reviewing it', () => {
    const items = sampleItems(creatures()).filter((item) => item.step === 'sanimate');
    expect(items.map(({ phase, look, agent }) => [phase, look, agent])).toEqual([
      ['doing', 'working', null],
      ['review', 'working', null],
    ]);
  });
});

describe('sampleValue', () => {
  it('says a value for each kind, in the language on screen', () => {
    setLanguage('es');
    expect(sampleValue(part('fbiome'), 0)).toBe('Pantano');
    expect(sampleValue(part('fbiome'), 1)).toBe('Bosque');
    expect(sampleValue({ ...part('fdesc'), kind: 'level' }, 2)).toBe('alta');
    expect(sampleValue({ ...part('fdesc'), kind: 'yesno' }, 0)).toBe('sí');
    expect(sampleValue({ ...part('fdesc'), kind: 'number' }, 4)).toBe('7');
    expect(sampleValue({ ...part('fbiome'), options: [] }, 0)).toBe('—');
  });

  // On a main-only board the preview named «fix/example» (P2S-R3-2): the branch it starts on.
  it('names the branch a new item starts on, when the board says one', () => {
    expect(sampleValue({ ...part('fdesc'), kind: 'branch' }, 0)).toBe('fix/example');
    expect(sampleValue({ ...part('fdesc'), kind: 'branch', initial: 'main' }, 0)).toBe('main');
  });
});

describe('sampleRaw', () => {
  it('stores values the way items do: choice ids, every box ticked, yes', () => {
    expect(sampleRaw(part('fbiome'), 1)).toBe('cwood');
    expect(sampleRaw(part('fsteps'), 0)).toBe(JSON.stringify(['cone', 'ctwo']));
    expect(sampleRaw({ ...part('fdesc'), kind: 'yesno' }, 0)).toBe('yes');
  });
});

describe('sampleFacts', () => {
  it('fills what a step starts with and leaves its own handoff empty while it is done', () => {
    const def = creatures();
    const doing = sampleFacts(def, 'sanimate', 'doing');
    expect(doing.evidence).toEqual({ eart: 2, eswamp: 2 });
    expect(doing.fields.fdesc).toBeTruthy();
    expect(handoffCheck(def, 'sanimate', doing.engine).missing.map(({ ref }) => ref)).toEqual([
      'eanim',
      'fsteps',
    ]);
  });

  it('has the handoff complete under review', () => {
    const def = creatures();
    const review = sampleFacts(def, 'sanimate', 'review');
    expect(handoffCheck(def, 'sanimate', review.engine).ok).toBe(true);
    expect(review.evidence.eanim).toBe(1);
  });
});

// P5-R3-16: on a design board whose «En el repositorio» starts «no», the preview's sample still
// showed a branch, a diff and «Falta probarlo de punta a punta». The sample follows the board's
// own fields: what is asked only when a field says so is left out when the sample's field does not.
describe('the sample follows the board’s own fields', () => {
  const design = () => instantiate(requireTemplate('design'), 'es', {}, sequenceIds());
  const ref = (def: BoardDefinition, name: string) =>
    Object.values(def.parts).find((p) => p.name === name)?.id ?? name;

  it('gives a yes or no the value the board starts it with', () => {
    const def = design();
    const repo = def.parts[ref(def, 'En el repositorio')];
    if (!repo) throw new Error('no repo part');
    expect(sampleRaw(repo, 0)).toBe('no');
    setLanguage('es');
    expect(sampleValue(repo, 1)).toBe('no');
  });

  it('leaves out what a field the sample does not set asks for: the branch and the diff', () => {
    const def = design();
    const skipped = sampleSkipped(def);
    expect(skipped.has(ref(def, 'Rama'))).toBe(true);
    expect(skipped.has(ref(def, 'Cambios'))).toBe(true);
    expect(skipped.has(ref(def, 'A y B'))).toBe(true);
    expect(skipped.has(ref(def, 'Imágenes'))).toBe(false);
    const create = def.steps[0];
    if (!create) throw new Error('no step');
    const review = sampleFacts(def, create.id, 'review');
    expect(review.evidence[ref(def, 'Cambios')]).toBeUndefined();
    expect(review.fields[ref(def, 'Rama')]).toBeUndefined();
    expect(review.evidence[ref(def, 'Imágenes')]).toBe(1);
  });

  it('keeps what a board always asks for', () => {
    expect(sampleSkipped(creatures()).size).toBe(0);
  });
});
