import { describe, expect, it } from 'vitest';
import { CODE_TTL_MS } from '../../src/server/lan.ts';
import { setLanguage, t } from './i18n/i18n.ts';
import {
  addressHint,
  addressLabel,
  codeFromHash,
  deviceNameFrom,
  hostnameOf,
  hostOf,
  ipFallback,
  isLocalName,
  pairedHome,
  qrPath,
  reachesAnywhere,
  timeLeft,
} from './pairing.ts';

describe('pairing', () => {
  it('reads the code from the fragment the QR code opens', () => {
    expect(codeFromHash('#code=7Q4M-2K9X')).toBe('7Q4M-2K9X');
    expect(codeFromHash('')).toBe('');
    expect(codeFromHash('#other=1')).toBe('');
  });

  it.each([
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
      'Android · Chrome',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'iPhone · Safari',
    ],
    ['curl/8.0', 'Phone'],
  ])('names the device from its user agent', (userAgent, name) => {
    expect(deviceNameFrom(userAgent)).toBe(name);
  });

  it('counts down what is left of a code', () => {
    const now = Date.parse('2026-11-03T12:00:00Z');

    expect(timeLeft('2026-11-03T12:09:41Z', now)).toBe('9:41');
    expect(timeLeft('2026-11-03T12:00:05Z', now)).toBe('0:05');
    expect(timeLeft('2026-11-03T11:59:00Z', now)).toBe('0:00');
  });

  it('draws a square per dark module', () => {
    expect(
      qrPath([
        [true, false],
        [false, true],
      ]),
    ).toBe('M0 0h1v1h-1zM1 1h1v1h-1z');
  });

  it('shows the host without the scheme', () => {
    expect(hostOf('http://192.168.1.24:4485')).toBe('192.168.1.24:4485');
  });
});

describe('the .local name and its IP fallback', () => {
  const urls = ['http://devbox.local:4485', 'http://192.0.2.10:4485'];

  it('tells a .local name from an address', () => {
    expect(isLocalName(hostnameOf('devbox.local:4485'))).toBe(true);
    expect(isLocalName(hostnameOf('192.0.2.10:4485'))).toBe(false);
  });

  it('points the same pairing link at the first IP', () => {
    expect(ipFallback(urls, 'http://devbox.local:4485/pair#code=7Q4M-2K9X')).toBe(
      'http://192.0.2.10:4485/pair#code=7Q4M-2K9X',
    );
    expect(ipFallback(['http://devbox.local:4485'], 'http://devbox.local:4485/pair')).toBe(
      undefined,
    );
  });
});

describe('the pair dialog says how long the code lasts (DR2-16)', () => {
  it.each(['es', 'en'] as const)('names the server’s own lifetime in %s', (lang) => {
    setLanguage(lang);
    const minutes = String(CODE_TTL_MS / 60_000);
    expect(t('lan.dialogLead')).toContain(` ${minutes} `);
    expect(t('lan.dialogLeadTailscale')).toContain(` ${minutes} `);
    setLanguage('en');
  });
});

// The desk lists every address this computer has: each one says which to pick (DR3-13).
describe('the addresses the pairing code can point at', () => {
  it('tags each in the list: most likely, Tailscale, another network, not on Android', () => {
    setLanguage('es');
    expect(addressLabel('192.0.2.10:4400', 0)).toBe('192.0.2.10:4400 · probable');
    expect(addressLabel('100.101.102.103:4400', 1)).toBe('100.101.102.103:4400 · Tailscale');
    expect(addressLabel('192.168.56.1:4400', 2)).toBe('192.168.56.1:4400 · otra red');
    expect(addressLabel('devbox.local:4400', 4)).toBe('devbox.local:4400 · no en Android');
    setLanguage('en');
    expect(addressLabel('192.0.2.10:4400', 0)).toBe('192.0.2.10:4400 · likely');
    expect(addressLabel('devbox.local:4400', 4)).toBe('devbox.local:4400 · not on Android');
  });

  it('says in full why to pick the one chosen, or not', () => {
    setLanguage('es');
    expect(addressHint('devbox.local:4400', 4)).toBe(
      'el nombre del equipo: Android no lo abre, elige una dirección',
    );
    expect(addressHint('192.0.2.10:4400', 0)).toBe('la más probable para llegar al teléfono');
    setLanguage('en');
    expect(addressHint('100.101.102.103:4400', 1)).toBe('Tailscale: only devices on your tailnet');
  });

  it('names Tailscale only within its range', () => {
    setLanguage('en');
    expect(addressLabel('100.64.0.1:4400', 1)).toContain('Tailscale');
    expect(addressLabel('100.127.255.1:4400', 1)).toContain('Tailscale');
    expect(addressLabel('100.128.0.1:4400', 1)).toContain('other network');
  });
});

// TS-4: paired over Tailscale's HTTPS, the screen said it worked on the same network only.
describe('where a paired phone reaches Otea', () => {
  it('from anywhere through Tailscale, on the same network otherwise', () => {
    expect(reachesAnywhere('desk.tail1.ts.net', true)).toBe(true);
    expect(reachesAnywhere('DESK.TAIL1.TS.NET', true)).toBe(true);
    expect(reachesAnywhere('192.168.1.24', false)).toBe(false);
    expect(reachesAnywhere('desk.local', false)).toBe(false);
  });

  it('says so on the paired screen', () => {
    setLanguage('es');
    expect(t('pair.doneTextAnywhere', { computer: 'Desk' })).toContain(
      'desde cualquier lugar mientras Tailscale esté conectado en el teléfono',
    );
    expect(t('pair.reachAnywhere')).not.toContain('misma red');
    setLanguage('en');
  });
});

// TS-12: Abrir Otea went to `/`, which waits for the PC: it opens the last project, from the cache.
describe('where Abrir Otea leads', () => {
  const kept = (id: string | null) => ({ getItem: () => id, setItem: () => undefined });

  it('to the project this phone opened last, else the home page', () => {
    expect(pairedHome(kept('web-k3x7qa'))).toBe('/p/web-k3x7qa/#/');
    expect(pairedHome(kept(null))).toBe('/');
    expect(pairedHome(undefined)).toBe('/');
  });
});
