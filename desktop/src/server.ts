// Finding this computer's `otea serve`, or starting it: one server per Otea home serves every
// project, each at /p/<id>/. Everything goes through the otea CLI and the files it keeps in the Otea
// home (serve.json, ui-token), so the shell never opens a database itself and stays a client like
// the browser.
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

// `home`: the Otea home whose one server serves it.
export type Project = { id: string; name: string; root: string; dataDir: string; home: string };

export type Connection = {
  project: Project;
  // The project's page on the server, without the trailing slash (`<origin>/p/<id>`): its API is
  // under it.
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

export function readServeFile(home: string): { port: number; pid: number } | undefined {
  try {
    const info = JSON.parse(readFileSync(join(home, 'serve.json'), 'utf8'));
    return Number.isInteger(info.port) && Number.isInteger(info.pid) ? info : undefined;
  } catch {
    return undefined;
  }
}

export function readUiToken(home: string): string | undefined {
  try {
    const token = readFileSync(join(home, 'ui-token'), 'utf8').trim();
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
  } catch {
    return undefined;
  }
}

// The page the window went to, when it is another project's on the same server: its base
// (`<origin>/p/<id>`), which the tray and the notices then watch.
export function followedBase(watched: string, url: string): string | undefined {
  try {
    const now = new URL(url);
    if (now.origin !== new URL(watched).origin) return undefined;
    const id = /^\/p\/([a-z0-9-]+)\//.exec(now.pathname)?.[1];
    const base = id === undefined ? undefined : `${now.origin}/p/${id}`;
    return base === watched ? undefined : base;
  } catch {
    return undefined;
  }
}

// The sign-in link that lands on a project's page: `origin` is the server's, `id` the project's.
export const signInUrl = (origin: string, token: string, id: string) =>
  `${origin}/auth?token=${encodeURIComponent(token)}&next=${encodeURIComponent(`/p/${id}/`)}`;

// `otea serve --json` prints {"url": ...} once it listens and keeps running until it is stopped;
// when this computer's otea serve runs already it prints {"url": ..., "attached": true} and ends.
export function startServe(
  cli: Cli,
  cwd: string,
  port?: number,
): Promise<{ url: string; child: ChildProcess; attached: boolean }> {
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
        const { url, attached } = JSON.parse(line) as { url: string; attached?: boolean };
        child.removeAllListeners('exit');
        resolve({ url, child, attached: attached === true });
      } catch {
        child.kill();
        reject(new Error(`Unexpected output from otea serve: ${line}`));
      }
    });
  });
}

// otea serve's default port; the shell tries the next ones when another program (or another Otea
// home's server) holds it, so opening a project never fails on a taken port.
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

// Opens the project on this computer's one server: otea serve points at it when it runs (from a
// terminal, or started by this app before), and starts it otherwise, the app then owning it.
export async function connect(cli: Cli, cwd: string, port?: number): Promise<Connection> {
  const project = await currentProject(cli, cwd);
  const { url, child, attached } = await startOnFreePort(
    (free) => startServe(cli, cwd, free),
    port,
  );
  const token = readUiToken(project.home);
  if (!token) {
    if (!attached) child.kill();
    throw new Error(`otea serve started without a sign-in token in ${project.home}`);
  }
  const { origin } = new URL(url);
  const page = `${origin}/p/${project.id}`;
  const link = signInUrl(origin, token, project.id);
  return attached
    ? { project, url: page, signInUrl: link }
    : { project, url: page, signInUrl: link, child };
}
