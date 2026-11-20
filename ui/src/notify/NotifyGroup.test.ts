import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../../../src/core/notify/planner.ts';
import { setLanguage } from '../i18n/i18n.ts';
import { NotifyBody, type NotifyBodyProps, toggleMuted } from './NotifyGroup.tsx';
import { keyBytes } from './push-client.ts';

afterEach(() => setLanguage('en'));

const view = { target: 'device', key: 'BKEY', subscribed: false, prefs: DEFAULT_PREFS } as const;

const render = (props: Partial<NotifyBodyProps>) =>
  renderToStaticMarkup(
    createElement(NotifyBody, {
      offer: 'push',
      view,
      busy: false,
      problem: null,
      projects: [],
      onOn: () => {},
      onOff: () => {},
      onPrefs: () => {},
      ...props,
    }),
  );

describe('Preferencias › Avisos', () => {
  it('offers to turn them on, on a phone over HTTPS', () => {
    setLanguage('es');
    const html = render({});
    expect(html).toContain('Activar avisos');
    expect(html).toContain('Una ráfaga llega como un solo aviso');
    expect(html).not.toContain('role="switch"');
  });

  it('shows what is told, all on by default, and how to turn them off', () => {
    setLanguage('es');
    const html = render({ view: { ...view, subscribed: true } });
    expect(html.match(/role="switch" aria-checked="true"/g)).toHaveLength(4);
    expect(html.match(/role="switch" aria-checked="false"/g)).toHaveLength(2);
    expect(html).toContain('Te toca');
    expect(html).toContain('una revisión o una aprobación');
    expect(html).toContain('Un agente te pregunta');
    expect(html).toContain('Un agente contestó tu nota');
    expect(html).toContain('Algo se atascó');
    expect(html).toContain('Un agente dejó algo para después');
    expect(html).toContain('Horas de silencio');
    expect(html).toContain('Desactivar en este teléfono');
  });

  it('lets each project be muted, when there is more than one', () => {
    setLanguage('es');
    const projects = [
      { id: 'web-1', name: 'tienda-web' },
      { id: 'api-2', name: 'api' },
    ];
    const prefs = { ...DEFAULT_PREFS, muted: ['api-2'] };
    const html = render({ view: { ...view, subscribed: true, prefs }, projects });
    expect(html).toContain('proyectos');
    expect(html).toMatch(/role="switch" aria-checked="true"[^>]*>.*?tienda-web/s);
    expect(html).toMatch(/role="switch" aria-checked="false"[^>]*>(?:(?!role="switch").)*api/s);
    const one = render({ view: { ...view, subscribed: true }, projects: projects.slice(0, 1) });
    expect(one).not.toContain('proyectos');
  });

  it('turns a project off and on again without touching the rest', () => {
    const projects = [
      { id: 'web-1', name: 'tienda-web' },
      { id: 'api-2', name: 'api' },
    ];
    expect(toggleMuted({ ...DEFAULT_PREFS, muted: ['x'] }, 'api-2', false).muted).toEqual([
      'x',
      'api-2',
    ]);
    expect(toggleMuted({ ...DEFAULT_PREFS, muted: ['api-2'] }, 'api-2', true).muted).toEqual([]);
    expect(projects).toHaveLength(2);
  });

  it('shows the quiet hours once they are on', () => {
    const quiet = { ...DEFAULT_PREFS, quiet: { from: '22:00', to: '08:00' } };
    const html = render({ view: { ...view, subscribed: true, prefs: quiet } });
    expect(html).toContain('value="22:00"');
    expect(html).toContain('value="08:00"');
  });

  it.each([
    ['needs-https', 'over HTTPS only'],
    ['needs-home-screen', 'only once it is on the Home Screen'],
    ['unsupported', 'does not receive notifications'],
    ['blocked', 'blocked for Otea'],
  ] as const)('explains %s in one line, with no switches', (offer, words) => {
    const html = render({ offer });
    expect(html).toContain(words);
    expect(html).not.toContain('role="switch"');
  });

  it('gives the desktop app its choices and no unsubscribe', () => {
    const html = render({
      offer: 'desktop',
      view: { ...view, target: 'desktop', subscribed: true },
    });
    expect(html).toContain('role="switch"');
    expect(html).toContain('the system’s notifications');
    expect(html).not.toContain('Turn off on this phone');
  });

  it('says when turning them on failed', () => {
    expect(render({ problem: 'notify.failed' })).toContain('could not be turned on');
  });
});

describe('keyBytes', () => {
  it('reads the key the server gives, base64url', () => {
    expect([...keyBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});
