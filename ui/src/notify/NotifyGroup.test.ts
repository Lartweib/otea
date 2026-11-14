import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../../../src/core/notify/planner.ts';
import { setLanguage } from '../i18n/i18n.ts';
import { NotifyBody, type NotifyBodyProps } from './NotifyGroup.tsx';
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
    expect(html).toContain('Como mucho uno por ítem cada pocos minutos');
    expect(html).not.toContain('role="switch"');
  });

  it('shows what is told, all on by default, and how to turn them off', () => {
    setLanguage('es');
    const html = render({ view: { ...view, subscribed: true } });
    expect(html.match(/role="switch" aria-checked="true"/g)).toHaveLength(3);
    expect(html).toContain('role="switch" aria-checked="false"');
    expect(html).toContain('Te toca');
    expect(html).toContain('Un agente contestó tu nota');
    expect(html).toContain('Algo se atascó');
    expect(html).toContain('Horas de silencio');
    expect(html).toContain('Desactivar en este teléfono');
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
