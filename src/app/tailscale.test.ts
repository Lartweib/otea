import { describe, expect, it } from 'vitest';
import {
  checkTailscale,
  DNS_SETTINGS_URL,
  installHint,
  PHONE_STORES,
  parseServeStatus,
  parseStatus,
  readGuide,
  SERVE_UNDO,
  serveCommand,
  setUpTailscale,
  TailscaleFailure,
} from './tailscale.ts';
import { fakeTailscale, TAILNET_HOST } from './tailscale-testing.ts';

describe('reading the tailscale CLI', () => {
  it('reads status --json: backend, MagicDNS name, certificates and the login link', () => {
    expect(
      parseStatus({
        BackendState: 'Running',
        Self: { DNSName: 'Desk.tail1.ts.net.', HostName: 'desk' },
        CurrentTailnet: { Name: 'me@example.com', MagicDNSEnabled: true },
        CertDomains: ['desk.tail1.ts.net'],
      }),
    ).toEqual({
      backend: 'Running',
      dnsName: 'desk.tail1.ts.net',
      magicDns: true,
      https: true,
      authUrl: null,
      phoneOnTailnet: false,
    });
    expect(
      parseStatus({ BackendState: 'NeedsLogin', AuthURL: 'https://login.tailscale.com/a/1' }),
    ).toEqual({
      backend: 'NeedsLogin',
      dnsName: null,
      magicDns: false,
      https: false,
      authUrl: 'https://login.tailscale.com/a/1',
      phoneOnTailnet: false,
    });
    expect(parseStatus(null).backend).toBe('NoState');
  });

  it('sees a phone on the tailnet among the peers, by its system', () => {
    const peers = (...systems: string[]) => ({
      BackendState: 'Running',
      Peer: Object.fromEntries(systems.map((OS, n) => [`key${n}`, { OS, HostName: `p${n}` }])),
    });
    expect(parseStatus(peers('linux', 'android')).phoneOnTailnet).toBe(true);
    expect(parseStatus(peers('iOS')).phoneOnTailnet).toBe(true);
    expect(parseStatus(peers('windows', 'macOS')).phoneOnTailnet).toBe(false);
    expect(parseStatus({ Peer: 'junk' }).phoneOnTailnet).toBe(false);
  });

  it('reads serve status --json into the routes it forwards', () => {
    expect(
      parseServeStatus({
        TCP: { '443': { HTTPS: true } },
        Web: {
          'desk.tail1.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:4400' } } },
          'desk.tail1.ts.net:8443': { Handlers: { '/files': { Path: '/srv' } } },
        },
      }),
    ).toEqual([
      { host: 'desk.tail1.ts.net', port: 443, path: '/', target: 'http://127.0.0.1:4400' },
    ]);
    expect(parseServeStatus({})).toEqual([]);
  });

  it('says how to install it on each system, never installing it', () => {
    expect(installHint('win32').commands[0]).toMatch(/winget install/);
    expect(installHint('darwin').link).toBe('https://tailscale.com/download/mac');
    expect(installHint('linux').commands[0]).toMatch(/install\.sh/);
  });
});

describe('setting Tailscale up for Otea', () => {
  it('stops at a missing CLI with how to install it', async () => {
    const cli = fakeTailscale();
    cli.installed = false;

    const check = await setUpTailscale(cli, 4400, { platform: 'win32' });

    expect(check).toEqual({ state: 'missing', install: installHint('win32') });
    expect(cli.calls).toEqual([]);
  });

  it('explains the login and runs tailscale up only when asked to', async () => {
    const cli = fakeTailscale({
      backend: 'NeedsLogin',
      authUrl: 'https://login.tailscale.com/a/1',
    });

    expect(await setUpTailscale(cli, 4400)).toEqual({
      state: 'logged_out',
      authUrl: 'https://login.tailscale.com/a/1',
    });
    expect(cli.calls).not.toContain('up');

    const done = await setUpTailscale(cli, 4400, { login: true });

    expect(cli.calls).toContain('up');
    expect(done).toEqual({
      state: 'ready',
      host: TAILNET_HOST,
      url: `https://${TAILNET_HOST}`,
      serving: true,
    });
  });

  it('explains MagicDNS and HTTPS certificates when the tailnet has them off', async () => {
    expect(await setUpTailscale(fakeTailscale({ magicDns: false }), 4400)).toMatchObject({
      state: 'no_magic_dns',
      settings: 'https://console.tailscale.com/admin/dns',
    });
    const noCerts = fakeTailscale({ https: false });
    expect(await setUpTailscale(noCerts, 4400)).toMatchObject({ state: 'no_https' });
    expect(noCerts.calls).not.toContain('serve 4400');
  });

  it('points tailscale serve at Otea’s port, once', async () => {
    const cli = fakeTailscale();

    expect(await setUpTailscale(cli, 4401)).toMatchObject({ state: 'ready', serving: true });
    const serves = () => cli.calls.filter((call) => /^serve \d/.test(call));
    expect(serves()).toEqual(['serve 4401']);

    await setUpTailscale(cli, 4401);
    expect(serves()).toEqual(['serve 4401']);
  });

  it('leaves alone an HTTPS name that already forwards somewhere else', async () => {
    const cli = fakeTailscale();
    cli.routes = [{ host: TAILNET_HOST, port: 443, path: '/', target: 'http://127.0.0.1:3000' }];

    expect(await setUpTailscale(cli, 4400)).toEqual({
      state: 'taken',
      host: TAILNET_HOST,
      target: 'http://127.0.0.1:3000',
    });
    expect(cli.calls).not.toContain('serve 4400');
  });

  it('passes on what tailscale said when it fails', async () => {
    const cli = fakeTailscale();
    cli.serveError = new TailscaleFailure('tailscale serve failed: Access denied');

    expect(await setUpTailscale(cli, 4400)).toEqual({
      state: 'failed',
      message: 'tailscale serve failed: Access denied',
    });
  });

  it('checks without changing anything', async () => {
    const cli = fakeTailscale();

    expect(await checkTailscale(cli, 4400)).toMatchObject({ state: 'ready', serving: false });
    expect(cli.calls).toEqual(['status', 'serve status']);
  });
});

