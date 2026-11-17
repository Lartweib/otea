// The project a launch asks for: `Otea --project <dir>` (or `--project=<dir>`), the folder resolved
// against the folder the launch ran in.
import { resolve } from 'node:path';

export function projectArg(argv: readonly string[], cwd: string): string | undefined {
  for (const [at, arg] of argv.entries()) {
    if (arg.startsWith('--project=')) return dirOf(arg.slice('--project='.length), cwd);
    if (arg === '--project') return dirOf(argv[at + 1], cwd);
  }
  return undefined;
}

const dirOf = (value: string | undefined, cwd: string) =>
  value === undefined || value === '' || value.startsWith('--') ? undefined : resolve(cwd, value);

// What a second launch hands the running app (app.requestSingleInstanceLock's additionalData).
export type LaunchData = { project?: string };

// The project a second launch asks the running app to open. The second launch resolves its own
// --project and hands it over: the argv the running app gets is Chromium's, its switches reordered
// and others added, so a folder read from it may be another switch, or relative to another folder.
export function secondLaunchProject(
  data: unknown,
  argv: readonly string[],
  workingDirectory: string,
): string | undefined {
  const handed = (data as LaunchData | undefined)?.project;
  if (typeof handed === 'string' && handed !== '') return handed;
  return projectArg(argv, workingDirectory);
}
