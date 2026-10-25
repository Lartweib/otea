import type { Actor } from '../core/item.ts';

export type OptionSpec = { required?: boolean; choices?: readonly string[] };

export type Input = {
  cwd: string;
  actor: Actor;
  args: string[];
  option(name: string): string | undefined;
  required(name: string): string;
};

export type Output = { data: unknown; text: string };

export type Command = {
  name: string;
  summary: string;
  args: readonly string[];
  options: Readonly<Record<string, OptionSpec>>;
  execute(input: Input): Output;
};

export class UsageError extends Error {
  override readonly name = 'UsageError';
}

function optionUsage(name: string, spec: OptionSpec): string {
  const flag = `--${name} <${spec.choices?.join('|') ?? name}>`;
  return spec.required ? flag : `[${flag}]`;
}

export function usageOf(command: Command): string {
  const args = command.args.map((arg) => `<${arg}>`);
  const options = Object.entries(command.options).map(([name, spec]) => optionUsage(name, spec));
  return ['otea', command.name, ...args, ...options].join(' ');
}
