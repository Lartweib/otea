import { execFileSync } from 'node:child_process';

// A secret file kept to its owner. On POSIX the mode it is written with (0600) does that; Windows
// ignores the mode, so there the file's ACL is cut to the current user alone: icacls drops the
// entries inherited from its folder and grants that user full control, run without a shell.
// Failing soft: a warning, and the file stays as Windows made it.

export type Runner = (file: string, args: readonly string[]) => void;

export type OwnerOnlyOptions = {
  platform?: NodeJS.Platform;
  env?: Readonly<Record<string, string | undefined>>;
  run?: Runner;
  warn?: (message: string) => void;
};

const execRunner: Runner = (file, args) => {
  execFileSync(file, args, { stdio: 'pipe', windowsHide: true, timeout: 10_000 });
};

const stderrWarn = (message: string) => {
  process.stderr.write(`Warning: ${message}\n`);
};

// The icacls call that leaves the file to `user` (DOMAIN\user when the domain is known).
export function ownerOnlyCommand(
  path: string,
  user: string,
  domain?: string,
): { file: string; args: string[] } {
  const who = domain ? `${domain}\\${user}` : user;
  return { file: 'icacls', args: [path, '/inheritance:r', '/grant:r', `${who}:F`] };
}

const reasonOf = (error: unknown) => {
  const stderr = (error as { stderr?: Buffer | string }).stderr?.toString().trim();
  return stderr || (error as Error).message;
};

export function restrictToOwner(path: string, options: OwnerOnlyOptions = {}): void {
  const {
    platform = process.platform,
    env = process.env,
    run = execRunner,
    warn = stderrWarn,
  } = options;
  if (platform !== 'win32') return;
  const lost = 'other accounts on this computer may read it';
  const user = env.USERNAME;
  if (!user) {
    warn(`Could not keep ${path} to the current user (no USERNAME); ${lost}`);
    return;
  }
  const { file, args } = ownerOnlyCommand(path, user, env.USERDOMAIN || undefined);
  try {
    run(file, args);
  } catch (error) {
    warn(`Could not keep ${path} to the current user (${reasonOf(error)}); ${lost}`);
  }
}
