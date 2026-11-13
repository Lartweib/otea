import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeTailscale, fakeTailscale, TAILNET_HOST } from '../app/tailscale-testing.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

// otea phone, with the fake tailscale CLI: no test runs `tailscale up` or `tailscale serve`.
describe('otea phone', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let interrupt: AbortController;
  let cli: FakeTailscale;
  let reachable: boolean;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    interrupt = new AbortController();
    cli = fakeTailscale();
    reachable = true;
    otea = cliAt(repo.dir, {}, interrupt.signal, undefined, undefined, undefined, false, {
      tailscale: cli,
      probe: async () => reachable,
    });
    await otea('init', '--local');
  });

  afterEach(async () => {
    interrupt.abort();
    await vi.waitFor(() => repo.remove());
  });

  describe('tailscale', () => {
    it('points tailscale serve at Otea and makes it the phone transport', async () => {
      const { code, out } = await otea('phone', 'tailscale', '--port', '4455');

      expect(code).toBe(0);
      expect(cli.calls).toContain('serve 4455');
      expect(out).toContain(`https://${TAILNET_HOST}`);
      expect(out).toContain('install the Tailscale app');
      expect(out).toContain('Certificate Transparency');
      const status = JSON.parse((await otea('phone', 'status', '--json', '--port', '4455')).out);
      expect(status).toMatchObject({
        transport: 'tailscale',
        url: `https://${TAILNET_HOST}`,
        reachable: true,
      });
    });

    it('prints how to install Tailscale and installs nothing', async () => {
      cli.installed = false;

      const { code, err } = await otea('phone', 'tailscale');

      expect(code).toBe(20);
      expect(err).toContain('Tailscale is not installed');
      expect(err).toContain('https://tailscale.com/download');
      expect(cli.calls).toEqual([]);
      expect(JSON.parse((await otea('phone', 'status', '--json')).out).transport).toBe('lan');
    });

    it('explains the login, and runs tailscale up only with --login', async () => {
      cli.state = { ...cli.state, backend: 'NeedsLogin' };

      const explained = await otea('phone', 'tailscale');
      expect(explained.code).toBe(20);
      expect(explained.err).toContain('tailscale up');
      expect(cli.calls).not.toContain('up');

      const logged = await otea('phone', 'tailscale', '--login');
      expect(logged.code).toBe(0);
      expect(cli.calls).toContain('up');
    });

    it('explains turning HTTPS certificates on', async () => {
      cli.state = { ...cli.state, https: false };

      const { code, err } = await otea('phone', 'tailscale');

      expect(code).toBe(20);
      expect(err).toContain('HTTPS');
      expect(err).toContain('https://login.tailscale.com/admin/dns');
    });
  });

  describe('status', () => {
    it('says the local network is the default', async () => {
      const { code, out } = await otea('phone', 'status');

      expect(code).toBe(0);
      expect(out).toContain('Transport: local network');
    });

    it('says when Tailscale stopped forwarding', async () => {
      await otea('phone', 'tailscale');
      cli.routes = [];

      const status = JSON.parse((await otea('phone', 'status', '--json')).out);

      expect(status).toMatchObject({ transport: 'tailscale', reachable: false });
      expect((await otea('phone', 'status')).out).toContain('otea phone tailscale');
    });
  });

  it('makes otea serve print a pairing code that opens the HTTPS name', async () => {
    await otea('phone', 'tailscale');

    const { code, out } = await otea('serve', '--port', '0', '--no-open', '--json');
    const { phone } = JSON.parse(out);

    expect(code).toBe(0);
    expect(phone).toMatchObject({ transport: 'tailscale', urls: [`https://${TAILNET_HOST}`] });
    expect(phone.pairingUrl).toBe(`https://${TAILNET_HOST}/pair#code=${phone.code}`);
  });

  it('goes back to the local network', async () => {
    await otea('phone', 'tailscale');

    const { code, out } = await otea('phone', 'lan');

    expect(code).toBe(0);
    expect(out).toContain('otea serve --lan');
    expect(out).toContain('tailscale serve --https=443 off');
    expect(JSON.parse((await otea('phone', 'status', '--json')).out).transport).toBe('lan');
  });

  it('refuses the Otea relay, which is not available yet', async () => {
    const { code, err } = await otea('phone', 'relay');

    expect(code).toBe(20);
    expect(err).toContain('not available yet');
  });
});
