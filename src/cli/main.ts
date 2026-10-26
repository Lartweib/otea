import { systemOpener } from './opener.ts';
import { run } from './run.ts';

const interrupt = new AbortController();
process.once('SIGINT', () => interrupt.abort());

process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  signal: interrupt.signal,
  openUrl: systemOpener(),
});
