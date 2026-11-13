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
  boards: [
    { name: 'Errores', icon: boardIcon('bug'), yours: 2, open: 5 },
    { name: 'Tareas', icon: boardIcon(null), yours: 0, open: 6, letter: 'T' },
  ],
  onGo: () => {},
  onPrefs: () => {},
  ...o,
});
const render = (p: NavBodyProps) => renderToStaticMarkup(createElement(NavBody, p));

describe('NavBody (mobile mock 5)', () => {
  it('lists Te toca, the boards read only with their counts, Preferences and where the rest is', () => {
    const html = render(props({ view: 'toca' }));
    const order = [
      'Your turn',
      'boards · read only',
      'Errores',
      'Tareas',
      'class="foot"',
      'Preferences',
      'class="desk"',
      'Studio and Settings are on the computer.',
    ];
    let at = -1;
    for (const w of order) {
      const i = html.indexOf(w, at + 1);
      expect(i, w).toBeGreaterThan(at);
      at = i;
    }
    expect(html).toContain('class="n you"');
    // Yours / open, as the rail says it, and the letter the rail puts on a repeated icon.
    expect(html).toMatch(
      /Errores<\/span><span class="pair"><span class="n you"><span class="nv" data-v="2".*?\/ <span class="n"><span class="nv" data-v="5"/,
    );
    expect(html).toContain('<i class="ltr">T</i>');
  });

  it('offers nothing the phone cannot do: no Atasco row, no New board', () => {
    const html = render(props({ view: 'toca' }));
    expect(html).not.toContain('Stuck');
    expect(html).not.toContain('New board');
    expect(html).not.toContain('class="nrow add"');
  });

  it('marks where you are', () => {
    const html = render(props({ view: 'board', board: 'Tareas' }));
    expect(html.match(/class="nrow on"/g)).toHaveLength(1);
    expect(html).toMatch(/class="nrow on"[^>]*aria-current="page"[^>]*>.*?Tareas/);
  });

  it('gives every row, the label and the desk line a data-i, in order, for the sheet to resolve them', () => {
    const html = render(props({ view: 'toca' }));
    const is = [...html.matchAll(/data-i="(\d+)"/g)].map((m) => Number(m[1]));
    expect(is).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const html = render(props({ view: 'toca' }));
    for (const w of [
      'Te toca',
      'tableros · solo lectura',
      'Preferencias',
      'Studio y Configuración están en el ordenador.',
    ])
      expect(html).toContain(w);
    expect(html).not.toContain('Nuevo tablero');
  });
});

describe('navOn', () => {
  it('reads the current place from the route', () => {
    expect(navOn({ view: 'toca' })).toBe('toca');
    expect(navOn({ view: 'atasco', item: 'X-1' })).toBe('toca');
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
