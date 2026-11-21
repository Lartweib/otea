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
  pairing: done.pair ? 'push' : 'none',
  phoneOnline: null,
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
      busy: null,
      canWrite: true,
      onPick: () => {},
      onPair: () => {},
      onCheck: () => {},
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

describe('the chooser agrees with itself in every state', () => {
  const checked = (html: string) => html.match(/aria-checked="true"[^>]*data-kind="(\w+)"/)?.[1];
  const tagOf = (html: string, kind: string) =>
    html
      .match(new RegExp(`data-kind="${kind}"[\\s\\S]*?</button>`))?.[0]
      .match(/class="ph-opt-tag"[^>]*>([^<]*)</)?.[1];

  it('says no transport carries the phone while Otea stays on this computer', () => {
    setLanguage('es');
    const html = render({ status: closed });

    expect(checked(html)).toBe('local');
    expect(html).not.toContain('Red local');
    expect(html).not.toContain('funciona solo mientras');
    expect(html).not.toContain('Sea cual sea el transporte');
  });

  it('marks Tailscale chosen, and what stays in use until its steps are done', () => {
    setLanguage('es');
    const html = render({ status: closed, picked: 'tailscale', guide: guideOf({ pc: true }) });

    expect(checked(html)).toBe('tailscale');
    expect(tagOf(html, 'tailscale')).toBe('por configurar');
    expect(tagOf(html, 'local')).toBe('en uso por ahora');
    expect(html).toContain('ph-guide');
    // Neither the local network's line nor the firewall's: the phone has no way in yet.
    expect(html).not.toContain('Red local');
    expect(html).not.toContain('funciona solo mientras');
    expect(html).not.toContain('Windows puede pedir permiso');
    expect(html).toContain('Hasta que termines los pasos, sigue en uso: Solo en este equipo.');
  });

  it('keeps the local network in use, and says so, while Tailscale is being set up from it', () => {
    setLanguage('es');
    const html = render({ status: lan, picked: 'tailscale', guide: guideOf({ pc: true }) });

    expect(checked(html)).toBe('tailscale');
    expect(tagOf(html, 'lan')).toBe('en uso por ahora');
    expect(html).toContain('Red local');
    expect(html).toContain('http://192.168.1.24:4400');
    expect(html).toContain('sigue en uso: Desde el teléfono, en tu casa.');
    expect(html).not.toMatch(/<button[^>]*>Emparejar un teléfono<\/button>/);
  });

  it('says only Tailscale’s lines once Tailscale carries the phone', () => {
    setLanguage('es');
    const html = render({ status: tailscale, guide: guideOf({ serve: true }) });

    expect(checked(html)).toBe('tailscale');
    expect(tagOf(html, 'tailscale')).toBe('en uso');
    expect(html).not.toContain('por configurar');
    expect(html).not.toContain('funciona solo mientras');
    expect(html).toContain('aunque este equipo esté apagado');
  });

  it('says the local network is still open beside Tailscale, and closes it from there', () => {
    setLanguage('es');
    const html = render({
      status: { ...tailscale, lanOpen: true },
      guide: guideOf({ serve: true }),
    });

    expect(html).toContain('También está abierta');
    expect(html).toMatch(/<button[^>]*>Cerrar a la red<\/button>/);
    expect(render({ status: tailscale, guide: guideOf({ serve: true }) })).not.toContain(
      'Cerrar a la red',
    );
  });

  it('names what a change is doing while it runs, never Tailscale for the local network', () => {
    setLanguage('es');
    expect(render({ status: closed, busy: 'switch' })).not.toContain('Tailscale…');
    expect(render({ status: closed, busy: 'switch' })).toContain('Cambiando…');
  });
});

