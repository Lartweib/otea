import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n.ts';
import { StepChips } from './BoardView.tsx';

afterEach(() => setLanguage('en'));

// The Matriz chip came last in the row of step chips, off a 390 px screen until you scrolled it
// (P7-R2-11). It is a view, not a step: it leads the row.
describe('the step chips on the phone', () => {
  it('lead with Matriz, then Todos and each step', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(
      <StepChips
        chips={[
          { key: null, label: 'Todos', count: 5 },
          { key: 'refinar', label: 'Refinar', count: 4 },
          { key: 'hecho', label: 'Hecho', count: 1 },
        ]}
        on={null}
        onPick={() => undefined}
        matrix={{ on: false, pick: () => undefined }}
      />,
    );
    const labels = [...html.matchAll(/<button[^>]*>([^<]*)/g)].map((m) => m[1]?.trim());
    expect(labels).toEqual(['Matriz', 'Todos', 'Refinar', 'Hecho']);
  });
});
