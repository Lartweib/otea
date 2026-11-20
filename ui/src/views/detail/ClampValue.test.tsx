import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClampValue } from './ClampValue.tsx';

describe('ClampValue', () => {
  it('offers "ver todo" only once it measures the value cut', () => {
    const html = renderToStaticMarkup(<ClampValue>corto</ClampValue>);
    expect(html).not.toContain('<button');
  });
});
