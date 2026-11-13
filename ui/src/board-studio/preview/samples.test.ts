import { afterEach, describe, expect, it } from 'vitest';
import { handoffCheck } from '../../../../src/core/board/engine.ts';
import { creatures } from '../../../../src/core/board/testing.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import {
  boardPrefix,
  itemPrefix,
  sampleFacts,
  sampleId,
  sampleItems,
  sampleRaw,
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
