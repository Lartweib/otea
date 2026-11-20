import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import type { PhoneStatus, TailscaleCheck, TailscaleGuide } from '../types.ts';
import {
  PhoneTransportView,
  type PhoneTransportViewProps,
  problemOf,
  reachOf,
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

const qr = { size: 25, cells: Array.from({ length: 25 }, () => Array(25).fill(true)) };
const guideOf = (done: Partial<TailscaleGuide['done']> = {}): TailscaleGuide => ({
  done: {
    phone: false,
    pc: false,
    signIn: false,
    https: false,
    serve: false,
    pair: false,
    ...done,
  },
  signedIn: done.signIn ?? false,
  check: { state: 'ready', host: HOST, url: `https://${HOST}`, serving: done.serve ?? false },
  host: HOST,
  command: 'tailscale serve --bg --https=443 http://127.0.0.1:4400',
  undo: 'tailscale serve --https=443 off',
  install: {
    commands: ['winget install --id tailscale.tailscale'],
    link: 'https://tailscale.com/download/windows',
  },
  stores: {
    android: { url: 'https://play.google.com/store/apps/details?id=com.tailscale.ipn', qr },
    ios: { url: 'https://apps.apple.com/us/app/tailscale/id1470499037', qr },
  },
  settings: 'https://console.tailscale.com/admin/dns',
});

const render = (props: Partial<PhoneTransportViewProps>) =>
  renderToStaticMarkup(
    createElement(PhoneTransportView, {
      status: lan,
      guide: null,
      picked: null,
      confirming: false,
      busy: false,
      canWrite: true,
      onPick: () => {},
      onPair: () => {},
      onCheck: () => {},
      onUseTailscale: () => {},
      onAskServe: () => {},
      onConfirmServe: () => {},
      onCancelServe: () => {},
      ...props,
    }),
  );

const closed: PhoneStatus = { ...lan, url: null, reachable: null, lanOpen: false };

describe('Configuración · Teléfono: how you reach Otea', () => {
  it('reads which option is in use from the current state', () => {
    expect(reachOf(closed)).toBe('local');
    expect(reachOf(lan)).toBe('lan');
    expect(reachOf(tailscale)).toBe('tailscale');
    expect(reachOf({ ...tailscale, lanOpen: true })).toBe('tailscale');
    expect(reachOf(null)).toBeNull();
  });

  it('sets the three options side by side, each with what it needs, gives and costs', () => {
    setLanguage('es');
    const html = render({ status: closed });

    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/aria-checked="true"[^>]*data-kind="local"/);
    expect(html).toContain('Solo en este equipo');
    expect(html).toContain('Desde el teléfono, en tu casa');
    expect(html).toContain('Desde cualquier lugar, con Tailscale');
    expect(html.match(/class="ph-opt-row"/g)?.length).toBe(9);
    expect(html).toContain('gratis para uso personal');
    expect(html).toContain('en uso');
    expect(html).not.toContain('Relay de Otea');
  });

  it('says the same in English, plainly', () => {
    const html = render({ status: lan });

    expect(html).toMatch(/aria-checked="true"[^>]*data-kind="lan"/);
    expect(html).toContain('Only on this computer');
    expect(html).toContain('From your phone, at home');
    expect(html).toContain('From anywhere, with Tailscale');
    expect(html).toContain('no HTTPS on the local network');
  });

  it('marks Tailscale in use when it carries the phone', () => {
    const html = render({ status: tailscale, guide: guideOf({ serve: true }) });

    expect(html).toMatch(/aria-checked="true"[^>]*data-kind="tailscale"/);
    expect(html).toContain(`https://${HOST}`);
  });

  it('leads into the guided steps only from the Tailscale option', () => {
    expect(render({ status: lan })).not.toContain('ph-guide');
    expect(render({ status: lan, picked: 'local' })).not.toContain('ph-guide');
    const html = render({ status: lan, picked: 'tailscale', guide: guideOf() });
    expect(html).toContain('ph-guide');
    expect(html.match(/<li class="ph-step"/g)?.length).toBe(6);
  });

  it('says Windows may ask for a firewall permission under the local network option', () => {
    setLanguage('es');
    expect(render({ status: { ...closed, firewallPrompt: true } })).toContain(
      'Windows puede pedir permiso',
    );
    expect(render({ status: closed })).not.toContain('Windows');
    expect(render({ status: { ...lan, firewallPrompt: true } })).not.toContain('Windows');
  });

  it('pairs from any option but the one that keeps Otea on this computer', () => {
    setLanguage('es');
    expect(render({ status: lan })).toContain('Emparejar un teléfono');
    expect(render({ status: closed })).not.toContain('Emparejar un teléfono');
  });

  it('says the local network works only while this computer is on, and Tailscale opens without it', () => {
    setLanguage('es');
    const local = render({});
    const away = render({ status: tailscale });

    expect(local).toContain('funciona solo mientras este equipo está encendido');
    expect(local).not.toContain('aunque este equipo esté apagado');
    expect(away).toContain('Otea se abre aunque este equipo esté apagado');
    expect(away).toContain('espera en cola');
  });

  it('asks this computer’s browser to sign in before choosing', () => {
    const html = render({ canWrite: false, status: lan });

    expect(html).toContain('otea open');
    expect(html).not.toContain('role="radiogroup"');
  });
});

