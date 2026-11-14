import { listDevices } from '../app/devices.ts';
import {
  choosePhoneTransport,
  type PhoneStatus,
  phoneSettings,
  phoneStatus,
  RELAY_UNAVAILABLE,
  switchToTailscale,
} from '../app/phone.ts';
import { openProject, type Project } from '../app/project.ts';
import type { TailscaleCheck } from '../app/tailscale.ts';
import { lanAddresses, localName } from '../server/lan.ts';
import { type Command, CommandFailure } from './command.ts';
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

function statusText(status: PhoneStatus, running: number | undefined, devices: number): string {
  const lines: string[] = [];
  const tailscale = status.transport === 'tailscale';
  lines.push(`Transport: ${tailscale ? 'Tailscale' : 'local network'}`);
  lines.push(`URL: ${status.url ?? 'none (this computer has no private network address)'}`);
  const reach =
    status.reachable === null
      ? 'nothing to try'
      : status.reachable
        ? 'yes'
        : tailscale
          ? 'no (run otea phone tailscale)'
          : 'no (start otea serve --lan)';
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
      return {
        data: { ...status, port, running: running !== undefined, devices },
        text: statusText(status, running, devices),
      };
    }),
};

const phoneLan: Command = {
  name: 'phone lan',
  summary:
    'Pair phones over the local network (the default): plain HTTP to this computer, opened with otea serve --lan',
  args: [],
  options: {},
  execute: ({ cwd }) =>
    withProject(cwd, async (project) => {
      const was = phoneSettings(project.db);
      const settings = choosePhoneTransport(project.db, { transport: 'lan', tailscaleHost: null });
      const lines = [
        'Phones now pair over the local network. Start otea serve --lan (restart it if it runs without --lan) to let them in.',
        ...(was.tailscaleHost
          ? [
              `tailscale serve may still forward https://${was.tailscaleHost} to this computer; Otea no longer answers through it. Stop it with: tailscale serve --https=443 off`,
            ]
          : []),
      ];
      return { data: settings, text: lines.join('\n') };
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
