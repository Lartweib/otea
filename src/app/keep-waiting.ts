import type { AgentChannel } from '../core/authority.ts';
import { quoted } from '../core/board/next.ts';

// The exact command an agent runs to keep hearing the desk, which next and wait end with (PLAN5 G3):
// an agent told only "wait" ends its turn, and what the person does next goes unheard.

function on(collection: string | undefined): string {
  return collection === undefined ? '' : ` --collection ${quoted(collection)}`;
}

// otea wait for the agent's next item, named as it is on every call.
export function keepWaitingCommand(agent: string, collection?: string): string {
  return `otea wait --turn agent --unclaimed${on(collection)} --as ${agent}`;
}

// The wait and the next as the agent runs them: on the command line with its name; over MCP as the
// tools (MCP words turn them into tool calls, which take the name as `as`), with the wait first as a
// shell line ("$ ", kept as it is) to run in the background, since the wait tool holds the chat
// until it returns (all of OpenCode's TUI) and a background shell leaves it free (P2S-R2-9).
function commands(agent: string, channel: AgentChannel, collection?: string) {
  const mcp = channel === 'mcp';
  const next = mcp ? `otea next${on(collection)}` : `otea next${on(collection)} --as ${agent}`;
  const shell = keepWaitingCommand(agent, collection);
  const tool = ` Without a shell, otea wait --turn agent --unclaimed${on(collection)} holds your chat until it returns.`;
  return { mcp, next, shell, tool };
}

// What an idle agent is told of the desk: it hears the person only while its wait runs (P2S-6).
const DESK = ' Only a running wait hears the desk: approvals, answers and notes from the person.';

// next's last line: with nothing to do, wait now; with an item, once it is handed off and next has
// nothing more.
export function keepWaitingLine(
  agent: string,
  channel: AgentChannel,
  { idle, collection }: { idle: boolean; collection?: string | undefined },
): string {
  const { mcp, next, shell, tool } = commands(agent, channel, collection);
  if (!mcp) {
    const wait = `${shell} in the background if you can`;
    return idle
      ? `Wait for one: ${wait}, then ${next}.${DESK}`
      : `When you finish and ${next} has nothing: ${wait}.`;
  }
  return idle
    ? `Wait for one in a background shell, which keeps your chat free: $ ${shell}; then ${next}.${tool}${DESK}`
    : `When you finish and ${next} has nothing, wait in a background shell, which keeps your chat free: $ ${shell}.${tool}`;
}

// What otea wait ends with once it woke: read what woke it, then wait again.
export function waitAgainLine(agent: string, channel: AgentChannel, collection?: string): string {
  const { mcp, next, shell, tool } = commands(agent, channel, collection);
  if (!mcp)
    return `Then keep going: ${next}; when it has nothing, ${shell} in the background if you can.`;
  return `Then keep going: ${next}; when it has nothing, wait again in a background shell: $ ${shell}.${tool}`;
}
