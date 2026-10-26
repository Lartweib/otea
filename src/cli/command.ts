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
  signal: AbortSignal;
  openUrl: Opener;
  warn(message: string): void;
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
  execute(input: Input): Output | Promise<Output>;
};

export class UsageError extends Error {
  override readonly name = 'UsageError';
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
