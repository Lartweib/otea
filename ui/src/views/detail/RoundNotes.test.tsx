import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { errores } from '../../../../src/core/board/testing.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { ItemEvent } from '../../types.ts';
import { RoundNotes } from './BoardSections.tsx';
import { stepRounds } from './board-item.ts';

afterEach(() => setLanguage('en'));

const you = { kind: 'human' as const, name: 'tú' };
const mender = { kind: 'agent' as const, name: 'mender' };
let id = 0;
const ev = (from: string, to: string, actor: ItemEvent['actor'], at: string, data = {}) =>
  ({ id: ++id, type: 'transitioned', actor, at, data: { from, to, ...data } }) as ItemEvent;
const created = {
  id: ++id,
  type: 'created',
  actor: you,
  at: '2026-01-01T00:00:00Z',
  data: { state: 'striage' },
} as ItemEvent;
// Triar → Arreglar (sent back once in its review) → back to Triar.
const events: ItemEvent[] = [
  created,
  ev('striage', 'sfix', you, '2026-01-02T00:00:00Z'),
  ev('sfix', 'sfix__review', mender, '2026-01-03T00:00:00Z', { note: 'Probé el muelle.' }),
  ev('sfix__review', 'sfix', you, '2026-01-04T00:00:00Z', { reason: 'Sigue cayendo.' }),
  ev('sfix', 'sfix__review', mender, '2026-01-05T00:00:00Z', { note: 'Ya no cae.' }),
  ev('sfix__review', 'striage', you, '2026-01-06T00:00:00Z', { reason: 'Otra categoría.' }),
];
const html = (state: string, list = events) =>
  renderToStaticMarkup(<RoundNotes steps={stepRounds(errores(), state, list)} />);
const groups = (markup: string) =>
  [...markup.matchAll(/<div class="bi-step"([^>]*)>/g)].map(([, attrs]) => ({
    open: attrs?.includes('data-open') ?? false,
    current: attrs?.includes('data-current') ?? false,
  }));
const railed = (markup: string) =>
  [...markup.matchAll(/<div class="bi-step"([^>]*)>/g)].map(([, attrs]) =>
    attrs?.includes('data-rail'),
  );

describe('RoundNotes: who did each round', () => {
  it('reads “Ronda 2 · mender (opus · high)”, the profile in mono in parentheses', () => {
    setLanguage('es');
    const opus = { harness: 'claude-code', model: 'opus', effort: 'high', family: 'opus' };
    const list = events.map((e) => (e.actor.kind === 'agent' ? { ...e, profile: opus } : e));
    expect(html('sfix__review', list.slice(0, 5))).toContain(
      '<span class="rh"><span class="rk">Ronda 2</span><span class="rw">· <b>mender</b> <span class="prof">(opus <i>·</i> high)</span></span></span>',
    );
  });
});

describe('RoundNotes: the item’s whole history, grouped by step', () => {
  it('folds each earlier step into one line with its rounds and outcome; the current one is open', () => {
    setLanguage('es');
    const markup = html('striage');
    expect(groups(markup)).toEqual([
      { open: false, current: false },
      { open: true, current: true },
    ]);
    expect(markup).toContain('Arreglar');
    expect(markup).toContain('2 rondas');
    expect(markup).toContain('devuelta a Triar');
    expect(markup).toMatch(/aria-expanded="false"/);
    expect(markup).toMatch(/aria-expanded="true"/);
    // A folded step still carries its rounds and notes, to unfold.
    expect(markup).toContain('Sigue cayendo.');
    expect(markup).toContain('Ya no cae.');
  });

  it('marks only the current step’s latest round as this round', () => {
    const markup = html('striage');
    expect(markup.match(/this round/g)).toHaveLength(1);
    expect(markup.match(/class="rd on"/g)).toHaveLength(1);
  });

  it('draws one step exactly as before, with no fold, while the item never left it', () => {
    const markup = html('striage', [created]);
    expect(groups(markup)).toEqual([]);
    expect(markup).toContain('First round: no notes yet.');
  });

  it('folds every step of a closed item but its last, which says how it closed', () => {
    const closed = [...events.slice(0, 5), ev('sfix__review', 'done', you, '2026-01-07T00:00:00Z')];
    const markup = html('done', closed);
    expect(groups(markup)).toEqual([
      { open: false, current: false },
      { open: true, current: false },
    ]);
    expect(markup).toContain('<span class="bo">done</span>');
    expect(markup).not.toContain('this round');
  });
});

describe('RoundNotes and the compare rail under it', () => {
  it('marks the step whose rounds the rail shows: the current one, or the one chosen', () => {
    const steps = stepRounds(errores(), 'striage', events);
    expect(railed(renderToStaticMarkup(<RoundNotes steps={steps} rail="striage" />))).toEqual([
      false,
      true,
    ]);
    expect(railed(renderToStaticMarkup(<RoundNotes steps={steps} rail="sfix" />))).toEqual([
      true,
      false,
    ]);
  });
});
