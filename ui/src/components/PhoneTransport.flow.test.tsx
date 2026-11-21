// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { buttonNamed, type Mounted, mount, press, settle } from '../test-dom.tsx';
import type { PhoneStatus, TailscaleCheck, TailscaleGuide } from '../types.ts';
import { PhoneTransport } from './PhoneTransport.tsx';

// Configuración · Teléfono as the person clicks it, against a server that answers as Otea's does
// (src/server/server.ts): what each pick sends, and what the page says back.

const HOST = 'desk.tail1.ts.net';
const COMMAND = 'tailscale serve --bg --https=443 http://127.0.0.1:4400';
const qr = { size: 21, cells: [[true]] };

type World = {
  transport: 'lan' | 'tailscale';
  lanOpen: boolean;
  serving: boolean;
  serveFails: string | null;
  // Reads of the status left before the served address answers (the certificate on its way).
  silentReads?: number;
  phoneOnline?: boolean | null;
};

const check = (w: World): TailscaleCheck => ({
  state: 'ready',
  host: HOST,
  url: `https://${HOST}`,
  serving: w.serving,
});

const statusOf = (w: World): PhoneStatus =>
  w.transport === 'tailscale'
    ? {
        transport: 'tailscale',
        url: `https://${HOST}`,
        reachable: w.serving && !(w.silentReads && w.silentReads > 0),
        tailscale: check(w),
        lanOpen: w.lanOpen,
        firewallPrompt: false,
      }
    : {
        transport: 'lan',
        url: w.lanOpen ? 'http://192.168.1.24:4400' : null,
        reachable: w.lanOpen ? true : null,
        tailscale: null,
        lanOpen: w.lanOpen,
        firewallPrompt: false,
      };

const guideOf = (w: World): TailscaleGuide => ({
  done: { phone: true, pc: true, signIn: true, https: true, serve: w.serving, pair: false },
  pairing: 'none',
  phoneOnline: w.phoneOnline ?? null,
  signedIn: true,
  check: check(w),
  host: HOST,
  command: COMMAND,
  undo: 'tailscale serve --https=443 off',
  install: { commands: [], link: 'https://tailscale.com/download/windows' },
  stores: { android: { url: 'https://a', qr }, ios: { url: 'https://i', qr } },
  settings: 'https://console.tailscale.com/admin/dns',
});

type Sent = { method: string; path: string; body: unknown };

function serve(w: World): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input), 'http://127.0.0.1').pathname;
    const method = (init.method ?? 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const json = (value: unknown) =>
      new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    if (method === 'GET' && path === '/api/phone') {
      const status = statusOf(w);
      if (w.silentReads) w.silentReads -= 1;
      return json(status);
    }
    if (method === 'GET' && path === '/api/phone/tailscale') return json(guideOf(w));
    sent.push({ method, path, body });
    if (path === '/api/phone') {
      const { transport } = body as { transport: 'lan' | 'tailscale' };
      if (transport === 'lan') w.transport = 'lan';
      else if (w.serving) w.transport = 'tailscale';
      return json({
        ...statusOf(w),
        ...(transport === 'tailscale' ? { tailscale: check(w) } : {}),
      });
    }
    if (path === '/api/phone/tailscale/serve') {
      if (w.serveFails) {
        return json({ ...statusOf(w), tailscale: { state: 'failed', message: w.serveFails } });
      }
      w.serving = true;
      w.transport = 'tailscale';
      return json({ ...statusOf(w), tailscale: check(w) });
    }
    if (path === '/api/lan/open') w.lanOpen = true;
    if (path === '/api/lan/close') w.lanOpen = false;
    return json(statusOf(w));
  });
  return sent;
}

let page: Mounted | undefined;
beforeEach(() => setLanguage('es'));
afterEach(() => {
  page?.unmount();
  page = undefined;
  vi.unstubAllGlobals();
  setLanguage('en');
});

const card = (kind: string) => page?.root.querySelector(`[data-kind="${kind}"]`);
const open = async (w: World) => {
  const sent = serve(w);
  page = mount(<PhoneTransport canWrite onPair={() => {}} />);
  await settle();
  return sent;
};

