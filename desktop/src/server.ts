// Finding the project's `otea serve`, or starting one. Everything goes through the otea CLI and the
// files it writes in the project's data folder (serve.json, ui-token), so the shell never opens the
// database itself and stays a client like the browser.
import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Probe } from './pick.ts';

// `env` is added to the environment the CLI runs in.
export type Cli = {
  command: string;
  args: readonly string[];
  env?: Readonly<Record<string, string>>;
};

export type Project = { id: string; name: string; root: string; dataDir: string };

export type Connection = {
  project: Project;
  url: string;
  signInUrl: string;
  // Set when the shell started the server, which it then stops on quit.
  child?: ChildProcess;
};

// The CLI of this checkout, run by the system's Node (the same way as `npm run otea`).
export function sourceCli(repoRoot: string): Cli {
  return {
    command: 'node',
    args: ['--disable-warning=ExperimentalWarning', join(repoRoot, 'src', 'cli', 'main.ts')],
  };
}

// The CLI the packaged app carries in resources/otea, run on the app's own Electron as Node, the
// same way its bin/otea runs it for a terminal.
export function bundledCli(resourcesPath: string, execPath: string): Cli {
  return {
    command: execPath,
    args: [join(resourcesPath, 'otea', 'src', 'cli', 'main.ts')],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}

const envOf = (cli: Cli) => (cli.env ? { ...process.env, ...cli.env } : process.env);

// A failure of the CLI: its message, and with --json its code and details, for the shell to say
// it in its own words.
export type CliError = Error & { code?: string; details?: unknown };

export function cliError(stderr: string, fallback: string): CliError {
  try {
    const parsed = JSON.parse(stderr) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    const { code, message, details } = parsed.error ?? {};
    if (message) {
      return Object.assign(new Error(message), {
        ...(code === undefined ? {} : { code }),
        ...(details === undefined ? {} : { details }),
      });
    }
  } catch {
    // not JSON: the text itself says it
  }
  return new Error(stderr.trim() || fallback);
}

function runJson<T>(cli: Cli, cwd: string, args: readonly string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile(
      cli.command,
      [...cli.args, ...args, '--json'],
      { cwd, windowsHide: true, env: envOf(cli) },
      (error, stdout, stderr) => {
        if (error) reject(cliError(stderr, error.message));
        else resolve(JSON.parse(stdout) as T);
      },
    );
  });
}

export function currentProject(cli: Cli, cwd: string): Promise<Project> {
  return runJson(cli, cwd, ['projects', 'current']);
}

// Whether the folder is in a project; when it is not, the CLI names where init would make one.
export async function probeProject(cli: Cli, cwd: string): Promise<Probe> {
  try {
    const project = await currentProject(cli, cwd);
    return { kind: 'project', root: project.root };
  } catch (error) {
    const { code, details } = error as CliError;
    const root = (details as { kind?: string; root?: unknown } | undefined)?.root;
    if (code === 'not_found' && typeof root === 'string') return { kind: 'none', root };
    throw error;
  }
}

// `otea init` in the folder: the project at its repository root (or the folder), made or reused;
// `here` makes a separate one inside a project that covers the folder.
export async function createProject(cli: Cli, cwd: string, here = false): Promise<void> {
  await runJson(cli, cwd, here ? ['init', '--here'] : ['init']);
}

export function readServeFile(dataDir: string): { port: number; pid: number } | undefined {
  try {
    const info = JSON.parse(readFileSync(join(dataDir, 'serve.json'), 'utf8'));
    return Number.isInteger(info.port) && Number.isInteger(info.pid) ? info : undefined;
  } catch {
    return undefined;
  }
}

export function readUiToken(dataDir: string): string | undefined {
  try {
    const token = readFileSync(join(dataDir, 'ui-token'), 'utf8').trim();
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
  } catch {
    return undefined;
  }
}

export const signInUrl = (url: string, token: string) =>
  `${url}/auth?token=${encodeURIComponent(token)}`;

// Whether the server on that URL is this project's: it accepts this project's token.
export async function servesThisProject(link: string): Promise<boolean> {
  try {
    const response = await fetch(link, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
    await response.body?.cancel();
    return response.status === 302 && response.headers.get('location') === '/';
  } catch {
    return false;
  }
}

// `otea serve --json` prints {"url": ...} once it listens and keeps running until it is stopped.
export function startServe(
  cli: Cli,
  cwd: string,
  port?: number,
): Promise<{ url: string; child: ChildProcess }> {
  const args = [...cli.args, 'serve', '--no-open', '--json'];
  if (port !== undefined) args.push('--port', String(port));
  const child = spawn(cli.command, args, {
    cwd,
    env: envOf(cli),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(cliError(stderr, `otea serve exited with code ${code}`)));
    const lines = createInterface({ input: child.stdout as NodeJS.ReadableStream });
    lines.once('line', (line) => {
      try {
        const { url } = JSON.parse(line) as { url: string };
        child.removeAllListeners('exit');
        resolve({ url, child });
      } catch {
        child.kill();
        reject(new Error(`Unexpected output from otea serve: ${line}`));
      }
    });
  });
}

// otea serve's default port; the shell tries the next ones when another project already serves on
// it, so opening a second project never fails on a taken port.
const DEFAULT_PORT = 4400;
const NEARBY_PORTS = 9;

const portTaken = (error: unknown) =>
  error instanceof Error && /is already in use/.test(error.message);

// Starts on the port asked for; without one, on the default, then the next ports, then any free one
// the system picks (port 0). A port asked for is kept: when taken, that is the error.
export async function startOnFreePort<T>(
  start: (port?: number) => Promise<T>,
  port?: number,
): Promise<T> {
  if (port !== undefined) return start(port);
  const candidates = [...Array.from({ length: NEARBY_PORTS }, (_, n) => DEFAULT_PORT + 1 + n), 0];
  try {
    return await start();
  } catch (error) {
    if (!portTaken(error)) throw error;
  }
  for (const candidate of candidates) {
    try {
      return await start(candidate);
    } catch (error) {
      if (!portTaken(error) || candidate === 0) throw error;
    }
  }
  throw new Error('No free port to serve on');
}

// Attach to the project's running server when there is one, start it otherwise.
export async function connect(cli: Cli, cwd: string, port?: number): Promise<Connection> {
  const project = await currentProject(cli, cwd);
  const running = readServeFile(project.dataDir);
  const token = readUiToken(project.dataDir);
  if (running && token) {
    const url = `http://127.0.0.1:${running.port}`;
    const link = signInUrl(url, token);
    if (await servesThisProject(link)) return { project, url, signInUrl: link };
  }
  const { url, child } = await startOnFreePort((free) => startServe(cli, cwd, free), port);
  const started = readUiToken(project.dataDir);
  if (!started) {
    child.kill();
    throw new Error(`otea serve started without a sign-in token in ${project.dataDir}`);
  }
  return { project, url, signInUrl: signInUrl(url, started), child };
}
