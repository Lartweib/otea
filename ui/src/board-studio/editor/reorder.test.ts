import { afterEach, describe, expect, it } from 'vitest';
import { creatures } from '../../../../src/core/board/testing.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { reorderChoices } from './reorder.ts';

afterEach(() => setLanguage('en'));

describe('reorderChoices, the Mover menu of a step', () => {
  it('names the step it moves before or after, never a direction alone', () => {
    setLanguage('es');
    expect(reorderChoices(creatures(), 'sanimate')).toEqual([
      { dir: -1, text: 'Mover antes de Concepto' },
      { dir: 1, text: 'Mover después de Pulir' },
    ]);
    setLanguage('en');
    expect(reorderChoices(creatures(), 'sanimate')).toEqual([
      { dir: -1, text: 'Move before Concepto' },
      { dir: 1, text: 'Move after Pulir' },
    ]);
  });

  it('offers only the way that exists at either end, and nothing for a lone step', () => {
    setLanguage('es');
    expect(reorderChoices(creatures(), 'sconcept')).toEqual([
      { dir: 1, text: 'Mover después de Animar' },
    ]);
    expect(reorderChoices(creatures(), 'spolish')).toEqual([
      { dir: -1, text: 'Mover antes de Animar' },
    ]);
    const lone = creatures();
    lone.steps = lone.steps.slice(0, 1);
    expect(reorderChoices(lone, 'sconcept')).toEqual([]);
  });

  it('says an unnamed neighbour as unnamed', () => {
    setLanguage('es');
    const def = creatures();
    (def.steps[0] as { name: string }).name = '  ';
    expect(reorderChoices(def, 'sanimate')[0]?.text).toBe('Mover antes de un paso sin nombre');
  });
});
