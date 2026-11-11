import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import type { Route } from '../selection.ts';
import { boardIcon, NavBody, type NavBodyProps, navOn } from './NavSheet.tsx';

afterEach(() => setLanguage('en'));

const props = (route: Route, o: Partial<NavBodyProps> = {}): NavBodyProps => ({
  route,
  toca: 6,
  atasco: 1,
  boards: [
    { name: 'Errores', icon: 'bug', open: 5 },
    { name: 'Tareas', icon: null, open: 6 },
  ],
  onGo: () => {},
  onNewBoard: () => {},
  onPrefs: () => {},
  ...o,
});
const render = (p: NavBodyProps) => renderToStaticMarkup(createElement(NavBody, p));

describe('NavBody (mock:3584-3586)', () => {
  it('lists Te toca, Atasco, the boards with their open counts, New board, then Preferences', () => {
    const html = render(props({ view: 'toca' }));
    const order = [
      'Your turn',
      'Stuck',
      'boards',
      'Errores',
      'Tareas',
      'New board',
      'class="foot"',
      'Preferences',
    ];
    let at = -1;
    for (const w of order) {
      const i = html.indexOf(w, at + 1);
      expect(i, w).toBeGreaterThan(at);
      at = i;
    }
    expect(html).toContain('class="n you"');
    expect(html).toContain('class="n warn"');
    expect(html).toMatch(
      /Errores<\/span><span class="pair"><span class="n"><span class="nv" data-v="5"/,
    );
  });

  it('marks where you are', () => {
    const html = render(props({ view: 'board', board: 'Tareas' }));
    expect(html.match(/class="nrow on"/g)).toHaveLength(1);
    expect(html).toMatch(/class="nrow on"[^>]*aria-current="page"[^>]*>.*?Tareas/);
  });

  it('gives every row and the label a data-i, in order, for the sheet to resolve them', () => {
    const html = render(props({ view: 'toca' }));
    const is = [...html.matchAll(/data-i="(\d+)"/g)].map((m) => Number(m[1]));
    expect(is).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const html = render(props({ view: 'toca' }));
    for (const w of ['Te toca', 'Atasco', 'tableros', 'Nuevo tablero', 'Preferencias'])
      expect(html).toContain(w);
  });
});

describe('navOn', () => {
  it('reads the current place from the route', () => {
    expect(navOn({ view: 'toca' })).toBe('toca');
    expect(navOn({ view: 'atasco', item: 'X-1' })).toBe('atasco');
    expect(navOn({ view: 'board', board: 'Errores' })).toBe('board:Errores');
    expect(navOn({ view: 'lan' })).toBe('toca');
    expect(navOn({ view: 'triage' })).toBeNull();
  });
});

describe('boardIcon', () => {
  it("uses the board's icon when the mock's set has it, else the board", () => {
    expect(boardIcon('bug')).toBe('bug');
    expect(boardIcon('nonsense')).toBe('board');
    expect(boardIcon(null)).toBe('board');
  });
});
