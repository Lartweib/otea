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
  placeholder?: string;
};

export type Input = {
  cwd: string;
  actor: Actor;
  // How the agent reached the command, recorded on its writes: the CLI itself or the MCP server.
  channel: AgentChannel;
  signal: AbortSignal;
  openUrl: Opener;
  warn(message: string): void;
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

function optionUsage(name: string, spec: OptionSpec): string {
  if (spec.flag) return `[--${name}]`;
  const value = spec.placeholder ?? spec.choices?.join('|') ?? name;
  const flag = `--${name} <${value}>${spec.multiple ? '...' : ''}`;
  return spec.required ? flag : `[${flag}]`;
}

export function usageOf(command: Command): string {
  const args = command.args.map((arg) => `<${arg}>`);
  const options = Object.entries(command.options).map(([name, spec]) => optionUsage(name, spec));
  return ['otea', command.name, ...args, ...options].join(' ');
}
