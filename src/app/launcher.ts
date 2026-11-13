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

// A bare word or a flag goes as it is; anything else (a path) in double quotes.
const word = (part: string) => (/^(--)?[\w=.-]+$/.test(part) ? part : `"${part}"`);

// The launcher as the start of a POSIX shell command line (git hooks, Claude Code hooks).
export function shellLine(launcher: Launcher): string {
  const env = Object.entries(launcher.env ?? {}).map(([name, value]) => `${name}=${value} `);
  return `${env.join('')}${[launcher.command, ...launcher.args].map(word).join(' ')}`;
}