describe('what the guide says back', () => {
  const steps = (props: Partial<PhoneTransportViewProps>) =>
    render({ status: closed, picked: 'tailscale', ...props });
  const ready = { pc: true, phone: true, signIn: true, https: true };

  it('shows why the command failed in its own step', () => {
    setLanguage('es');
    const html = steps({
      guide: guideOf(ready),
      ran: { state: 'failed', message: 'Access denied: serve config denied' },
    });

    expect(html).toMatch(/data-step="serve"[\s\S]*Access denied: serve config denied/);
  });

  it('says Check again is reading, then what it found', () => {
    setLanguage('es');
    expect(steps({ guide: guideOf(ready), busy: 'check' })).toMatch(
      /<button[^>]*disabled=""[^>]*>Comprobando…<\/button>/,
    );
    expect(steps({ guide: guideOf(ready), checked: true })).toContain('4 de 6 pasos hechos');
  });

  it('says what stops every step at the top when Tailscale itself answers with an error', () => {
    const html = steps({
      guide: { ...guideOf({ pc: true }), check: { state: 'failed', message: 'not running' } },
    });

    expect(html.indexOf('not running')).toBeLessThan(html.indexOf('data-step="phone"'));
  });

  it('never offers to free the name another app holds without saying it may be yours', () => {
    setLanguage('es');
    const html = steps({
      guide: {
        ...guideOf(ready),
        check: { state: 'taken', host: HOST, target: 'http://127.0.0.1:4400' },
      },
    });

    expect(html).toContain('no a este Otea');
    // The undo line once, in the problem, not twice.
    expect(html.match(/tailscale serve --https=443 off/g)?.length).toBe(1);
  });

  it('folds a done step to the line that says so', () => {
    setLanguage('es');
    const html = steps({ guide: guideOf(ready) });

    expect(html).not.toContain('class="qr ph-store-qr"');
    expect(html).not.toContain('Abre Tailscale en este equipo y en el teléfono');
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

  it('says Otea is served once it is, with nothing left to run', () => {
    const html = steps({ guide: guideOf({ pc: true, signIn: true, https: true, serve: true }) });

    expect(html).toContain(`https://${HOST} forwards to Otea`);
    expect(html).not.toContain('tailscale serve --bg');
    expect(html).not.toContain('Run this command');
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

describe('once Tailscale carries the phone', () => {
  const all = { phone: true, pc: true, signIn: true, https: true, serve: true, pair: true };

  it('says the phone is paired and names the next action while notifications are off', () => {
    setLanguage('es');
    const html = render({
      status: tailscale,
      guide: { ...guideOf({ ...all, pair: false }), pairing: 'paired' },
    });

    expect(html).toMatch(/data-step="pair" data-done="false" data-partial="true"/);
    expect(html).toContain('emparejado, sin avisos');
    expect(html).toContain('Preferencias › Avisos');
    expect(html).toContain('Activar avisos');
  });

  it('folds every step into a short Listo once all are done, and opens them again', () => {
    setLanguage('es');
    const html = render({ status: tailscale, guide: guideOf(all) });

    expect(html).toContain('class="ph-guide ph-ready"');
    expect(html).toContain('Listo');
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Ver los pasos<\/button>/);
    expect(html).not.toContain('data-step="phone"');
    // Not all done: the steps stay open.
    expect(render({ status: tailscale, guide: guideOf({ ...all, pair: false }) })).toContain(
      'data-step="phone"',
    );
  });

  it('keeps a prominent note: away from this computer, Tailscale must be connected on the phone', () => {
    setLanguage('es');
    const note = 'Tailscale tiene que estar conectado en el teléfono';
    const html = render({ status: tailscale, guide: guideOf(all) });
    expect(html).toContain('<p class="ph-away" role="note">');
    expect(html.slice(html.indexOf('class="ph-away"'))).toContain(note);
    expect(render({ status: lan })).not.toContain(note);
  });

  it('says the phone is not connected to Tailscale now, and nothing when it is or cannot tell', () => {
    setLanguage('es');
    const off = render({ status: tailscale, guide: { ...guideOf(all), phoneOnline: false } });
    expect(off).toContain('Tu teléfono no está conectado a Tailscale ahora');
    expect(off.indexOf('Tu teléfono no está conectado')).toBeLessThan(off.indexOf('ph-ready"'));
    for (const phoneOnline of [true, null]) {
      expect(render({ status: tailscale, guide: { ...guideOf(all), phoneOnline } })).not.toContain(
        'no está conectado a Tailscale',
      );
    }
  });
});
