import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { plainLines } from '../triage.ts';
import { Delivered } from './Triage.tsx';

// Triage's card read a Brief raw: «**Problema:**» with its asterisks (P7-11).
describe('what a Triage card says the round hands in', () => {
  it('shows a long field’s lines without their Markdown marks', () => {
    const html = renderToStaticMarkup(
      <Delivered
        round={{
          figures: [],
          files: [],
          gate: undefined,
          pending: false,
          fields: [
            {
              ref: 'fbrief',
              name: 'Brief',
              value: plainLines('**Problema:** nadie sabe qué hizo el equipo.\n\n- uno'),
            },
          ],
        }}
      />,
    );
    expect(html).toContain('<dd>Problema: nadie sabe qué hizo el equipo.\n· uno</dd>');
    expect(html).not.toContain('**');
  });
});
