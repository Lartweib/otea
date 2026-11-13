import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import type { PhoneStatus, TailscaleCheck } from '../types.ts';
import { PhoneTransportView, type PhoneTransportViewProps, problemOf } from './PhoneTransport.tsx';

afterEach(() => setLanguage('en'));

const HOST = 'desk.tail1.ts.net';
const lan: PhoneStatus = {
  transport: 'lan',
  url: 'http://192.168.1.24:4400',
  reachable: true,
  tailscale: null,
};
const ready: TailscaleCheck = { state: 'ready', host: HOST, url: `https://${HOST}`, serving: true };
const tailscale: PhoneStatus = {
  transport: 'tailscale',
  url: `https://${HOST}`,
  reachable: true,
  tailscale: ready,
};

const render = (props: Partial<PhoneTransportViewProps>) =>
  renderToStaticMarkup(
    createElement(PhoneTransportView, {
      status: lan,
      setup: null,
      busy: false,
      canWrite: true,
      onChoose: () => {},
      onPair: () => {},
      ...props,
    }),
  );

describe('Configuración · Teléfono', () => {
  it('offers the three transports, the local network in use by default and the relay not yet', () => {
    setLanguage('es');
    const html = render({});

    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/aria-checked="true"[^>]*>.*Red local/s);
    expect(html).toContain('predeterminado');
    expect(html).toContain('Tailscale');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Relay de Otea/s);
    expect(html).toContain('todavía no disponible');
    expect(html).toContain('http://192.168.1.24:4400');
    expect(html).toContain('Otea responde');
    expect(html).toContain('solo entran tus dispositivos emparejados');
  });

  it('on Tailscale shows the HTTPS address, the phone steps and the public certificate note', () => {
    const html = render({ status: tailscale });

    expect(html).toMatch(/aria-checked="true"[^>]*>.*Tailscale/s);
    expect(html).toContain(`https://${HOST}`);
    expect(html).toContain('Install the Tailscale app.');
    expect(html).toContain('Log in with the same account as this computer.');
    expect(html).toContain('Scan the pairing code Otea shows.');
    expect(html).toContain('Certificate Transparency');
    expect(html).toContain(HOST);
  });

  it('says how to install Tailscale, without a button that installs it', () => {
    const setup: TailscaleCheck = {
      state: 'missing',
      install: {
        commands: ['winget install --id tailscale.tailscale'],
        link: 'https://tailscale.com/download/windows',
      },
    };
    const html = render({ setup });

    expect(html).toContain('Otea does not install it');
    expect(html).toContain('winget install --id tailscale.tailscale');
    expect(html).toContain('href="https://tailscale.com/download/windows"');
  });

  it('says the local network door is closed when nothing answers', () => {
    const html = render({ status: { ...lan, reachable: false } });

    expect(html).toContain('no answer');
    expect(html).toContain('otea serve --lan');
    const closed = render({ status: { ...lan, url: null, reachable: null } });
    expect(closed).toContain('no address to try');
    expect(closed).toContain('otea serve --lan');
    expect(render({})).not.toContain('otea serve --lan');
  });

  it('asks this computer’s browser to sign in before choosing', () => {
    const html = render({ canWrite: false, status: lan });

    expect(html).toContain('otea open');
    expect(html).not.toContain('role="radiogroup"');
  });
});

describe('what stops Tailscale', () => {
  it('names the command or the page that fixes it', () => {
    expect(problemOf({ state: 'logged_out', authUrl: null })).toMatchObject({
      key: 'phone.ts.loggedOut',
      commands: ['tailscale up'],
    });
    expect(
      problemOf({ state: 'no_https', settings: 'https://login.tailscale.com/admin/dns' }),
    ).toMatchObject({
      key: 'phone.ts.noHttps',
      link: { href: 'https://login.tailscale.com/admin/dns' },
    });
    expect(
      problemOf({ state: 'taken', host: HOST, target: 'http://127.0.0.1:3000' }),
    ).toMatchObject({
      commands: ['tailscale serve --https=443 off'],
    });
    expect(problemOf({ ...ready, serving: false })).toMatchObject({ key: 'phone.ts.notServing' });
    expect(problemOf(ready)).toBeNull();
  });
});
