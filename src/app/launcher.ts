import { accessSync, constants, statSync } from 'node:fs';
import { join } from 'node:path';

// How what Otea writes for later (an MCP entry, a hook) runs this Otea again. A checkout runs on the
// system's Node; the desktop app runs its own CLI on its Electron as Node (ELECTRON_RUN_AS_NODE), the
// way VS Code's `code` does, so a machine with the app needs no Node.
export type Launcher = {
  command: string;
  args: readonly string[];
  env?: Readonly<Record<string, string>>;
};

// `electron` is process.versions.electron: set only when Electron runs the CLI.
export type Runtime = { execPath: string; electron?: string | undefined };

export function oteaLauncher(main: string, runtime: Runtime): Launcher {
  if (runtime.electron === undefined) {
    return { command: 'node', args: ['--disable-warning=ExperimentalWarning', main] };
  }
  return { command: runtime.execPath, args: [main], env: { ELECTRON_RUN_AS_NODE: '1' } };
}

// Whether path is a file this computer can run: any file on Windows (PATHEXT picks the ending), an
// executable one elsewhere.
function runnable(path: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (platform !== 'win32') accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// The otea command on $PATH (npm link, an installed package), as a harness starts it, so what the
// agent adds survives a checkout that moves; undefined when no otea is there. A harness on Windows
// starts the .cmd shim npm puts there only through cmd /c, as it does npx.
export function pathLauncher(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
): Launcher | undefined {
  const windows = platform === 'win32';
  const dirs = (env.PATH ?? env.Path ?? '').split(windows ? ';' : ':').filter(Boolean);
  const endings = windows
    ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  for (const dir of dirs) {
    for (const ending of endings) {
      if (!runnable(join(dir, `otea${ending}`), platform)) continue;
      return /^\.(bat|cmd)$/i.test(ending)
        ? { command: 'cmd', args: ['/c', 'otea'] }
        : { command: 'otea', args: [] };
    }
  }
  return undefined;
}

// The launcher carrying an Otea home set apart ($OTEA_HOME), so what runs it later (the MCP
// server, a hook) finds the same projects; as it is without one.
export function withHome(launcher: Launcher, home: string | undefined): Launcher {
  if (home === undefined) return launcher;
  return { ...launcher, env: { ...launcher.env, OTEA_HOME: home } };
}

// A bare word or a flag goes as it is; anything else (a path) in double quotes.
const word = (part: string) => (/^(--)?[\w=.-]+$/.test(part) ? part : `"${part}"`);

// The launcher as the start of a POSIX shell command line (git hooks, Claude Code hooks).
export function shellLine(launcher: Launcher): string {
  const env = Object.entries(launcher.env ?? {}).map(([name, value]) => `${name}=${word(value)} `);
  return `${env.join('')}${[launcher.command, ...launcher.args].map(word).join(' ')}`;
}
