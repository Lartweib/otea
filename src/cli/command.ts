import type { Harness } from '../app/presence.ts';
import type { AgentChannel } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import type { Actor } from '../core/item.ts';
import type { FailureCode } from './exit-codes.ts';
import type { Opener } from './opener.ts';

export type OptionSpec = {
  required?: boolean;
  choices?: readonly string[];
  multiple?: boolean;
  flag?: boolean;
  // Takes a value, or none when the next word is an option or there is none (`--branch` alone):
  // the command then reads an empty string and picks its default.
  optionalValue?: boolean;
  placeholder?: string;
};

export type Input = {
  cwd: string;
  // The agent acting. Reading it refuses an agent that gave no name, or an invalid one: every
  // command that acts as an agent reads it, so none runs unnamed.
  readonly actor: Actor;
  // The name the agent gave, unchecked, or none: for a command that may run unnamed (otea mcp).
  agent: string | undefined;
  // How the agent reached the command, recorded on its writes: the CLI itself or the MCP server.
  channel: AgentChannel;
  // What the agent came through, recorded with its presence: the MCP client, or the CLI itself.
  harness?: Harness | undefined;
  signal: AbortSignal;
  openUrl: Opener;
  // Whether what the command prints goes to a terminal a person reads, not to a pipe or a log: only
  // there may it print a secret (the sign-in link).
  terminal: boolean;
  warn(message: string): void;
  // Asks the person at the terminal and resolves with their answer, or with nothing when there is
  // nobody to ask (no terminal, or the MCP server).
  ask(question: string): Promise<string | undefined>;
  // Everything piped to the command, or an empty string when nothing is.
  stdin(): Promise<string>;
  // Prints one record right away: a single JSON line under --json, the text otherwise.
  print(data: unknown, text: string): void;
  args: string[];
  flag(name: string): boolean;
  option(name: string): string | undefined;
  options(name: string): string[];
  required(name: string): string;
};

export type Output = { data: unknown; text: string; failure?: FailureCode };

export type Command = {
  name: string;
  summary: string;
  // A last name ending in `...` (`ids...`) takes that argument and every one after it, at least one;
  // one ending in `?` (`name?`) may be left out.
  args: readonly string[];
  options: Readonly<Record<string, OptionSpec>>;
  // Resolves with nothing when the command printed its output itself, record by record.
  execute(input: Input): Output | undefined | Promise<Output | undefined>;
};

export class UsageError extends Error {
  override readonly name = 'UsageError';
}

export class CommandFailure extends Error {
  readonly failure: FailureCode;

  constructor(failure: FailureCode, message: string) {
    super(message);
    this.name = 'CommandFailure';
    this.failure = failure;
  }
}

// The code a failed command reports: the exit code it maps to, and the one --json prints.
export function failureCode(error: unknown): FailureCode {
  if (error instanceof UsageError) return 'usage';
  if (error instanceof CommandFailure) return error.failure;
  if (error instanceof OteaError) return error.code;
  return 'unexpected';
}

// A refusal as --json and MCP give it: its code, its message (in names) and, when it has them, its
// details, which keep the ids a program sends back.
export function errorData(error: unknown): { error: Record<string, unknown> } {
  const code = failureCode(error);
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof OteaError ? error.details : undefined;
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

function optionUsage(name: string, spec: OptionSpec): string {
  if (spec.flag) return `[--${name}]`;
  const value = spec.placeholder ?? spec.choices?.join('|') ?? name;
  if (spec.optionalValue) return `[--${name} [<${value}>]]`;
  const flag = `--${name} <${value}>${spec.multiple ? '...' : ''}`;
  return spec.required ? flag : `[${flag}]`;
}

export function usageOf(command: Command): string {
  const args = command.args.map((arg) =>
    arg.endsWith('?') ? `[<${arg.slice(0, -1)}>]` : `<${arg}>`,
  );
  const options = Object.entries(command.options).map(([name, spec]) => optionUsage(name, spec));
  return ['otea', command.name, ...args, ...options].join(' ');
}