describe('the guided path to Tailscale', () => {
  it('names the one command Otea may run, and how to undo it', () => {
    expect(serveCommand(4400)).toBe('tailscale serve --bg --https=443 http://127.0.0.1:4400');
    expect(serveCommand(4417)).toBe('tailscale serve --bg --https=443 http://127.0.0.1:4417');
    expect(SERVE_UNDO).toBe('tailscale serve --https=443 off');
  });

  it('links the official store pages and the DNS page of the admin console', () => {
    expect(PHONE_STORES).toEqual({
      android: 'https://play.google.com/store/apps/details?id=com.tailscale.ipn',
      ios: 'https://apps.apple.com/us/app/tailscale/id1470499037',
    });
    expect(DNS_SETTINGS_URL).toBe('https://console.tailscale.com/admin/dns');
  });

  it('marks every step pending when Tailscale is not on this computer', async () => {
    const cli = fakeTailscale();
    cli.installed = false;

    const guide = await readGuide(cli, 4400, { platform: 'darwin', pushOn: false });

    expect(guide.done).toEqual({
      phone: false,
      pc: false,
      signIn: false,
      https: false,
      serve: false,
      pair: false,
    });
    expect(guide.signedIn).toBe(false);
    expect(guide.install.link).toBe('https://tailscale.com/download/mac');
    expect(guide.command).toBe(serveCommand(4400));
    expect(cli.calls).toEqual([]);
  });

  it('marks what it reads as done, and changes nothing', async () => {
    const cli = fakeTailscale({ phoneOnTailnet: true });

    const ready = await readGuide(cli, 4400, { pushOn: false });

    expect(ready.done).toEqual({
      phone: true,
      pc: true,
      signIn: true,
      https: true,
      serve: false,
      pair: false,
    });
    expect(ready.host).toBe(TAILNET_HOST);
    expect(cli.calls).toEqual(['status', 'serve status']);

    cli.routes = [{ host: TAILNET_HOST, port: 443, path: '/', target: 'http://127.0.0.1:4400' }];
    const served = await readGuide(cli, 4400, { pushOn: true });
    expect(served.done.serve).toBe(true);
    expect(served.done.pair).toBe(true);
    expect(served.check).toMatchObject({ state: 'ready', serving: true });
  });

  it('keeps the sign-in pending until the phone shows up on the same tailnet', async () => {
    const guide = await readGuide(fakeTailscale(), 4400, { pushOn: false });

    expect(guide.signedIn).toBe(true);
    expect(guide.done).toMatchObject({ pc: true, phone: false, signIn: false, https: true });
  });

  it('reads MagicDNS and certificates apart, and a login still missing', async () => {
    const noCerts = await readGuide(fakeTailscale({ https: false }), 4400, { pushOn: false });
    expect(noCerts.done.https).toBe(false);
    expect(noCerts.check.state).toBe('no_https');

    const out = await readGuide(
      fakeTailscale({ backend: 'NeedsLogin', phoneOnTailnet: true }),
      4400,
      {
        pushOn: false,
      },
    );
    expect(out.signedIn).toBe(false);
    expect(out.done).toMatchObject({ pc: true, signIn: false, https: false, serve: false });
  });

  it('says a forward to something else is not Otea served', async () => {
    const cli = fakeTailscale();
    cli.routes = [{ host: TAILNET_HOST, port: 443, path: '/', target: 'http://127.0.0.1:3000' }];

    const guide = await readGuide(cli, 4400, { pushOn: false });

    expect(guide.done.serve).toBe(false);
    expect(guide.check).toMatchObject({ state: 'taken', target: 'http://127.0.0.1:3000' });
  });
});
