import { afterEach, describe, expect, it } from 'vitest';
import { instantiate, requireTemplate } from '../../../../src/core/board/templates.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { Move } from '../../types.ts';
import { planMoves } from './moves.ts';
import { pickOf, pickWays } from './pick.ts';

const def = instantiate(requireTemplate('ideaboard'), 'es', {}, undefined, { keep: true });
const OPTIONS = '### A · SQLite local (recomendada)\nLocal.\n\n### B · Backend\nEn la nube.';
const word = (state: string) =>
  state === 'done' ? 'Hecho' : (def.steps.find(({ id }) => id === state)?.name ?? state);
const move = (to: string, extra: Partial<Move> = {}): Move =>
  ({ to, turn: 'agent', reasonRequired: false, ...extra }) as Move;

afterEach(() => setLanguage('en'));

describe('picking an option as you approve', () => {
  it('offers the options on your review of an item that carries two or more', () => {
    const at = { state: 'refine__review', fields: { options: OPTIONS } };
    expect(pickOf(def, at, undefined)?.options.map(({ letter }) => letter)).toEqual(['A', 'B']);
    // It starts on the agent's recommendation, then on what you picked before.
    expect(pickOf(def, at, undefined)?.start).toBe('A');
    const chosen = {
      option: 'B',
      name: 'Backend',
      at: 'T',
      by: 'you',
      step: 'refine',
      stepName: 'Refinar',
    };
    expect(pickOf(def, at, chosen)?.start).toBe('B');
  });

  it('offers nothing while doing, with one option, or off a board', () => {
    expect(
      pickOf(def, { state: 'design', fields: { options: OPTIONS } }, undefined),
    ).toBeUndefined();
    const one = { state: 'refine__review', fields: { options: '### A · Solo' } };
    expect(pickOf(def, one, undefined)).toBeUndefined();
    expect(pickOf(undefined, one, undefined)).toBeUndefined();
  });

  it('names every way on for the pick, side by side, and keeps the send-back apart', () => {
    setLanguage('es');
    const plan = planMoves(
      [
        move('planit'),
        move('design', { reasonRequired: true }),
        move('done', { turn: 'none', closes: 'done' }),
      ],
      { own: false, word },
    );
    const { ways, rest } = pickWays(plan, def, 'design', word);
    expect(ways.map(({ label, move: m }) => [label, m.to])).toEqual([
      ['Elegir → Planificar', 'planit'],
      ['Elegir y cerrar', 'done'],
    ]);
    expect(rest.primary).toBeNull();
    expect(rest.quiet.map(({ kind }) => kind)).toEqual(['sendback']);
    setLanguage('en');
    expect(pickWays(plan, def, 'design', word).ways.map(({ label }) => label)).toEqual([
      'Choose → Planificar',
      'Choose and close',
    ]);
  });
});
