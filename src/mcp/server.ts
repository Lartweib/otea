import { readFileSync } from 'node:fs';
import { type CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { type ZodType, z } from 'zod';
import {
  type Command,
  failureCode,
  type Input,
  type OptionSpec,
  UsageError,
} from '../cli/command.ts';
import type { Actor } from '../core/item.ts';
import { parseDuration } from '../core/lease.ts';

// The commands an agent runs, each served as the tool of the same name. The rest belong to the
// human or to setup and stay in the CLI.
export const AGENT_COMMANDS = [
  'playbook',
  'list',
  'show',
  'create',
  'update',
  'attach',
  'link',
  'unlink',
  'move',
  'claim',
  'heartbeat',
  'release',
  'relay',
  'events',
  'wait',
] as const;

export const CLI_ONLY_COMMANDS = [
  'init',
  'connect',
  'collection add',
  'validate',
  'serve',
  'open',
  'mcp',
];

const READ_ONLY = new Set(['playbook', 'list', 'show', 'events', 'wait']);

// A tool call answers once, so it cannot follow the event log.
export const OMITTED_OPTIONS: Readonly<Record<string, readonly string[]>> = { events: ['follow'] };

// Clients time out long tool calls, so a wait gives up after this unless told otherwise, and never
// waits longer than the cap.
const WAIT_TIMEOUT = '5m';
const WAIT_MAX = { text: '15m', ms: 15 * 60_000 };

const NOTES: Readonly<Record<string, string>> = {
  attach:
    'file is a path on this machine, which the server reads; a relative one is resolved against the directory otea mcp runs in. The file goes to an evidence module of the item type that accepts it: pass module (its id, shown by show) when several do, and role before or after for a compare.',
  events:
    'Returns the events after the event id given to since, as a JSON array; call it again with the last id to read newer ones.',
  wait: `Gives up with the timeout error after timeout (default ${WAIT_TIMEOUT}, at most ${WAIT_MAX.text}); call it again to keep waiting.`,
};

const VERSION: string = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version;

export type McpContext = { cwd: string; actor: Actor; warn(message: string): void };

type Values = Record<string, unknown>;

function optionSchema(spec: OptionSpec): ZodType {
  if (spec.flag) return z.boolean().optional();
  const value = spec.choices ? z.enum(spec.choices as [string, ...string[]]) : z.string();
  const described = spec.placeholder ? value.describe(spec.placeholder) : value;
  if (spec.multiple) return z.array(described).optional();
  return spec.required ? described : described.optional();
}

function inputSchema(command: Command) {
  const omitted = OMITTED_OPTIONS[command.name] ?? [];
  const shape: Record<string, ZodType> = {};
  for (const arg of command.args) shape[arg] = z.string();
  for (const [name, spec] of Object.entries(command.options)) {
    if (!omitted.includes(name)) shape[name] = optionSchema(spec);
  }
  return z.object(shape);
}

function waitValues(values: Values): Values {
  const timeout = typeof values.timeout === 'string' ? values.timeout : WAIT_TIMEOUT;
  const ms = parseDuration(timeout);
  if (ms !== undefined && ms > WAIT_MAX.ms) {
    throw new UsageError(`--timeout must be at most ${WAIT_MAX.text} over MCP`);
  }
  return { ...values, timeout };
}

// The tool call as the command's input: the same arguments and options the CLI would parse.
function inputFor(
  command: Command,
  values: Values,
  context: McpContext,
  signal: AbortSignal,
  records: unknown[],
): Input {
  const option = (name: string) => {
    const value = values[name];
    return typeof value === 'string' ? value : undefined;
  };
  return {
    cwd: context.cwd,
    actor: context.actor,
    channel: 'mcp',
    signal,
    openUrl: async () => {
      throw new Error('No browser to open over MCP');
    },
    warn: context.warn,
    ask: async () => undefined,
    print: (data) => records.push(data),
    args: command.args.map((name) => String(values[name] ?? '')),
    flag: (name) => values[name] === true,
    option,
    options: (name) => {
      const value = values[name];
      return Array.isArray(value) ? value.map(String) : [];
    },
    required: (name) => {
      const value = option(name);
      if (value === undefined) throw new UsageError(`Missing --${name} for "otea ${command.name}"`);
      return value;
    },
  };
}

function reply(text: string, isError: boolean): CallToolResult {
  return { content: [{ type: 'text', text }], isError };
}

// Runs the command as the CLI would under --json: its data, or the records it printed one by one,
// as the result; a failure as the same {"error":{"code","message"}} the CLI prints.
async function callCommand(
  command: Command,
  values: Values,
  context: McpContext,
  signal: AbortSignal,
): Promise<CallToolResult> {
  const records: unknown[] = [];
  try {
    const given = command.name === 'wait' ? waitValues(values) : values;
    const output = await command.execute(inputFor(command, given, context, signal, records));
    return reply(JSON.stringify(output === undefined ? records : output.data), false);
  } catch (error) {
    const code = failureCode(error);
    const message = error instanceof Error ? error.message : String(error);
    return reply(JSON.stringify({ error: { code, message } }), true);
  }
}

export function createMcpServer(commands: readonly Command[], context: McpContext): McpServer {
  const server = new McpServer({ name: 'otea', version: VERSION });
  for (const name of AGENT_COMMANDS) {
    const command = commands.find((candidate) => candidate.name === name);
    if (!command) throw new Error(`No "otea ${name}" command to serve`);
    const note = NOTES[name];
    server.registerTool(
      name,
      {
        description: note ? `${command.summary}. ${note}` : command.summary,
        inputSchema: inputSchema(command),
        annotations: { readOnlyHint: READ_ONLY.has(name) },
      },
      (values: Values, { mcpReq }) => callCommand(command, values, context, mcpReq.signal),
    );
  }
  return server;
}

// Serves on stdin and stdout until the client closes stdin, which the transport notices, or the
// signal aborts. Stdout carries the protocol alone.
export async function serveStdio(server: McpServer, signal: AbortSignal): Promise<void> {
  const closed = new Promise<void>((resolve) => {
    server.server.onclose = resolve;
  });
  const close = () => void server.close();
  signal.addEventListener('abort', close, { once: true });
  await server.connect(new StdioServerTransport());
  await closed;
}
