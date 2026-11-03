import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lanAddresses } from '../server/lan.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

describe('devices', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let interrupt: AbortController;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    interrupt = new AbortController();
    otea = cliAt(repo.dir, {}, interrupt.signal);
    await otea('init', '--local');
  });

  afterEach(async () => {
    interrupt.abort();
    await vi.waitFor(() => repo.remove());
  });

  it('lists none before any device pairs', async () => {
    expect((await otea('devices', 'list')).out).toBe('No paired devices\n');
    expect(JSON.parse((await otea('devices', 'list', '--json')).out)).toEqual([]);
  });

  it('refuses to revoke a device that is not paired', async () => {
    const { code, err } = await otea('devices', 'revoke', 'abcd1234');

    expect(code).toBe(3);
    expect(err).toContain('No paired device abcd1234');
  });

  const lan = lanAddresses()[0];

  it('prints the LAN address and a pairing code with --lan', async () => {
    const { code, out } = await otea('serve', '--port', '0', '--no-open', '--lan', '--json');
    const data = JSON.parse(out);

    expect(code).toBe(0);
    expect(data.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    if (lan === undefined) {
      expect(data.lan).toEqual({ urls: [], pairingUrl: undefined, code: undefined });
      return;
    }
    expect(data.lan.urls[0]).toBe(`http://${lan}:${new URL(data.url).port}`);
    expect(data.lan.pairingUrl).toBe(`${data.lan.urls[0]}/pair#code=${data.lan.code}`);
  });

  it.skipIf(lan === undefined)('pairs a phone over the LAN, lists it and revokes it', async () => {
    const { out } = await otea('serve', '--port', '0', '--no-open', '--lan', '--json');
    const { lan: served } = JSON.parse(out);
    const base: string = served.urls[0];
    const paired = await fetch(`${base}/api/pair`, {
      method: 'POST',
      headers: { origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ code: served.code, name: 'Pixel · Chrome' }),
    });
    const cookie = (paired.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const items = () => fetch(`${base}/api/items`, { headers: { cookie } });

    expect(paired.status).toBe(201);
    expect((await items()).status).toBe(200);
    const [device] = JSON.parse((await otea('devices', 'list', '--json')).out);
    expect(device).toMatchObject({ name: 'Pixel · Chrome' });
    expect((await otea('devices', 'list')).out).toContain(`${device.id}  Pixel · Chrome  paired`);

    const revoked = await otea('devices', 'revoke', device.id);

    expect(revoked.out).toBe(`Revoked ${device.id} (Pixel · Chrome)\n`);
    expect((await items()).status).toBe(401);
  });
});
