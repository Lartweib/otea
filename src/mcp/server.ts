import { type CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { type ZodType, z } from 'zod';
import type { Harness } from '../app/presence.ts';
import { NO_TAILSCALE } from '../app/tailscale.ts';
import {
  type Command,
  errorData,
  type Input,
  type OptionSpec,
  UsageError,
} from '../cli/command.ts';
import { NO_FORGE } from '../cli/forge.ts';
import { OTEA_VERSION } from '../cli/version.ts';
import { agentGuideFor } from '../core/agent-guide.ts';
import { type Actor, agentActor } from '../core/item.ts';
import { parseDuration } from '../core/lease.ts';
import { AGENT_COMMANDS, READ_ONLY, toolName } from './commands.ts';
import { mcpWords } from './words.ts';

export { AGENT_COMMANDS, CLI_ONLY_COMMANDS, toolName } from './commands.ts';

// A tool call answers once, so it cannot follow the event log.
export const OMITTED_OPTIONS: Readonly<Record<string, readonly string[]>> = { events: ['follow'] };

// Clients time out long tool calls, so a wait gives up after this unless told otherwise, and never
// waits longer than the cap.
const WAIT_TIMEOUT = '5m';
const WAIT_MAX = { text: '15m', ms: 15 * 60_000 };

const NOTES: Readonly<Record<string, string>> = {
  attach:
    'file is a path on this machine, which the server reads; a relative one is resolved against the directory otea mcp runs in. The file goes to an evidence module of the item type that accepts it: pass module (its id, shown by show) when several do, and role before or after for a compare.',
  'board draft':
    'Pass id (the Pedido) or new (the name of a board the person asked you for, with why); not both. file is a path on this machine, which the server reads; a relative one is resolved against the directory otea mcp runs in.',
  events:
    'Returns the events after the event id given to since, as a JSON array; call it again with the last id to read newer ones.',
  wait: `Gives up with the timeout error after timeout (default ${WAIT_TIMEOUT}, at most ${WAIT_MAX.text}); call it again to keep waiting.`,
};

// `agent`: the name the server was started as (otea mcp --as), which a call that names nobody acts
// as. Subagents share their parent's server, so every call can name its own agent with `as`, which
// wins; a call that names nobody on a server started without a name is refused.
// `greeted` hears the client's name once it has introduced itself, so the agent shows up as seen
// before its first call.
export type McpContext = {
  cwd: string;
  // The project the agent is pinned to (otea connect's OTEA_PROJECT_ID): writes elsewhere refused.
  pin?: string;
  agent?: string;
  // Whether the project keeps side topics: the guide then tells agents to record them.
  topics?: boolean;
  warn(message: string): void;
  greeted?(harness: Harness | undefined): void;
  // An agent called a tool: the server, open, keeps it heard as listening (otea mcp beats it).
  heard?(agent: string): void;
};

type Values = Record<string, unknown>;

// A number an option takes (a note's, an event id) may come as a JSON number: it is read as its
// digits, as the CLI reads it.
const NUMBERED = new Set(['n', 'event id']);

function optionSchema(spec: OptionSpec): ZodType {
  if (spec.flag) return z.boolean().optional();
  const numbered = NUMBERED.has(spec.placeholder ?? '');
  const text = numbered ? z.union([z.string(), z.number()]) : z.string();
  const value = spec.choices ? z.enum(spec.choices as [string, ...string[]]) : text;
  const described = spec.placeholder ? value.describe(spec.placeholder) : value;
  if (spec.multiple) return z.array(described).optional();
  return spec.required ? described : described.optional();
}

// Every tool takes the agent making the call, so subagents on one server stay apart.
const AS = z.string().optional().describe('your agent name; each subagent its own');

const NAME_YOURSELF = 'pass as with your agent name on every call';

function inputSchema(command: Command) {
  const omitted = OMITTED_OPTIONS[command.name] ?? [];
  const shape: Record<string, ZodType> = { as: AS };
  for (const arg of command.args) {
    if (arg.endsWith('?')) shape[arg.slice(0, -1)] = z.string().optional();
    else shape[arg] = z.string();
  }
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
  harness: Harness | undefined,
  seen: Set<string>,
): Input {
  const option = (name: string) => {
    const value = values[name];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
  };
  const agent = typeof values.as === 'string' && values.as !== '' ? values.as : context.agent;
  // The first call of each agent on this server starts its session here.
  const newSession = agent !== undefined && !seen.has(agent);
  if (agent !== undefined) {
    if (newSession) context.heard?.(agent);
    seen.add(agent);
  }
  return {
    cwd: context.cwd,
    ...(context.pin === undefined ? {} : { pin: context.pin }),
    get actor(): Actor {
      return agentActor(agent, NAME_YOURSELF);
    },
    // Over MCP the caller is always an agent: reading needs its name too.
    get reader(): Actor {
      return agentActor(agent, NAME_YOURSELF);
    },
    agent,
    channel: 'mcp',
    harness,
    ...(newSession ? { newSession } : {}),
    signal,
    openUrl: async () => {
      throw new Error('No browser to open over MCP');
    },
    tailscale: NO_TAILSCALE,
    forge: NO_FORGE,
    probe: async () => false,
    terminal: false,
    warn: context.warn,
    ask: async () => undefined,
    stdin: async () => '',
    print: (data) => records.push(data),
    args: command.args.flatMap((name) => {
      const key = name.endsWith('?') ? name.slice(0, -1) : name;
      const value = values[key];
      return value === undefined && key !== name ? [] : [String(value ?? '')];
    }),
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
  harness: Harness | undefined,
  seen: Set<string>,
  commands: readonly Command[],
): Promise<CallToolResult> {
  const records: unknown[] = [];
  try {
    const given = command.name === 'wait' ? waitValues(values) : values;
    const output = await command.execute(
      inputFor(command, given, context, signal, records, harness, seen),
    );
    const data = output === undefined ? records : inMcpWords(output.data, commands);
    return reply(JSON.stringify(data), false);
  } catch (error) {
    const { error: data } = errorData(error);
    const message =
      typeof data.message === 'string' ? mcpWords(data.message, commands) : data.message;
    return reply(JSON.stringify({ error: { ...data, message } }), true);
  }
}

// What a command says to the agent (its `text`, and show's `hint`: what to do with the item now),
// in the words of the tools it calls.
const SAID = ['text', 'hint'] as const;

function inMcpWords(data: unknown, commands: readonly Command[]): unknown {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data;
  const said = data as Record<string, unknown>;
  const words = SAID.flatMap((key) => {
    const value = said[key];
    return typeof value === 'string' ? [[key, mcpWords(value, commands)]] : [];
  });
  return words.length === 0 ? data : { ...data, ...Object.fromEntries(words) };
}

export function createMcpServer(commands: readonly Command[], context: McpContext): McpServer {
  // Otea's agent guide as the server's instructions: clients such as Claude Code put them in the
  // agent's context when it connects.
  const server = new McpServer(
    { name: 'otea', version: OTEA_VERSION },
    { instructions: agentGuideFor(context.topics ?? false) },
  );
  // The client names itself in initialize: its clientInfo is the harness the agent works through.
  const harness = (): Harness | undefined => {
    const client = server.server.getClientVersion();
    return client && { name: client.name, version: client.version };
  };
  // The agents that called this server so far: each one's first call starts its session.
  const seen = new Set<string>();
  server.server.oninitialized = () => context.greeted?.(harness());
  for (const name of AGENT_COMMANDS) {
    const command = commands.find((candidate) => candidate.name === name);
    if (!command) throw new Error(`No "otea ${name}" command to serve`);
    const note = NOTES[name];
    server.registerTool(
      toolName(name),
      {
        description: note ? `${command.summary}. ${note}` : command.summary,
        inputSchema: inputSchema(command),
        annotations: { readOnlyHint: READ_ONLY.has(name) },
      },
      (values: Values, { mcpReq }) =>
        callCommand(command, values, context, mcpReq.signal, harness(), seen, commands),
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