describe('the guided steps to Tailscale', () => {
  const steps = (props: Partial<PhoneTransportViewProps>) =>
    render({ status: lan, picked: 'tailscale', ...props });

  it('links the official store pages, each as a QR code to scan', () => {
    const html = steps({ guide: guideOf() });

    expect(html).toContain(
      'href="https://play.google.com/store/apps/details?id=com.tailscale.ipn"',
    );
    expect(html).toContain('href="https://apps.apple.com/us/app/tailscale/id1470499037"');
    expect(html.match(/class="qr ph-store-qr"/g)?.length).toBe(2);
    expect(html).toContain('Google Play');
    expect(html).toContain('App Store');
  });

  it('links the download for this computer, and never installs it', () => {
    const html = steps({ guide: guideOf() });

    expect(html).toContain('href="https://tailscale.com/download/windows"');
    expect(html).toContain('winget install --id tailscale.tailscale');
  });

  it('links the DNS page of the admin console for MagicDNS and HTTPS certificates', () => {
    setLanguage('es');
    const html = steps({ guide: guideOf() });

    expect(html).toContain('href="https://console.tailscale.com/admin/dns"');
    expect(html).toContain('MagicDNS');
    expect(html).toContain('HTTPS Certificates');
  });

  it('marks each step done or still to do, as read on this computer', () => {
    const html = steps({ guide: guideOf({ phone: true, pc: true, signIn: true }) });

    expect(html.match(/data-done="true"/g)?.length).toBe(3);
    expect(html.match(/data-done="false"/g)?.length).toBe(3);
  });

  it('shows the exact command, what it does and how to undo it', () => {
    setLanguage('es');
    const html = steps({ guide: guideOf({ pc: true, signIn: true, https: true }) });

    expect(html).toContain('tailscale serve --bg --https=443 http://127.0.0.1:4400');
    expect(html).toContain('tailscale serve --https=443 off');
    expect(html).toContain('solo tu tailnet');
    expect(html).toMatch(/<button[^>]*>Ejecutar este comando<\/button>/);
  });

  it('runs the command only after asking, word for word', () => {
    setLanguage('es');
    const asking = steps({
      guide: guideOf({ pc: true, signIn: true, https: true }),
      confirming: true,
    });

    expect(asking).toContain('role="alertdialog"');
    expect(asking).toContain('¿Ejecutar este comando en este equipo?');
    expect(asking).toMatch(/<button[^>]*>Sí, ejecutarlo<\/button>/);
    expect(asking).toMatch(/<button[^>]*>Cancelar<\/button>/);
    expect(steps({ guide: guideOf() })).not.toContain('role="alertdialog"');
  });

  it('offers no button to run it while the HTTPS name forwards to something else', () => {
    const html = steps({
      guide: {
        ...guideOf({ phone: true, pc: true, signIn: true, https: true }),
        check: { state: 'taken', host: HOST, target: 'http://127.0.0.1:3000' },
      },
    });

    expect(html).toContain('already forwards to http://127.0.0.1:3000');
    expect(html).not.toContain('Run this command');
  });

  it('offers no button to run it while a step before it is missing, nor once it is done', () => {
    expect(steps({ guide: guideOf({ pc: true }) })).not.toContain('Run this command');
    expect(steps({ guide: guideOf({ pc: true, https: true, serve: true }) })).not.toContain(
      'Run this command',
    );
  });

  it('uses Tailscale for the phone once Otea is served, without running anything', () => {
    const html = steps({ guide: guideOf({ pc: true, signIn: true, https: true, serve: true }) });

    expect(html).toMatch(/<button[^>]*>Use Tailscale for the phone<\/button>/);
    expect(render({ status: tailscale, guide: guideOf({ serve: true }) })).not.toContain(
      'Use Tailscale for the phone',
    );
  });

  it('ends with pairing over the HTTPS name and turning notifications on', () => {
    setLanguage('es');
    const html = steps({ guide: guideOf({ serve: true }) });

    expect(html).toContain(`https://${HOST}`);
    expect(html).toContain('Avisos');
    expect(html).toContain('pantalla de inicio');
  });

  it('says what stops a step in the words of its check', () => {
    const html = steps({
      guide: { ...guideOf({ pc: true }), check: { state: 'logged_out', authUrl: null } },
    });

    expect(html).toContain('tailscale up');
  });
});

describe('what stops Tailscale', () => {
  it('names the command or the page that fixes it', () => {
    expect(problemOf({ state: 'logged_out', authUrl: null })).toMatchObject({
      key: 'phone.ts.loggedOut',
      commands: ['tailscale up'],
    });
    expect(
      problemOf({ state: 'no_https', settings: 'https://console.tailscale.com/admin/dns' }),
    ).toMatchObject({
      key: 'phone.ts.noHttps',
      link: { href: 'https://console.tailscale.com/admin/dns' },
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
