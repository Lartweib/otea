import { createInterface } from 'node:readline/promises';
import { systemOpener } from './opener.ts';
import { run } from './run.ts';

const interrupt = new AbortController();
process.once('SIGINT', () => interrupt.abort());

// Only a person at a terminal is asked anything; scripts pass every answer as an option.
async function ask(question: string): Promise<string> {
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await prompt.question(question, { signal: interrupt.signal });
  } finally {
    prompt.close();
  }
}

process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  signal: interrupt.signal,
  openUrl: systemOpener(),
  ...(process.stdin.isTTY ? { ask } : {}),
});
