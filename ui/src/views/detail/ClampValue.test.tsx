import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClampValue } from './ClampValue.tsx';

describe('ClampValue', () => {
  it('holds a long value to a few wrapped lines, never a hard cut on one line', () => {
    const html = renderToStaticMarkup(
      <ClampValue>Que el botón Guardar funcione en Safari y en Firefox, con el teclado</ClampValue>,
    );
    expect(html).toContain('class="dv-clamp"');
    expect(html).toContain('Que el botón Guardar');
  });

  it('offers "ver todo" only once it measures the value cut', () => {
    const html = renderToStaticMarkup(<ClampValue>corto</ClampValue>);
    expect(html).not.toContain('<button');
  });
});
