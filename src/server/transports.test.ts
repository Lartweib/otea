import { describe, expect, it } from 'vitest';
import { lanTransport, proxied, relayTransport, tailscaleTransport } from './transports.ts';

describe('phone transports', () => {
  describe('the local network', () => {
    const lan = lanTransport(['desk.local', '192.168.1.24']);

    it('opens at this computer’s names and addresses over plain HTTP', () => {
      expect(lan.kind).toBe('lan');
      expect(lan.urls(4400)).toEqual(['http://desk.local:4400', 'http://192.168.1.24:4400']);
    });

    it('admits a private address naming one of them', () => {
      expect(lan.admit({ host: '192.168.1.24:4400', remote: '192.168.1.50' }, 4400)).toEqual({
        address: '192.168.1.50',
        secure: false,
      });
      expect(lan.admit({ host: 'DESK.local:4400', remote: '10.0.0.7' }, 4400)).toMatchObject({
        address: '10.0.0.7',
      });
    });

    it('turns away this computer, public addresses and other names', () => {
      expect(lan.admit({ host: '192.168.1.24:4400', remote: '127.0.0.1' }, 4400)).toBeUndefined();
      expect(lan.admit({ host: '192.168.1.24:4400', remote: '8.8.8.8' }, 4400)).toBeUndefined();
      expect(
        lan.admit({ host: 'evil.example:4400', remote: '192.168.1.50' }, 4400),
      ).toBeUndefined();
      expect(
        lan.admit({ host: '192.168.1.24:4401', remote: '192.168.1.50' }, 4400),
      ).toBeUndefined();
    });
  });

  describe('Tailscale', () => {
    const tailscale = tailscaleTransport('desk.tail1.ts.net');

    it('opens at this computer’s tailnet name over HTTPS', () => {
      expect(tailscale.kind).toBe('tailscale');
      expect(tailscale.urls(4400)).toEqual(['https://desk.tail1.ts.net']);
    });

    it('admits what tailscale serve forwards: from this computer, naming the tailnet name', () => {
      const arrival = {
        host: 'desk.tail1.ts.net',
        remote: '127.0.0.1',
        forwardedFor: '100.101.102.103',
      };
      expect(tailscale.admit(arrival, 4400)).toEqual({ address: '100.101.102.103', secure: true });
      expect(tailscale.admit({ ...arrival, host: 'DESK.tail1.ts.net:443' }, 4400)).toMatchObject({
        secure: true,
      });
    });

    it('admits a forwarded request even when the proxy names this computer', () => {
      const arrival = { host: '127.0.0.1:4400', remote: '::1', forwardedFor: '100.64.0.9' };
      expect(tailscale.admit(arrival, 4400)).toEqual({ address: '100.64.0.9', secure: true });
    });

    it('counts attempts per phone, never from an address it cannot read', () => {
      const arrival = { host: 'desk.tail1.ts.net', remote: '127.0.0.1', forwardedFor: 'junk' };
      expect(tailscale.admit(arrival, 4400)).toEqual({ address: 'tailscale', secure: true });
    });

    it('turns away anything that did not come through this computer', () => {
      expect(
        tailscale.admit({ host: 'desk.tail1.ts.net', remote: '100.101.102.103' }, 4400),
      ).toBeUndefined();
      expect(tailscale.admit({ host: 'other.tail1.ts.net', remote: '127.0.0.1' }, 4400)).toBe(
        undefined,
      );
      expect(tailscale.admit({ host: '127.0.0.1:4400', remote: '127.0.0.1' }, 4400)).toBe(
        undefined,
      );
    });
  });

  describe('the Otea relay', () => {
    it('is only a seam: it opens nowhere and admits nothing', () => {
      expect(relayTransport.kind).toBe('relay');
      expect(relayTransport.urls(4400)).toEqual([]);
      expect(
        relayTransport.admit({ host: 'x', remote: '127.0.0.1', forwardedFor: '1.2.3.4' }, 4400),
      ).toBeUndefined();
    });
  });

  it('tells a request a proxy on this computer forwarded', () => {
    expect(proxied({ remote: '127.0.0.1', forwardedFor: '100.64.0.9' })).toBe(true);
    expect(proxied({ remote: '127.0.0.1' })).toBe(false);
    expect(proxied({ remote: '192.168.1.50', forwardedFor: '1.2.3.4' })).toBe(false);
  });
});
