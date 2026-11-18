#!/usr/bin/env node
// The otea command of a checkout, for `npm link` (or `npm install -g .`): npm puts a real command
// on the PATH that runs this file on the system's Node (a symlink on macOS and Linux; otea.cmd,
// otea.ps1 and a shell script on Windows), so every shell finds it, an agent's included, where an
// alias reaches only the shell that defined it.
import module from 'node:module';

// The compiled code is kept between runs: each command starts faster after the first.
module.enableCompileCache?.();

// Node warns that type stripping and node:sqlite are experimental on every run; otea's output is
// read by people and agents, so those notices stay out of it (as --disable-warning would).
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => {
  const [options] = rest;
  const type = typeof options === 'string' ? options : options?.type;
  const name = warning instanceof Error ? warning.name : type;
  if (name === 'ExperimentalWarning') return;
  emitWarning(warning, ...rest);
};

await import('../src/cli/main.ts');