describe('Configuración · Teléfono, clicked', () => {
  it('says why Run this command failed, in its step, instead of offering it again silently', async () => {
    await open({ transport: 'lan', lanOpen: false, serving: false, serveFails: 'Access denied' });
    await press(card('tailscale'));
    await press(page && buttonNamed(page.root, 'Ejecutar este comando'));
    await press(page && buttonNamed(page.root, 'Sí, ejecutarlo'));

    const step = page?.root.querySelector('[data-step="serve"]');
    expect(step?.textContent).toContain('Access denied');
  });

  it('uses Tailscale as soon as it is picked once Otea is already served there', async () => {
    const sent = await open({ transport: 'lan', lanOpen: true, serving: true, serveFails: null });
    await press(card('tailscale'));

    expect(sent).toContainEqual({
      method: 'POST',
      path: '/api/phone',
      body: { transport: 'tailscale' },
    });
    expect(card('tailscale')?.getAttribute('aria-checked')).toBe('true');
    expect(card('tailscale')?.textContent).toContain('en uso');
    expect(card('tailscale')?.textContent).not.toContain('por configurar');
  });

  it('changes nothing when Tailscale is picked before its steps are done', async () => {
    const sent = await open({ transport: 'lan', lanOpen: false, serving: false, serveFails: null });
    await press(card('tailscale'));

    expect(sent).toEqual([]);
    expect(card('local')?.textContent).toContain('en uso por ahora');
  });

  it('runs the confirmed command and lands on Tailscale in use', async () => {
    const sent = await open({ transport: 'lan', lanOpen: false, serving: false, serveFails: null });
    await press(card('tailscale'));
    await press(page && buttonNamed(page.root, 'Ejecutar este comando'));
    await press(page && buttonNamed(page.root, 'Sí, ejecutarlo'));

    expect(sent).toEqual([
      { method: 'POST', path: '/api/phone/tailscale/serve', body: { command: COMMAND } },
    ]);
    expect(card('tailscale')?.textContent).toContain('en uso');
  });

  it('moves focus into the question, and back to the button when it is canceled', async () => {
    await open({ transport: 'lan', lanOpen: false, serving: false, serveFails: null });
    await press(card('tailscale'));
    await press(page && buttonNamed(page.root, 'Ejecutar este comando'));

    const dialog = page?.root.querySelector('[role="alertdialog"]');
    expect(dialog?.contains(document.activeElement)).toBe(true);
    await press(page && buttonNamed(page.root, 'Cancelar'));
    expect(document.activeElement?.textContent).toBe('Ejecutar este comando');
  });

  it('goes back to this computer only from Tailscale: the transport, then the network', async () => {
    const sent = await open({
      transport: 'tailscale',
      lanOpen: true,
      serving: true,
      serveFails: null,
    });
    await press(card('local'));

    expect(sent.map(({ path }) => path)).toEqual(['/api/phone', '/api/lan/close']);
    expect(card('local')?.getAttribute('aria-checked')).toBe('true');
    expect(page?.root.querySelector('.ph-guide')).toBeNull();
  });
});

// TS-8: right after serving, the certificate took longer than the page waited, and the status sat on
// «comprobando…» with Otea already answering. TS-23: an open Configuración never noticed the phone
// leaving Tailscale, nor coming back.
describe('Configuración · Teléfono, left open', () => {
  afterEach(() => vi.useRealTimers());

  // Time passes a few seconds at a time, each step letting the reads it started come back.
  const tick = async (ms: number) => {
    for (let left = ms; left > 0; left -= 3000) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      await settle();
    }
  };
  const reach = () => page?.root.querySelector('.ph-reach')?.textContent ?? '';

  it('keeps reading after serving until Otea answers, however long the certificate takes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'setInterval', 'Date'] });
    const w: World = { transport: 'lan', lanOpen: false, serving: false, serveFails: null };
    await open(w);
    await press(card('tailscale'));
    await press(page && buttonNamed(page.root, 'Ejecutar este comando'));
    w.silentReads = 20;
    await press(page && buttonNamed(page.root, 'Sí, ejecutarlo'));
    await tick(40_000);
    expect(reach()).toContain('comprobando');
    await tick(40_000);
    expect(reach()).toContain('Otea responde');
  }, 30_000);

  it('notices the phone leave Tailscale and come back, while the page stays open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'setInterval', 'Date'] });
    const w: World = {
      transport: 'tailscale',
      lanOpen: false,
      serving: true,
      serveFails: null,
      phoneOnline: true,
    };
    await open(w);
    const offline = () =>
      page?.root.textContent?.includes('Tu teléfono no está conectado a Tailscale ahora');
    expect(offline()).toBe(false);
    w.phoneOnline = false;
    await tick(60_000);
    expect(offline()).toBe(true);
    w.phoneOnline = true;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await settle();
    expect(offline()).toBe(false);
  }, 30_000);
});
