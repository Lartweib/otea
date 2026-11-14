import { afterEach, describe, expect, it } from 'vitest';
import type { Numbers, PerformanceRow } from '../../src/core/board/performance.ts';
import { setLanguage } from './i18n/i18n.ts';
import { labelOf, MIN_HANDOFFS, readingOf, roundsText, spanText } from './performance.ts';

afterEach(() => setLanguage('en'));

const numbers = (handoffs: number, sentBack: number): Numbers => ({
  handoffs,
  sentBack,
  finishedSteps: 0,
  rounds: 0,
  itemsFinished: 0,
  discards: 0,
  medianClaimToHandoffMs: null,
});

const row = (family: string, effort: string, handoffs: number, sentBack: number) =>
  ({ family, effort, ...numbers(handoffs, sentBack), models: [], steps: [] }) as PerformanceRow;

describe('labelOf: a row as the table names it', () => {
  it('says not declared for a model or an effort the agent could not read', () => {
    expect(labelOf(row('unknown', 'high', 1, 0))).toBe('not declared · high');
    setLanguage('es');
    expect(labelOf(row('opus', 'unknown', 1, 0))).toBe('opus · sin declarar');
  });
});

describe('readingOf: one plain sentence when the data is enough', () => {
  it('reads only rows whose model and effort were declared', () => {
    setLanguage('es');
    const rows = [
      row('opus', 'high', 10, 0),
      row('unknown', 'high', 10, 9),
      row('sonnet', 'unknown', 10, 9),
    ];

    expect(readingOf(rows)).toBe('Con opus · high, ninguna entrega vuelve.');
    expect(readingOf([row('unknown', 'unknown', 10, 9)])).toBeNull();
  });

  it('sets the model whose handoffs come back most beside the one they come back least', () => {
    setLanguage('es');
    const rows = [
      row('sonnet', 'medium', 12, 4),
      row('opus', 'high', 16, 2),
      row('haiku', 'low', 9, 2),
    ];

    expect(readingOf(rows)).toBe(
      'Con sonnet · medium, 1 de cada 3 entregas vuelve; con opus · high, 1 de cada 8.',
    );
    setLanguage('en');
    expect(readingOf(rows)).toBe(
      'With sonnet · medium, 1 in 3 handoffs comes back; with opus · high, 1 in 8.',
    );
  });

  it('says none come back, and leaves out rows with too few handoffs', () => {
    setLanguage('es');
    const rows = [row('opus', 'high', 10, 0), row('sonnet', 'medium', MIN_HANDOFFS - 1, 3)];

    expect(readingOf(rows)).toBe('Con opus · high, ninguna entrega vuelve.');
  });

  it('says nearly every one comes back when that is so', () => {
    setLanguage('en');
    expect(readingOf([row('haiku', 'low', 6, 5)])).toBe(
      'With haiku · low, nearly every handoff comes back.',
    );
  });

  it('says nothing while no row has enough handoffs', () => {
    expect(readingOf([row('opus', 'high', MIN_HANDOFFS - 1, 1)])).toBeNull();
    expect(readingOf([])).toBeNull();
  });
});

describe('the figures', () => {
  it('writes a span in minutes, hours or days', () => {
    expect(spanText(null)).toBe('–');
    expect(spanText(20_000)).toBe('<1 min');
    expect(spanText(18 * 60_000)).toBe('18 min');
    expect(spanText(5 * 60 * 60_000)).toBe('5 h');
    expect(spanText(3 * 24 * 60 * 60_000)).toBe('3 days');
  });

  it('writes rounds per finished step with one decimal, in the language on screen', () => {
    setLanguage('es');
    expect(roundsText({ ...numbers(4, 1), finishedSteps: 2, rounds: 3 })).toBe('1,5');
    expect(roundsText(numbers(4, 1))).toBe('–');
  });
});
