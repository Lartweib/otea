import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS } from '../../../src/core/notify/planner.ts';
import { setLanguage } from '../i18n/i18n.ts';
import { NotifyBody, type NotifyBodyProps, toggleMuted } from './NotifyGroup.tsx';
import { blockedHereOf, dropIfStale, keyBytes, staleSubscription } from './push-client.ts';
import { testPushWords } from './test-push.ts';

afterEach(() => {
  setLanguage('en');
  vi.unstubAllGlobals();
});

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

  it('names each end of the quiet hours for a screen reader', () => {
    setLanguage('es');
    const quiet = { ...DEFAULT_PREFS, quiet: { from: '22:00', to: '08:00' } };
    const html = render({ view: { ...view, subscribed: true, prefs: quiet } });
    expect(html).toContain('aria-label="Horas de silencio: desde"');
    expect(html).toContain('aria-label="Horas de silencio: hasta"');
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

describe('a test push and a blocked app', () => {
  const on = { ...view, subscribed: true };

  it('offers a test push once notifications are on, and says what came back', () => {
    setLanguage('es');
    expect(render({ view: on })).toMatch(/<button[^>]*>.*Enviar un aviso de prueba<\/button>/);
    expect(render({})).not.toContain('Enviar un aviso de prueba');
    const html = render({ view: on, tested: 'Enviado: debería llegarte en unos segundos.' });
    expect(html).toContain('role="status"');
    expect(html).toContain('Enviado: debería llegarte en unos segundos.');
  });

  it('words each answer from the push service plainly', () => {
    setLanguage('es');
    expect(testPushWords({ result: 'sent', status: 201, detail: '' })).toBe(
      'Enviado: debería llegarte en unos segundos.',
    );
    expect(testPushWords({ result: 'failed', status: 403, detail: 'bad key' })).toBe(
      'El servicio de avisos rechazó el envío (403): bad key',
    );
    expect(testPushWords({ result: 'off', status: null, detail: '' })).toBe(
      'Este dispositivo no tiene los avisos activados.',
    );
    expect(testPushWords({ result: 'failed', status: null, detail: 'fetch failed' })).toBe(
      'No se pudo llegar al servicio de avisos: fetch failed',
    );
    expect(testPushWords({ result: 'gone', status: 410, detail: '' })).toContain('(410)');
    // Accepted, but this app cannot show it: Android's own switch for the installed app.
    expect(testPushWords({ result: 'sent', status: 201, detail: '' }, { blocked: true })).toContain(
      'Ajustes › Apps › Otea › Notificaciones',
    );
  });

  it('says Android blocks the app’s notifications, with where to allow them, and checks again', () => {
    setLanguage('es');
    const denied = render({ offer: 'blocked', platform: 'android' });
    expect(denied).toContain(
      'Android tiene bloqueados los avisos de esta app: Ajustes › Apps › Otea › Notificaciones.',
    );
    expect(denied).toMatch(/<button[^>]*>.*Comprobar de nuevo<\/button>/);
    // On for the server, but the browser lost its subscription.
    const lost = render({ view: on, platform: 'android', blockedHere: true });
    expect(lost).toContain('Android tiene bloqueados los avisos de esta app');
    expect(lost).toContain('Comprobar de nuevo');
    expect(render({ view: on, platform: 'android' })).not.toContain('Android tiene bloqueados');
  });
});

// TS-2: Android's own switch for the installed app cannot be read by the page, so a test push
// "sent" may never show: the phone says where to look, as the desk does.
describe('a test push from the phone', () => {
  it('says where to look on this phone when it does not arrive', () => {
    setLanguage('es');
    const sent = { result: 'sent', status: 201, detail: '' } as const;
    expect(testPushWords(sent, { here: 'android' })).toBe(
      'Enviado: debería llegarte en unos segundos. Si no llega, revisa en este teléfono Ajustes › Apps › Otea › Notificaciones.',
    );
    expect(testPushWords(sent, { here: 'ios' })).toContain('Ajustes › Notificaciones › Otea');
    expect(testPushWords(sent, { here: 'other' })).toContain('Si no llega');
    setLanguage('en');
    expect(testPushWords(sent, { here: 'android' })).toContain(
      'If it does not arrive, check Settings › Apps › Otea › Notifications on this phone.',
    );
  });
});

// TS-3: Android's block, then allow, leaves the browser with no subscription while the server
// keeps pushing to the dead one (and the desk says Listo). The phone tells the server it has none.
describe('a subscription the browser lost', () => {
  const on = { ...view, subscribed: true };

  it('is stale when the server has one and this browser has none', () => {
    expect(staleSubscription(on, { permission: 'granted', subscribed: false })).toBe(true);
    expect(staleSubscription(on, { permission: 'default', subscribed: false })).toBe(true);
    expect(staleSubscription(on, { permission: 'granted', subscribed: true })).toBe(false);
    // Cannot tell (no service worker yet): never a guess.
    expect(staleSubscription(on, { permission: 'granted', subscribed: null })).toBe(false);
    expect(staleSubscription(view, { permission: 'granted', subscribed: false })).toBe(false);
    expect(
      staleSubscription({ ...on, target: 'desktop' }, { permission: 'granted', subscribed: false }),
    ).toBe(false);
  });

  it('says notifications stopped here, beside Activar avisos', () => {
    setLanguage('es');
    const html = render({ lost: true, platform: 'android' });
    expect(html).toContain('Este teléfono dejó de recibir los avisos');
    expect(html).toContain('Activar avisos');
    expect(render({})).not.toContain('dejó de recibir');
  });

  // The server dropped it on its own (its push service said gone): the phone hears it from the
  // server, not from what it kept itself.
  it('says so too when the server is the one that remembers it', () => {
    setLanguage('es');
    expect(render({ view: { ...view, lost: true } })).toContain(
      'Este teléfono dejó de recibir los avisos',
    );
  });

  it('tells the server it was lost, not turned off, so its choices stay', async () => {
    const fetch = vi.fn(async () => Response.json({ ...view, lost: true }));
    vi.stubGlobal('fetch', fetch);
    const next = await dropIfStale(on, { permission: 'granted', subscribed: false });
    expect(next).toMatchObject({ lost: true });
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(/\/api\/notify\/lost$/);
  });
});

// TS-22: Android names the installed app after its project (its manifest's short_name, so three
// projects never make three icons all called Otea): where to look names that app.
describe('the installed app, by its name', () => {
  it('names it in Android’s settings path, on the phone and from the desk', () => {
    setLanguage('es');
    expect(render({ offer: 'blocked', platform: 'android', app: 'proj2' })).toContain(
      'Ajustes › Apps › proj2 › Notificaciones',
    );
    const sent = { result: 'sent', status: 201, detail: '' } as const;
    expect(testPushWords(sent, { here: 'android', app: 'proj2' })).toContain(
      'Ajustes › Apps › proj2 › Notificaciones',
    );
    expect(testPushWords(sent, { here: 'ios', app: 'proj2' })).toContain(
      'Ajustes › Notificaciones › proj2',
    );
    expect(testPushWords(sent, { blocked: true, app: 'proj2' })).toContain('› proj2 ›');
    expect(testPushWords(sent, { app: 'proj2', desk: true })).toContain(
      'Si no llega, revisa en el teléfono: Ajustes › Apps › proj2 › Notificaciones.',
    );
    setLanguage('en');
    expect(testPushWords(sent, { here: 'android', app: 'proj2' })).toContain(
      'Settings › Apps › proj2 › Notifications',
    );
  });

  it('falls back to Otea when it does not know the project', () => {
    setLanguage('es');
    expect(render({ offer: 'blocked', platform: 'android' })).toContain('› Otea ›');
  });
});

// TS-25: allowed again in Android's settings, the open app still reads them as denied until it is
// closed and opened again: the warning says so.
describe('allowed again while the app stays open', () => {
  it('says to close the app and open it again', () => {
    setLanguage('es');
    const html = render({ offer: 'blocked', platform: 'android', app: 'proj2' });
    expect(html).toContain('Si ya los permitiste, cierra proj2 del todo y vuelve a abrirla');
    setLanguage('en');
    expect(render({ offer: 'blocked', platform: 'android', app: 'proj2' })).toContain(
      'If you already allowed them, close proj2 completely and open it again',
    );
  });
});

// TS-7: right after Activar avisos, a read of this browser made before it subscribed still said
// "no subscription", and the red Android line showed at the moment of success.
describe('whether this browser blocks what the server sends', () => {
  const on = { ...view, subscribed: true };

  it('trusts only a read made after the last change', () => {
    const before = { permission: 'granted', subscribed: false, at: 1 };
    expect(blockedHereOf(on, before, 2)).toBe(false);
    expect(blockedHereOf(on, { ...before, permission: 'denied', at: 3 }, 2)).toBe(true);
    expect(blockedHereOf(on, { permission: 'granted', subscribed: true, at: 3 }, 2)).toBe(false);
    expect(blockedHereOf(on, null, 0)).toBe(false);
  });
});
