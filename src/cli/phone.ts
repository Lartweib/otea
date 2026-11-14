import { listDevices } from '../app/devices.ts';
import {
  choosePhoneTransport,
  lanOpen,
  type PhoneStatus,
  phoneSettings,
  phoneStatus,
  RELAY_UNAVAILABLE,
  setLanOpen,
  switchToTailscale,
} from '../app/phone.ts';
import { openProject, type Project } from '../app/project.ts';
import type { TailscaleCheck } from '../app/tailscale.ts';
import { lanAddresses, localName } from '../server/lan.ts';
import { sessionCookie } from '../server/session.ts';
import { readUiToken } from '../server/token.ts';
import { type Command, CommandFailure, UsageError } from './command.ts';
import { portToOpen } from './ports.ts';
import { readServeFile } from './serve-file.ts';

// otea phone: how a phone reaches the desk. The local network is the default; Tailscale is set up
// here; the Otea relay is a seam for later. See app/phone.ts.

async function withProject<T>(cwd: string, use: (project: Project) => Promise<T>): Promise<T> {
  const project = openProject(cwd);
  try {
    return await use(project);
  } finally {
    project.db.close();
  }
}

export const LEDGER_NOTE =
  "Note: Tailscale's HTTPS certificate is public: this computer's name on the tailnet (<machine>.<tailnet>.ts.net) is listed in the Certificate Transparency logs.";

const PHONE_STEPS = [
  'On the phone: install the Tailscale app, log in with the same account, then scan the pairing code.',
  'The code is in the UI under Settings > Phone > Pair a phone (otea serve prints one when it starts).',
];

// What stops Tailscale, and what the person does about it; Otea never installs or logs in for them.
export function tailscaleProblem(check: Exclude<TailscaleCheck, { state: 'ready' }>): string {
  switch (check.state) {
    case 'missing':
      return [
        'Tailscale is not installed. Otea does not install it; install it yourself:',
        ...check.install.commands.map((command) => `  ${command}`),
        `  or download it from ${check.install.link}`,
        'Then log in, and run otea phone tailscale again.',
      ].join('\n');
    case 'logged_out':
      return [
        'Tailscale is installed but not logged in. Run: tailscale up',
        ...(check.authUrl ? [`  or open ${check.authUrl}`] : []),
        'and log in once in the browser it opens (or run otea phone tailscale --login to start it from here).',
      ].join('\n');
    case 'no_magic_dns':
      return `MagicDNS is off on your tailnet. Turn it on at ${check.settings} (it is on by default on new tailnets), then run otea phone tailscale again.`;
    case 'no_https':
      return `HTTPS certificates are off on your tailnet. Turn them on at ${check.settings} (under HTTPS Certificates), then run otea phone tailscale again.`;
    case 'taken':
      return `https://${check.host}/ already forwards to ${check.target}. Free it with: tailscale serve --https=443 off, then run otea phone tailscale again.`;
    case 'failed':
      return check.message;
  }
}

function lanUrls(port: number): Promise<string[]> {
  const addresses = lanAddresses();
  return localName(addresses).then((name) =>
    [...(name ? [name] : []), ...addresses].map((host) => `http://${host}:${port}`),
  );
}

type Shown = { running: number | undefined; devices: number; open: boolean };

function statusText(status: PhoneStatus, { running, devices, open }: Shown): string {
  const lines: string[] = [];
  const tailscale = status.transport === 'tailscale';
  lines.push(`Transport: ${tailscale ? 'Tailscale' : 'local network'}`);
  lines.push(`Open to the local network: ${open ? 'yes' : 'no (otea phone lan --open)'}`);
  lines.push(`URL: ${status.url ?? 'none (this computer has no private network address)'}`);
  const reach =
    status.reachable === null
      ? 'nothing to try'
      : status.reachable
        ? 'yes'
        : tailscale
          ? 'no (run otea phone tailscale)'
          : 'no (open it with otea phone lan --open, or in Settings > Phone)';
  lines.push(`Reachable: ${reach}`);
  lines.push(
    running === undefined ? 'Otea: not running (otea serve)' : `Otea: running on port ${running}`,
  );
  lines.push(`Paired devices: ${devices}`);
  if (status.tailscale && status.tailscale.state !== 'ready') {
    lines.push(tailscaleProblem(status.tailscale));
  }
  if (tailscale) lines.push(LEDGER_NOTE);
  return lines.join('\n');
}

const phoneStatusCommand: Command = {
  name: 'phone status',
  summary:
    'Show how a phone reaches this project: the transport (local network or Tailscale), its URL, whether Otea answers there, and the paired devices',
  args: [],
  options: { port: {} },
  execute: ({ cwd, option, tailscale, probe }) =>
    withProject(cwd, async (project) => {
      const port = portToOpen(project.dataDir, option('port'));
      const running = readServeFile(project.dataDir)?.port;
      const urls = phoneSettings(project.db).transport === 'lan' ? await lanUrls(port) : [];
      const status = await phoneStatus(project.db, { port, lanUrls: urls, tailscale, probe });
      const devices = listDevices(project.db).length;
      const open = lanOpen(project.db);
      return {
        data: { ...status, lanOpen: open, port, running: running !== undefined, devices },
        text: statusText(status, { running, devices, open }),
      };
    }),
};

