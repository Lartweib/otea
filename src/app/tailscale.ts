// Tailscale as a phone transport, the steps Otea takes on this computer: find the tailscale CLI,
// see that it is logged in with MagicDNS and HTTPS certificates on, then have `tailscale serve`
// forward `https://<machine>.<tailnet>.ts.net` to Otea's port. The CLI sits behind TailscaleCli
// (tailscale-cli.ts runs the real one); everything here only reads what it answers, so tests fake
// it and never touch this computer's network.

export type TailscaleStatus = {
  // BackendState: Running once logged in and connected; NeedsLogin, Stopped, NeedsMachineAuth…
  backend: string;
  // This computer's MagicDNS name, `<machine>.<tailnet>.ts.net`, without the final dot.
  dnsName: string | null;
  magicDns: boolean;
  // Whether the tailnet hands out HTTPS certificates (CertDomains lists this computer's name).
  https: boolean;
  // The login link while the backend waits for one.
  authUrl: string | null;
  // Whether a phone (Android or iOS) is on the same tailnet: its app is installed and signed in.
  phoneOnTailnet: boolean;
};

// One route `tailscale serve` runs: the HTTPS port and path it answers, and where it forwards.
export type ServeRoute = { host: string; port: number; path: string; target: string };

export class TailscaleFailure extends Error {
  override readonly name = 'TailscaleFailure';
}

export type TailscaleCli = {
  // The tailscale CLI's path, or nothing when it is not installed.
  locate(): string | undefined;
  status(): Promise<TailscaleStatus>;
  serveStatus(): Promise<ServeRoute[]>;
  // `tailscale up`: the person logs in once, in the browser it opens.
  up(): Promise<void>;
  // serveCommand(port): the one change Otea makes, and only once the person confirms it.
  serve(port: number): Promise<void>;
};

export type Platform = 'win32' | 'darwin' | 'linux' | string;

export type InstallHint = { commands: string[]; link: string };

// How to install Tailscale here; Otea never installs it itself.
export function installHint(platform: Platform): InstallHint {
  if (platform === 'win32') {
    return {
      commands: ['winget install --id tailscale.tailscale'],
      link: 'https://tailscale.com/download/windows',
    };
  }
  if (platform === 'darwin') {
    return {
      commands: ['brew install --cask tailscale'],
      link: 'https://tailscale.com/download/mac',
    };
  }
  return {
    commands: ['curl -fsSL https://tailscale.com/install.sh | sh'],
    link: 'https://tailscale.com/download/linux',
  };
}

// Where MagicDNS and HTTPS Certificates are turned on (tailscale.com/kb/1153/enabling-https).
export const DNS_SETTINGS_URL = 'https://console.tailscale.com/admin/dns';

// The Tailscale app's store pages, as tailscale.com/download/android and /download/ios link them.
export const PHONE_STORES = {
  android: 'https://play.google.com/store/apps/details?id=com.tailscale.ipn',
  ios: 'https://apps.apple.com/us/app/tailscale/id1470499037',
} as const;

// What Otea runs on this computer for Tailscale, shown to the person word for word first:
// `tailscale serve` answers https://<machine>.<tailnet>.ts.net with an automatic certificate and
// forwards it to Otea, for the tailnet only (serve, never funnel), and keeps it across restarts
// (--bg). SERVE_UNDO stops it again (tailscale.com/kb/1242/tailscale-serve).
export const serveCommand = (port: number): string =>
  `tailscale serve --bg --https=443 http://127.0.0.1:${port}`;

export const SERVE_UNDO = 'tailscale serve --https=443 off';

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const trimDot = (name: string) => name.replace(/\.$/, '').toLowerCase();

// The systems a peer names when it is a phone or a tablet.
const PHONE_SYSTEMS = new Set(['android', 'iOS']);

// `tailscale status --json`, the parts Otea reads.
export function parseStatus(json: unknown): TailscaleStatus {
  const status = record(json);
  const self = record(status.Self);
  const tailnet = record(status.CurrentTailnet);
  const dns =
    typeof self.DNSName === 'string' && self.DNSName !== '' ? trimDot(self.DNSName) : null;
  const certs = Array.isArray(status.CertDomains) ? status.CertDomains : [];
  const peers = Object.values(record(status.Peer)).map(record);
  return {
    backend: typeof status.BackendState === 'string' ? status.BackendState : 'NoState',
    dnsName: dns,
    magicDns: tailnet.MagicDNSEnabled === true,
    https: certs.some((domain) => typeof domain === 'string' && domain !== ''),
    authUrl: typeof status.AuthURL === 'string' && status.AuthURL !== '' ? status.AuthURL : null,
    phoneOnTailnet: peers.some(({ OS }) => typeof OS === 'string' && PHONE_SYSTEMS.has(OS)),
  };
}

// `tailscale serve status --json`: `Web` maps `<host>:<port>` to its handlers by path.
export function parseServeStatus(json: unknown): ServeRoute[] {
  const routes: ServeRoute[] = [];
  for (const [hostPort, web] of Object.entries(record(record(json).Web))) {
    const at = hostPort.lastIndexOf(':');
    const host = trimDot(at < 0 ? hostPort : hostPort.slice(0, at));
    const port = at < 0 ? 443 : Number(hostPort.slice(at + 1));
    for (const [path, handler] of Object.entries(record(record(web).Handlers))) {
      const target = record(handler).Proxy;
      if (typeof target === 'string') routes.push({ host, port, path, target });
    }
  }
  return routes;
}

