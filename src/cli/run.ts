import { type ParseArgsOptionsConfig, parseArgs } from 'node:util';
import type { Actor } from '../core/item.ts';
import { type Command, failureCode, type Input, UsageError, usageOf } from './command.ts';
import { COMMANDS, findCommand } from './commands.ts';
import { EXIT_CODES } from './exit-codes.ts';
import { commandHelp, generalHelp, HELP_HINT } from './help.ts';
import type { Opener } from './opener.ts';

type Writer = { write(chunk: string): unknown };

export type Io = {
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  stdout: Writer;
  stderr: Writer;
  signal: AbortSignal;
  openUrl: Opener;
  // Present only when a person can answer at the terminal.
  ask?: (question: string) => Promise<string>;
};

type Values = Record<string, string | boolean | (string | boolean)[] | undefined>;

const GLOBAL_OPTIONS: ParseArgsOptionsConfig = {
  json: { type: 'boolean' },
  as: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

const PARSE_OPTIONS: ParseArgsOptionsConfig = Object.assign(
  {},
  GLOBAL_OPTIONS,
  ...COMMANDS.flatMap((command) =>
    Object.entries(command.options).map(([name, spec]) => ({
      [name]: spec.flag
        ? { type: 'boolean' }
        : { type: 'string', multiple: spec.multiple ?? false },
    })),
  ),
);

function parse(argv: string[]): { values: Values; positionals: string[] } {
  try {
    return parseArgs({ args: argv, options: PARSE_OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

function actorFrom(values: Values, env: Io['env']): Actor {
  const name = (typeof values.as === 'string' && values.as) || env.OTEA_AGENT || 'agent';
  return { kind: 'agent', name };
}

function validate(command: Command, values: Values, args: string[]): void {
  for (const name of Object.keys(values)) {
    if (!(name in GLOBAL_OPTIONS) && !(name in command.options)) {
      throw new UsageError(`Unknown option --${name} for "otea ${command.name}"`);
    }
  }
  for (const [name, spec] of Object.entries(command.options)) {
    const value = values[name];
    if (typeof value === 'string' && spec.choices && !spec.choices.includes(value)) {
      throw new UsageError(`--${name} must be one of ${spec.choices.join(', ')}`);
    }
  }
  if (args.length !== command.args.length) {
    throw new UsageError(`"otea ${command.name}" expects ${command.args.length} argument(s)`);
  }
}

function inputFor(command: Command, values: Values, args: string[], io: Io, json: boolean): Input {
  const option = (name: string) => {
    const value = values[name];
    return typeof value === 'string' ? value : undefined;
  };
  const options = (name: string) => {
    const value = values[name];
    return Array.isArray(value) ? value.map(String) : [];
  };
  return {
    cwd: io.cwd,
    actor: actorFrom(values, io.env),
    channel: 'cli',
    signal: io.signal,
    openUrl: io.openUrl,
    warn: (message) =>
      io.stderr.write(`otea: ${message}
`),
    ask: async (question) => io.ask?.(question),
    print: (data, text) => io.stdout.write(`${json ? JSON.stringify(data) : text}\n`),
    args,
    flag: (name) => values[name] === true,
    option,
    options,
    required: (name) => {
      const value = option(name);
      if (value === undefined) throw new UsageError(`Missing --${name} for "otea ${command.name}"`);
      return value;
    },
  };
}

async function dispatch(argv: string[], io: Io, json: boolean): Promise<number> {
  const { values, positionals } = parse(argv);
  if (positionals[0] === 'help' || (values.help && positionals.length === 0)) {
    io.stdout.write(`${generalHelp()}\n`);
    return EXIT_CODES.ok;
  }
  if (positionals.length === 0) throw new UsageError('Missing command');
  const command = findCommand(positionals);
  if (!command) throw new UsageError(`Unknown command "${positionals[0]}"`);
  if (values.help) {
    io.stdout.write(`${commandHelp(command)}\n`);
    return EXIT_CODES.ok;
  }
  const args = positionals.slice(command.name.split(' ').length);
  validate(command, values, args);
  const output = await command.execute(inputFor(command, values, args, io, json));
  if (output === undefined) return EXIT_CODES.ok;
  io.stdout.write(json ? `${JSON.stringify(output.data, null, 2)}\n` : `${output.text}\n`);
  return EXIT_CODES[output.failure ?? 'ok'];
}

function usageHint(argv: string[]): string {
  const command = findCommand(argv.filter((token) => !token.startsWith('-')));
  return command ? `Usage: ${usageOf(command)}` : HELP_HINT;
}

function report(error: unknown, argv: string[], io: Io, json: boolean): number {
  const code = failureCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    io.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  } else {
    const hint = EXIT_CODES[code] === EXIT_CODES.usage ? `\n${usageHint(argv)}` : '';
    io.stderr.write(`otea: ${message}${hint}\n`);
  }
  return EXIT_CODES[code];
}

export async function run(argv: string[], io: Io): Promise<number> {
  const json = argv.includes('--json');
  try {
    return await dispatch(argv, io, json);
  } catch (error) {
    return report(error, argv, io, json);
  }
}
