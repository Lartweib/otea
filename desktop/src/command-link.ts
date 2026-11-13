// "Install the otea command" on macOS, as VS Code installs `code`: a symlink in /usr/local/bin to the
// app's bin/otea, which runs the CLI on the app's Electron. Windows gets it from the installer and
// Linux from the package; a Mac app is dragged to Applications, so the app offers it itself. Every
// effect goes through LinkPort (wired in main.ts) so the decisions are tested without touching disk.
import { dirname } from 'node:path';

export type LinkState = { kind: 'missing' } | { kind: 'link'; to: string } | { kind: 'file' };

export type LinkPort = {
  state(link: string): LinkState;
  writable(dir: string): boolean;
  symlink(target: string, link: string): void;
  // Runs an AppleScript, which asks macOS for an administrator's password.
  runAdmin(script: string): Promise<void>;
  // Asks the person; 'replace' when another otea is there.
  confirm(plan: 'install' | 'replace'): Promise<boolean>;
};

export const COMMAND_LINK = '/usr/local/bin/otea';

const shellQuote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
const appleQuote = (text: string) => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

export function adminScript(target: string, link: string): string {
  const command = `mkdir -p ${shellQuote(dirname(link))} && ln -sf ${shellQuote(target)} ${shellQuote(link)}`;
  return `do shell script ${appleQuote(command)} with administrator privileges`;
}

export function isInstalled(state: LinkState, target: string): boolean {
  return state.kind === 'link' && state.to === target;
}

export async function installCommand(
  port: LinkPort,
  target: string,
  link: string,
): Promise<'installed' | 'cancelled'> {
  const state = port.state(link);
  if (isInstalled(state, target)) return 'installed';
  if (!(await port.confirm(state.kind === 'missing' ? 'install' : 'replace'))) return 'cancelled';
  if (port.writable(dirname(link))) port.symlink(target, link);
  else await port.runAdmin(adminScript(target, link));
  return 'installed';
}
