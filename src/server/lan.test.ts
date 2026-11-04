import { describe, expect, it } from 'vitest';
import {
  AttemptLimiter,
  CODE_TTL_MS,
  formatCode,
  isLoopback,
  isPrivateAddress,
  localName,
  localNameOf,
  MAX_ATTEMPTS,
  PairingCodes,
  rankAddress,
} from './lan.ts';

describe('addresses', () => {
  it.each([
    '10.0.0.4',
    '172.16.0.1',
    '172.31.255.1',
    '192.168.1.24',
    '100.101.4.2',
    '169.254.3.3',
    '::ffff:192.168.1.50',
  ])('takes %s as the same network', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '100.128.0.1', '127.0.0.1', '::1', 'fe80::1', 'localhost'])(
    'does not take %s as the same network',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );

  it.each(['127.0.0.1', '127.8.0.1', '::1', '::ffff:127.0.0.1'])(
    'takes %s as this computer',
    (address) => {
      expect(isLoopback(address)).toBe(true);
    },
  );

  it.each(['192.168.1.24', '::ffff:10.0.0.1', '0.0.0.0'])(
    'does not take %s as this computer',
    (address) => {
      expect(isLoopback(address)).toBe(false);
    },
  );
});

describe('which address to show first', () => {
  it('puts Wi-Fi before wired before virtual adapters', () => {
    const ranked = [
      ['vEthernet (WSL)', '172.20.96.1'],
      ['Ethernet 2', '192.168.56.1'],
      ['Ethernet', '10.0.0.7'],
      ['Wi-Fi', '192.168.1.156'],
    ].sort(([n1 = '', a1 = ''], [n2 = '', a2 = '']) => rankAddress(n1, a1) - rankAddress(n2, a2));

    expect(ranked.map(([, address]) => address)).toEqual([
      '192.168.1.156',
      '10.0.0.7',
      '192.168.56.1',
      '172.20.96.1',
    ]);
  });
});

describe('pairing codes', () => {
  it('issues 8 characters a person can read off a screen', () => {
    const { code } = new PairingCodes().issue();

    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(formatCode(code)).toMatch(/^.{4}-.{4}$/);
  });

  it('has nothing to show before the first code and after one expires', () => {
    let now = 0;
    const codes = new PairingCodes(() => now);

    expect(codes.current()).toBeUndefined();
    codes.issue();
    now = CODE_TTL_MS - 1;
    expect(codes.current()).toBeDefined();
    now = CODE_TTL_MS;
    expect(codes.current()).toBeUndefined();
  });

  it('refuses every code while none was issued', () => {
    expect(new PairingCodes().redeem('')).toBe('wrong');
  });
});

describe('attempt limiter', () => {
  it('counts each address on its own, a window at a time', () => {
    let now = 0;
    const limiter = new AttemptLimiter(() => now);
    for (let index = 0; index < MAX_ATTEMPTS; index += 1) expect(limiter.allow('a')).toBe(true);

    expect(limiter.allow('a')).toBe(false);
    expect(limiter.allow('b')).toBe(true);
    now = 60_000;
    expect(limiter.allow('a')).toBe(true);
  });
});

describe('the .local name', () => {
  it('is the hostname as one DNS label', () => {
    expect(localNameOf('Lartweib')).toBe('lartweib.local');
    expect(localNameOf('Federicos-MacBook.local')).toBe('federicos-macbook.local');
    expect(localNameOf('host.example.com')).toBeUndefined();
    expect(localNameOf('-bad')).toBeUndefined();
  });

  it('is kept only when it resolves to an address LAN access answers on', async () => {
    const resolve = async () => ['192.168.1.24'];

    expect(await localName(['192.168.1.24'], { host: 'desk', resolve })).toBe('desk.local');
    expect(await localName(['10.0.0.5'], { host: 'desk', resolve })).toBeUndefined();
    expect(await localName([], { host: 'desk', resolve })).toBeUndefined();
  });

  it('is dropped when it does not resolve, or not in time', async () => {
    const fails = async () => {
      throw new Error('ENOTFOUND');
    };
    const never = () => new Promise<string[]>(() => {});

    expect(await localName(['192.168.1.24'], { host: 'desk', resolve: fails })).toBeUndefined();
    expect(
      await localName(['192.168.1.24'], { host: 'desk', resolve: never, timeoutMs: 10 }),
    ).toBeUndefined();
  });
});
