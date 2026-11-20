// The PowerShell script the Windows installer runs to put `otea` on the user's PATH, run here in its
// dry mode (-Current), which prints the PATH it would write and touches nothing.
//
// Starting powershell.exe is what costs: the first start on a cold Windows runner has taken over
// 5s (later ones ~0.4s), which timed out whichever case came first. So one PowerShell runs the
// script for every case, the same way the installer does (-File semantics via `&`, its own
// parameters), and each case only reads its answer.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../build/path.ps1', import.meta.url));
const BIN = 'C:\\Users\\ana\\AppData\\Local\\Programs\\Otea\\resources\\bin';

type Action = 'add' | 'remove';

// Each case: the action, the PATH it finds, and the PATH it writes. Adding puts the bin folder at
// the end, keeping the rest unexpanded, and only once whatever the case or trailing slash;
// removing takes out only its own entry.
const CASES: Array<[Action, string, string]> = [
  ['add', '%USERPROFILE%\\bin;C:\\tools', `%USERPROFILE%\\bin;C:\\tools;${BIN}`],
  ['add', '', BIN],
  ['add', `C:\\tools;${BIN.toUpperCase()}\\`, `C:\\tools;${BIN.toUpperCase()}\\`],
  ['remove', `C:\\tools;${BIN};%USERPROFILE%\\bin`, 'C:\\tools;%USERPROFILE%\\bin'],
  ['remove', 'C:\\tools', 'C:\\tools'],
  ['remove', BIN, ''],
];

// Each case runs the script as its own invocation, with -Current bound even when empty, and its
// output is read as one string; a script that fails stops the whole run.
const RUN_ALL = `
$ErrorActionPreference = 'Stop'
$cases = ConvertFrom-Json $env:OTEA_PATH_CASES
$out = foreach ($c in $cases) {
  $result = & $env:OTEA_PATH_SCRIPT -Action $c[0] -Dir $env:OTEA_PATH_DIR -Current $c[1]
  if ($LASTEXITCODE -ne 0) { throw "path.ps1 exited with $LASTEXITCODE" }
  [string]$result
}
ConvertTo-Json -InputObject @($out) -Compress
`;

let results = new Map<string, string>();

function dryRun(action: Action, current: string): string {
  const result = results.get(JSON.stringify([action, current]));
  if (result === undefined) throw new Error(`no dry run for ${action} ${JSON.stringify(current)}`);
  return result;
}

describe.runIf(process.platform === 'win32')('path.ps1', () => {
  // One real PowerShell start is needed to test the real script; it gets the budget a cold runner
  // needs for it, and only this hook does.
  beforeAll(() => {
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', RUN_ALL],
      {
        encoding: 'utf8',
        windowsHide: true,
        env: {
          ...process.env,
          OTEA_PATH_SCRIPT: SCRIPT,
          OTEA_PATH_DIR: BIN,
          OTEA_PATH_CASES: JSON.stringify(CASES.map(([action, current]) => [action, current])),
        },
      },
    );
    const answers = JSON.parse(output) as string[];
    expect(answers).toHaveLength(CASES.length);
    results = new Map(
      answers.map((answer, i) => [JSON.stringify(CASES[i]?.slice(0, 2)), answer.trim()]),
    );
  }, 60_000);

  it.each(CASES)('%s on %j gives %j', (action, current, written) => {
    expect(dryRun(action, current)).toBe(written);
  });
});