// Whether a route forwards to Otea on this port (tailscale serve writes 127.0.0.1 or localhost).
export function forwardsTo(route: ServeRoute, port: number): boolean {
  const target = route.target.replace(/\/$/, '').toLowerCase();
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(target);
}

// Where Tailscale stands for Otea, from the first thing missing to ready.
export type TailscaleCheck =
  | { state: 'missing'; install: InstallHint }
  | { state: 'logged_out'; authUrl: string | null }
  | { state: 'no_magic_dns'; settings: string }
  | { state: 'no_https'; settings: string }
  // https://<host>/ already forwards somewhere else (another Otea project, another app).
  | { state: 'taken'; host: string; target: string }
  | { state: 'ready'; host: string; url: string; serving: boolean }
  // The CLI answered with an error (it is not running, it refused); what it said.
  | { state: 'failed'; message: string };

async function orFailed(read: () => Promise<TailscaleCheck>): Promise<TailscaleCheck> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof TailscaleFailure)) throw error;
    return { state: 'failed', message: error.message };
  }
}

// Reads where Tailscale stands without changing anything.
export function checkTailscale(
  cli: TailscaleCli,
  port: number,
  platform: Platform = process.platform,
): Promise<TailscaleCheck> {
  return orFailed(() => check(cli, port, platform));
}

async function check(
  cli: TailscaleCli,
  port: number,
  platform: Platform,
  read: () => Promise<TailscaleStatus> = () => cli.status(),
): Promise<TailscaleCheck> {
  if (cli.locate() === undefined) return { state: 'missing', install: installHint(platform) };
  const status = await read();
  if (status.backend !== 'Running') return { state: 'logged_out', authUrl: status.authUrl };
  if (!status.magicDns || status.dnsName === null) {
    return { state: 'no_magic_dns', settings: DNS_SETTINGS_URL };
  }
  if (!status.https) return { state: 'no_https', settings: DNS_SETTINGS_URL };
  const host = status.dnsName;
  const root = (await cli.serveStatus()).find(
    (route) => route.host === host && route.port === 443 && route.path === '/',
  );
  if (root && !forwardsTo(root, port)) return { state: 'taken', host, target: root.target };
  return { state: 'ready', host, url: `https://${host}`, serving: root !== undefined };
}

// The guided path to Tailscale (Configuración · Teléfono), step by step, each read from this
// computer: done or still to do. Nothing here changes Tailscale.
export const GUIDE_STEPS = ['phone', 'pc', 'signIn', 'https', 'serve', 'pair'] as const;

export type GuideStep = (typeof GUIDE_STEPS)[number];

export type TailscaleGuide = {
  done: Record<GuideStep, boolean>;
  // This computer is logged in (the phone may not be yet).
  signedIn: boolean;
  check: TailscaleCheck;
  host: string | null;
  command: string;
  undo: string;
  install: InstallHint;
  stores: typeof PHONE_STORES;
  settings: string;
};

export type GuideOptions = {
  platform?: Platform;
  // A paired device turned notifications on: only possible over HTTPS, the last step.
  pushOn: boolean;
};

export async function readGuide(
  cli: TailscaleCli,
  port: number,
  options: GuideOptions,
): Promise<TailscaleGuide> {
  const platform = options.platform ?? process.platform;
  const installed = cli.locate() !== undefined;
  let status: TailscaleStatus | null = null;
  const found = await orFailed(() =>
    check(cli, port, platform, async () => {
      status = await cli.status();
      return status;
    }),
  );
  const read = status as TailscaleStatus | null;
  const signedIn = read?.backend === 'Running';
  const phone = read?.phoneOnTailnet === true;
  const https = signedIn && read?.magicDns === true && read.https && read.dnsName !== null;
  const serve = found.state === 'ready' && found.serving;
  return {
    done: {
      phone,
      pc: installed,
      signIn: signedIn && phone,
      https,
      serve,
      pair: serve && options.pushOn,
    },
    signedIn,
    check: found,
    host: signedIn ? (read?.dnsName ?? null) : null,
    command: serveCommand(port),
    undo: SERVE_UNDO,
    install: installHint(platform),
    stores: PHONE_STORES,
    settings: DNS_SETTINGS_URL,
  };
}

export type SetUpOptions = {
  // Run `tailscale up` when it is logged out, so the person logs in in the browser.
  login?: boolean;
  platform?: Platform;
};

// Gets Tailscale ready for Otea: logs in when asked to, then points `tailscale serve` at the port.
export function setUpTailscale(
  cli: TailscaleCli,
  port: number,
  options: SetUpOptions = {},
): Promise<TailscaleCheck> {
  const platform = options.platform ?? process.platform;
  return orFailed(async () => {
    let found = await check(cli, port, platform);
    if (found.state === 'logged_out' && options.login) {
      await cli.up();
      found = await check(cli, port, platform);
    }
    if (found.state !== 'ready' || found.serving) return found;
    await cli.serve(port);
    return { ...found, serving: true };
  });
}

// A CLI that is not installed, for wherever no real one may run (tests, a server without one).
export const NO_TAILSCALE: TailscaleCli = {
  locate: () => undefined,
  status: () => Promise.reject(new TailscaleFailure('Tailscale is not installed')),
  serveStatus: () => Promise.reject(new TailscaleFailure('Tailscale is not installed')),
  up: () => Promise.reject(new TailscaleFailure('Tailscale is not installed')),
  serve: () => Promise.reject(new TailscaleFailure('Tailscale is not installed')),
};
