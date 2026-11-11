import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import type { Route } from '../selection.ts';
import { boardIcon } from '../shell/rail-model.ts';
import { NavBody, type NavBodyProps, navOn } from './NavSheet.tsx';

afterEach(() => setLanguage('en'));

const props = (route: Route, o: Partial<NavBodyProps> = {}): NavBodyProps => ({
  route,
  toca: 6,
  atasco: 1,
  boards: [
    { name: 'Errores', icon: boardIcon('bug'), yours: 2, open: 5 },
    { name: 'Tareas', icon: boardIcon(null), yours: 0, open: 6, letter: 'T' },
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
    // Yours / open, as the rail says it, and the letter the rail puts on a repeated icon.
    expect(html).toMatch(
      /Errores<\/span><span class="pair"><span class="n you"><span class="nv" data-v="2".*?\/ <span class="n"><span class="nv" data-v="5"/,
    );
    expect(html).toContain('<i class="ltr">T</i>');
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

describe('the boards on the nav sheet', () => {
  it('draws each board with the icon the rail gives it, a type icon too', () => {
    const rail = render(
      props(
        { view: 'toca' },
        { boards: [{ name: 'Tareas', icon: boardIcon('checklist'), yours: 0, open: 2 }] },
      ),
    );
    const plain = render(
      props(
        { view: 'toca' },
        { boards: [{ name: 'Tareas', icon: boardIcon(null), yours: 0, open: 2 }] },
      ),
    );
    expect(boardIcon('checklist').kind).toBe('type');
    expect(rail).not.toBe(plain);
  });
});
