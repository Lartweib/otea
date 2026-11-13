import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Numbers, PerformanceView } from '../../../src/core/board/performance.ts';
import { setLanguage } from '../i18n/i18n.ts';
import { renderIn, testApp } from '../shell/test-app.ts';
import { PerformanceBody } from './ModelPerformance.tsx';

afterEach(() => setLanguage('en'));

const numbers = (handoffs: number, sentBack: number): Numbers => ({
  handoffs,
  sentBack,
  finishedSteps: 4,
  rounds: 6,
  itemsFinished: 3,
  discards: 1,
  medianClaimToHandoffMs: 18 * 60_000,
});

const row = (family: string, effort: string, handoffs: number, sentBack: number) => ({
  family,
  effort,
  ...numbers(handoffs, sentBack),
  models: [{ model: `claude-${family}-5`, ...numbers(handoffs, sentBack) }],
  steps: [{ board: 'Errores', step: 'sfix', stepName: 'Arreglar', ...numbers(handoffs, sentBack) }],
});

const view = (rows: PerformanceView['rows']): PerformanceView => ({
  rows,
  total: numbers(0, 0),
  boards: ['Errores'],
  since: null,
});

const render = (rows: PerformanceView['rows']) =>
  renderIn(testApp(), createElement(PerformanceBody, { view: view(rows), oneBoard: false }));

describe('Rendimiento', () => {
  it('reads the data in one sentence, then a row per model family and effort', () => {
    setLanguage('es');
    const html = render([row('sonnet', 'medium', 12, 4), row('opus', 'high', 16, 2)]);

    expect(html).toContain(
      '<p class="perf-reading">Con sonnet · medium, 1 de cada 3 entregas vuelve; con opus · high, 1 de cada 8.</p>',
    );
    expect(html).toContain('<span class="perf-name">sonnet · medium</span>');
    expect(html).toContain('<th scope="col">Modelo · esfuerzo</th>');
    expect(html).toContain('<td class="num">1,5</td>');
    expect(html).toContain('<td class="num">18 min</td>');
  });

  it('draws how many handoffs come back as a meter, with the count in its tip', () => {
    const html = render([row('sonnet', 'medium', 12, 3)]);

    expect(html).toContain('data-tip="3 of 12 handoffs came back for another round"');
    expect(html).toContain('<i style="width:25%"></i>');
    expect(html).toContain('<span class="perf-fig">25%</span>');
  });

  it('says honestly when the handoffs are too few to read, and fades their meter', () => {
    const html = render([row('haiku', 'low', 2, 1)]);

    expect(html).toContain('the numbers do not say much yet');
    expect(html).toContain('data-few="true"');
    expect(html).not.toContain('perf-reading');
  });

  it('says there is nothing yet, and how an agent declares its profile', () => {
    const html = render([]);

    expect(html).toContain('No handoffs yet by agents with a profile in this period.');
    expect(html).toContain('<code class="pj-code">otea profile</code>');
    expect(html).not.toContain('<table');
  });
});
