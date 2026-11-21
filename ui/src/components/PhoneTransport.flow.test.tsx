// @vitest-environment happy-dom
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
        reachable: w.serving,
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
  phoneOnline: null,
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
    if (method === 'GET' && path === '/api/phone') return json(statusOf(w));
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
