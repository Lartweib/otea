import { execFileSync } from 'node:child_process';

// gh asks the forge over the network, so a command never waits on it longer than this.
export const GH_TIMEOUT_MS = 10_000;

// A PR's state (OPEN, CLOSED, MERGED) and head branch, asked of gh in the repo at cwd; undefined
// when gh is missing, fails or takes too long: the caller goes on without it.
export function prState(
  cwd: string,
  pr: string,
  gh: string | undefined,
): { state: string; head: string } | undefined {
  if (gh === undefined) return undefined;
  try {
    const read = execFileSync(
      gh,
      ['pr', 'view', pr, '--json', 'state,headRefName', '--jq', '.state + " " + .headRefName'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: GH_TIMEOUT_MS },
    ).trim();
    const [state = '', head = ''] = read.split(' ');
    return state === '' || head === '' ? undefined : { state, head };
  } catch {
    return undefined;
  }
}
