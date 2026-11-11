import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Menu, MenuPhase } from './menu.ts';
import { Sheet } from './Sheet.tsx';

const menu = (phase: MenuPhase): Menu => ({
  phase,
  open: phase === 'open',
  toggle: () => {},
  close: () => {},
  ref: () => {},
});

const render = (phase: MenuPhase, title?: string) =>
  renderToStaticMarkup(createElement(Sheet, { menu: menu(phase), label: 'Agents', title }, 'body'));

describe('Sheet (the phone bottom sheet behind a menu)', () => {
  it('draws nothing while its menu is closed', () => {
    expect(render('closed')).toBe('');
  });

  it('is the bottom sheet: scrim, the sheet with its grab, the head and the content', () => {
    const html = render('open', 'Agents');
    expect(html).toContain('class="scrim"');
    expect(html).toMatch(/<div class="nsheet" role="dialog" aria-modal="true" aria-label="Agents"/);
    expect(html).toContain('<div class="grab" aria-hidden="true"></div>');
    expect(html).toContain('class="nsheet-head"');
    expect(html).toContain('Agents</span>');
    expect(html).toContain('body');
  });

  it('leaves the head out without a title', () => {
    expect(render('open')).not.toContain('nsheet-head');
  });
});
