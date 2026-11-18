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
// tools (MCP words turn them into tool calls, which take the name as `as`), with the same wait as a
// shell line ("$ ", kept as it is), since the wait tool holds the chat until it returns (all of
// OpenCode's TUI) and a background shell leaves it free.
function commands(agent: string, channel: AgentChannel, collection?: string) {
  if (channel !== 'mcp') {
    return {
      wait: `${keepWaitingCommand(agent, collection)} in the background if you can`,
      next: `otea next${on(collection)} --as ${agent}`,
      shell: '',
    };
  }
  return {
    wait: `otea wait --turn agent --unclaimed${on(collection)}`,
    next: `otea next${on(collection)}`,
    shell: ` To keep your chat free while you wait, run it in a background shell instead: $ ${keepWaitingCommand(agent, collection)}`,
  };
}

// next's last line: with nothing to do, wait now; with an item, once it is handed off and next has
// nothing more.
export function keepWaitingLine(
  agent: string,
  channel: AgentChannel,
  { idle, collection }: { idle: boolean; collection?: string | undefined },
): string {
  const { wait, next, shell } = commands(agent, channel, collection);
  return idle
    ? `Wait for one: ${wait}, then ${next}.${shell}`
    : `When you finish and ${next} has nothing: ${wait}.${shell}`;
}

// What otea wait ends with once it woke: read what woke it, then wait again.
export function waitAgainLine(agent: string, channel: AgentChannel, collection?: string): string {
  const { wait, next, shell } = commands(agent, channel, collection);
  return `Then keep going: ${next}; when it has nothing, ${wait}.${shell}`;
}
