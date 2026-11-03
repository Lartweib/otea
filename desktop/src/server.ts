// Finding the project's `otea serve`, or starting one. Everything goes through the otea CLI and the
// files it writes in the project's data folder (serve.json, ui-token), so the shell never opens the
// database itself and stays a client like the browser.
import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export type Cli = { command: string; args: readonly string[] };

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

function failure(stderr: string, fallback: string): Error {
  try {
    const parsed = JSON.parse(stderr) as { error?: { message?: string } };
    if (parsed.error?.message) return new Error(parsed.error.message);
  } catch {
    // not JSON: the text itself says it
  }
  return new Error(stderr.trim() || fallback);
}

export function currentProject(cli: Cli, cwd: string): Promise<Project> {
  return new Promise((resolve, reject) => {
    execFile(
      cli.command,
      [...cli.args, 'projects', 'current', '--json'],
      { cwd, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) reject(failure(stderr, error.message));
        else resolve(JSON.parse(stdout) as Project);
      },
    );
  });
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
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(failure(stderr, `otea serve exited with code ${code}`)));
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
  const { url, child } = await startServe(cli, cwd, port);
  const started = readUiToken(project.dataDir);
  if (!started) {
    child.kill();
    throw new Error(`otea serve started without a sign-in token in ${project.dataDir}`);
  }
  return { project, url, signInUrl: signInUrl(url, started), child };
}
