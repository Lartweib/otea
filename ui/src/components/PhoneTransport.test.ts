import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import type { PhoneStatus, TailscaleCheck } from '../types.ts';
import {
  opensBeforePairing,
  PhoneTransportView,
  type PhoneTransportViewProps,
  problemOf,
} from './PhoneTransport.tsx';

afterEach(() => setLanguage('en'));

const HOST = 'desk.tail1.ts.net';
const lan: PhoneStatus = {
  transport: 'lan',
  url: 'http://192.168.1.24:4400',
  reachable: true,
  tailscale: null,
  lanOpen: true,
  firewallPrompt: false,
};
const ready: TailscaleCheck = { state: 'ready', host: HOST, url: `https://${HOST}`, serving: true };
const tailscale: PhoneStatus = {
  transport: 'tailscale',
  url: `https://${HOST}`,
  reachable: true,
  tailscale: ready,
  lanOpen: false,
  firewallPrompt: false,
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
      onOpenLan: () => {},
      onCloseLan: () => {},
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

  // Only HTTPS lets the installed app open with the PC off: plain HTTP promises no such thing.
  it('says the local network works only while this computer is on, and Tailscale opens without it', () => {
    setLanguage('es');
    const local = render({});
    const away = render({ status: tailscale });

    expect(local).toContain('funciona solo mientras este equipo está encendido');
    expect(local).not.toContain('aunque este equipo esté apagado');
    expect(away).toContain('Otea se abre aunque este equipo esté apagado');
    expect(away).toContain('espera en cola');
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

  const closed: PhoneStatus = { ...lan, url: null, reachable: null, lanOpen: false };

  it('opens the local network with a button, not a command to restart with', () => {
    const html = render({ status: closed });

    expect(html).toMatch(/<button[^>]*>Open to the local network<\/button>/);
    expect(html).toContain('not open to the network');
    expect(html).not.toContain('otea serve --lan');
    expect(html).not.toContain('ph-problem');
    expect(html).not.toContain('Close to the network');
  });

  it('says Windows may ask for a firewall permission, only on Windows and before it opens', () => {
    setLanguage('es');
    const windows = render({ status: { ...closed, firewallPrompt: true } });

    expect(windows).toContain('Abrir a la red local');
    expect(windows).toContain('Windows puede pedir permiso');
    expect(render({ status: closed })).not.toContain('Windows');
    expect(render({ status: { ...lan, firewallPrompt: true } })).not.toContain('Windows');
  });

  it('closes the local network again once it is open', () => {
    setLanguage('es');
    const html = render({});

    expect(html).toMatch(/<button[^>]*>Cerrar a la red<\/button>/);
    expect(html).not.toContain('Abrir a la red local');
    expect(html).toContain('Emparejar un teléfono');
  });

  it('opens the local network before pairing only when it is the closed transport', () => {
    expect(opensBeforePairing(closed)).toBe(true);
    expect(opensBeforePairing(lan)).toBe(false);
    expect(opensBeforePairing(tailscale)).toBe(false);
    expect(opensBeforePairing(null)).toBe(false);
  });

  it('offers neither button on Tailscale', () => {
    const html = render({ status: tailscale });

    expect(html).not.toContain('Open to the local network');
    expect(html).not.toContain('Close to the network');
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