// Opens or closes the local network on the otea serve running on `port`, as Settings › Phone
// does: from this computer, signed in with the project's key. It keeps the choice itself. Says
// 'down' when nothing answers there (a serve file left behind), so the choice is kept here instead.
async function tellRunning(dir: string, port: number, open: boolean): Promise<'done' | 'down'> {
  const token = readUiToken(dir);
  if (!token) return 'down';
  const base = `http://127.0.0.1:${port}`;
  let response: Response;
  try {
    response = await fetch(`${base}/api/lan/${open ? 'open' : 'close'}`, {
      method: 'POST',
      headers: {
        cookie: `${sessionCookie(port)}=${token}`,
        origin: base,
        'content-type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return 'down';
  }
  if (response.ok) {
    await response.body?.cancel();
    return 'done';
  }
  const body = (await response.json().catch(() => undefined)) as
    | { error?: { message?: string } }
    | undefined;
  throw new CommandFailure(
    'transport_unavailable',
    `The otea serve on port ${port} could not ${open ? 'open' : 'close'} the local network: ${body?.error?.message ?? `HTTP ${response.status}`}`,
  );
}

// Keeps the choice, on the running otea serve when there is one; says where it stands.
async function keepLan(project: Project, open: boolean): Promise<string> {
  const running = readServeFile(project.dataDir)?.port;
  const told = running === undefined ? 'down' : await tellRunning(project.dataDir, running, open);
  if (told === 'done') {
    return open
      ? `The otea serve on port ${running} is open to it now, and every otea serve after starts open.`
      : `The otea serve on port ${running} stopped listening on the network.`;
  }
  setLanOpen(project.db, open);
  return open
    ? 'Otea is not running: the next otea serve starts open to it.'
    : 'Otea is not running; the next otea serve answers this computer only.';
}

const phoneLan: Command = {
  name: 'phone lan',
  summary:
    'Pair phones over the local network (the default): plain HTTP to this computer; --open opens it to phones now and for every otea serve after (the same as Settings > Phone), --close closes it again',
  args: [],
  options: { open: { flag: true }, close: { flag: true } },
  execute: ({ cwd, flag }) =>
    withProject(cwd, async (project) => {
      if (flag('open') && flag('close')) {
        throw new UsageError('--open cannot be combined with --close');
      }
      if (flag('close')) {
        const lines = [
          'Otea is closed to the local network.',
          await keepLan(project, false),
          'Paired phones stay paired; they reach Otea again once it is open.',
        ];
        return { data: { ...phoneSettings(project.db), lanOpen: false }, text: lines.join('\n') };
      }
      const was = phoneSettings(project.db);
      const settings = choosePhoneTransport(project.db, { transport: 'lan', tailscaleHost: null });
      const kept = flag('open') ? await keepLan(project, true) : undefined;
      const open = lanOpen(project.db);
      const lines = [
        open
          ? 'Phones now pair over the local network, and Otea is open to it.'
          : 'Phones now pair over the local network. Open Otea to it with otea phone lan --open, or in Settings > Phone.',
        ...(kept === undefined ? [] : [kept]),
        ...(kept !== undefined && process.platform === 'win32'
          ? ['Windows may ask once to let Otea through its firewall; Otea never changes it itself.']
          : []),
        ...(was.tailscaleHost
          ? [
              `tailscale serve may still forward https://${was.tailscaleHost} to this computer; Otea no longer answers through it. Stop it with: tailscale serve --https=443 off`,
            ]
          : []),
      ];
      return { data: { ...settings, lanOpen: open }, text: lines.join('\n') };
    }),
};

const phoneTailscale: Command = {
  name: 'phone tailscale',
  summary:
    'Pair phones through Tailscale: checks the tailscale CLI, its login, MagicDNS and HTTPS certificates, then runs tailscale serve so https://<machine>.<tailnet>.ts.net reaches Otea from your own devices anywhere; installs nothing, --login runs tailscale up',
  args: [],
  options: { port: {}, login: { flag: true } },
  execute: ({ cwd, option, flag, tailscale }) =>
    withProject(cwd, async (project) => {
      const port = portToOpen(project.dataDir, option('port'));
      const check = await switchToTailscale(project.db, tailscale, port, { login: flag('login') });
      if (check.state !== 'ready') {
        throw new CommandFailure('transport_unavailable', tailscaleProblem(check));
      }
      const running = readServeFile(project.dataDir)?.port;
      const lines = [
        `Tailscale ready: ${check.url} forwards to Otea on port ${port} (tailscale serve: your tailnet only, never funnel).`,
        'Phones now pair through Tailscale; the pairing code, device tokens and what a phone may do are the same.',
        ...PHONE_STEPS,
        ...(running === port ? [] : [`Start otea serve --port ${port} for the phone to reach it.`]),
        LEDGER_NOTE,
      ];
      return { data: { transport: 'tailscale', url: check.url, port }, text: lines.join('\n') };
    }),
};

const phoneRelay: Command = {
  name: 'phone relay',
  summary: 'Pair phones through the Otea relay, a future service: not available yet',
  args: [],
  options: {},
  execute: () => {
    throw new CommandFailure('transport_unavailable', RELAY_UNAVAILABLE);
  },
};

export const PHONE_COMMANDS: readonly Command[] = [
  phoneStatusCommand,
  phoneLan,
  phoneTailscale,
  phoneRelay,
];
