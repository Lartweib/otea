import { AGENT_COMMANDS } from '../mcp/commands.ts';
import { type Command, usageOf } from './command.ts';
import { COMMANDS } from './commands.ts';
import { EXIT_CODES } from './exit-codes.ts';
import { columns, indent } from './format.ts';

const GLOBAL_OPTIONS = [
  ['--json', 'Print JSON to stdout; errors go to stderr as {"error":{"code","message"}}'],
  [
    '--as <name>',
    'Your agent name, recorded on writes and holding leases (or $OTEA_AGENT); agent commands need one, unique among the agents working now',
  ],
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

// The words `otea help` takes after it: `all` for the whole reference, or a command's name.
export const HELP_ALL = 'all';

// A command's summary cut to its first clause, for a line of the short help.
const LINE = 90;
function shortSummary(summary: string): string {
  const clause = summary.split(/[;:(]|\. /)[0]?.trim() ?? summary;
  return clause.length <= LINE ? clause : `${clause.slice(0, LINE - 1).trimEnd()}…`;
}

// A list of words wrapped to the width of the help, each line indented.
function wrapped(words: readonly string[], width = 98): string {
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line === '' ? word : `${line} ${word}`;
    if (next.length > width && line !== '') {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return indent(lines.join('\n'));
}

// What `otea help` prints: short, since every agent reads it first. The agent commands a line each,
// the rest by name, and where the whole reference is.
export function shortHelp(): string {
  const agent = new Set<string>(AGENT_COMMANDS);
  const rows = COMMANDS.filter(({ name }) => agent.has(name)).map((command) => [
    usageOf(command)
      .replace(/^otea /, '')
      .replace(/ \[--?[^\]]*\]| --[\w-]+ <[^>]*>/g, ''),
    shortSummary(command.summary),
  ]);
  const others = COMMANDS.filter(({ name }) => !agent.has(name)).map(({ name }) => name);
  return [
    'Usage: otea <command> [options]',
    '',
    'An agent starts with otea board (the guide and the boards), then otea next (what to take now), and names itself on every command with --as <name>.',
    '',
    'Agent commands (the same as MCP tools):',
    indent(columns(rows)),
    '',
    "Setup and the person's commands:",
    wrapped(others.map((name, index) => (index < others.length - 1 ? `${name},` : name))),
    '',
    `otea <command> --help (or otea help <command>) prints a command's options; otea help ${HELP_ALL} prints every command in full, the global options and the exit codes.`,
  ].join('\n');
}

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
  const details = command.details === undefined ? '' : `\n\n${command.details}`;
  return `Usage: ${usageOf(command)}\n\n${command.summary}${details}`;
}
