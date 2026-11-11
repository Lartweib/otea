import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Unroll } from './Unroll.tsx';

// A panel that opens where it stands (a field's menu beside its field, the picker under its +, the
// tray under its button) wears the pop's grammar: the line, the surface, its content.
describe('an unrolled panel', () => {
  it('draws the line, then the surface holding its content', () => {
    const html = renderToStaticMarkup(
      createElement(
        Unroll,
        { open: true, label: 'Severity', className: 'cz-menuunroll' },
        createElement('p', { 'data-i': '' }, 'hi'),
      ),
    );
    expect(html).toBe(
      '<div class="pop e-top st-unroll cz-menuunroll" role="dialog" aria-label="Severity"><i class="pline"><i class="glint"></i></i><div class="psurf"><div class="pin"><p data-i="">hi</p></div></div></div>',
    );
  });

  it('rises from the bottom edge when it opens upward', () => {
    const html = renderToStaticMarkup(
      createElement(Unroll, { open: true, edge: 'bottom', label: 'x' }, 'x'),
    );
    expect(html).toContain('class="pop e-bottom st-unroll"');
  });

  it('draws nothing while it was never opened', () => {
    expect(renderToStaticMarkup(createElement(Unroll, { open: false, label: 'x' }, 'x'))).toBe('');
  });
});
