import { type Command, usageOf } from './command.ts';
import { COMMANDS } from './commands.ts';
import { EXIT_CODES } from './exit-codes.ts';
import { columns, indent } from './format.ts';

const GLOBAL_OPTIONS = [
  ['--json', 'Print JSON to stdout; errors go to stderr as {"error":{"code","message"}}'],
  ['--as <name>', 'Agent name recorded on writes (default: $OTEA_AGENT, then "agent")'],
  ['-h, --help', 'Show help'],
];

function exitCodeRows(): string[][] {
  const names = new Map<number, string[]>();
  for (const [name, code] of Object.entries(EXIT_CODES)) {
    names.set(code, [...(names.get(code) ?? []), name]);
  }
  return [...names].map(([code, group]) => [String(code), group.join(', ')]);
}

export const HELP_HINT = 'Run "otea help" for usage.';

export function generalHelp(): string {
  return [
    'Usage: otea <command> [options]',
    '',
    'Commands:',
    ...COMMANDS.map((command) => indent(`${usageOf(command)}\n${indent(command.summary)}`)),
    '',
    'Global options:',
    indent(columns(GLOBAL_OPTIONS)),
    '',
    'Exit codes:',
    indent(columns(exitCodeRows())),
  ].join('\n');
}

export function commandHelp(command: Command): string {
  return `Usage: ${usageOf(command)}\n\n${command.summary}`;
}
