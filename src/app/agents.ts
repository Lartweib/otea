import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_GUIDE } from '../core/agent-guide.ts';
import { OteaError } from '../core/errors.ts';
import type { Launcher } from './launcher.ts';

const BEGIN = '<!-- otea:begin -->';
const END = '<!-- otea:end -->';

// The marked block `otea init --agents-md` keeps in the project's AGENTS.md: it points agents at
// their boards and gives Otea's agent guide. Only the text between the markers is Otea's.
export const AGENTS_BLOCK = [
  BEGIN,
  '## Otea',
  '',
  'This project hands work between humans and agents through Otea. Run `otea next` (or call the `next` tool of the Otea MCP server) to get the item to take and what its step asks, and `otea board <name>` (the `board` tool) to read the instructions of a board. Hand off with `otea handoff <id>`; `otea show <id>` says what to do next with each item.',
  '',
  AGENT_GUIDE,
  END,
].join('\n');

export type AgentsMdAction = 'created' | 'added' | 'updated' | 'unchanged';

export type AgentsMdResult = { path: string; action: AgentsMdAction };

function withBlock(current: string): string {
  const begin = current.indexOf(BEGIN);
  const end = current.indexOf(END, begin);
  if (begin >= 0 && end >= 0) {
    return `${current.slice(0, begin)}${AGENTS_BLOCK}${current.slice(end + END.length)}`;
  }
  const separator = current.endsWith('\n') ? '\n' : '\n\n';
  return `${current}${separator}${AGENTS_BLOCK}\n`;
}

// Adds the block to AGENTS.md at the project root, or replaces the one already there: running it
// again never adds a second block.
export function writeAgentsMd(root: string): AgentsMdResult {
  const path = join(root, 'AGENTS.md');
  if (!existsSync(path)) {
    writeFileSync(path, `${AGENTS_BLOCK}\n`);
    return { path, action: 'created' };
  }
  const current = readFileSync(path, 'utf8');
  const next = withBlock(current);
  if (next === current) return { path, action: 'unchanged' };
  writeFileSync(path, next);
  return { path, action: current.includes(BEGIN) ? 'updated' : 'added' };
}

export const MCP_SERVER = 'otea';

export type McpEntry = { command: string; args: string[]; env?: Record<string, string> };

// The project an agent is pinned to: `otea mcp --project <id>`, or this variable in the
// environment of its shell or MCP server.
export const PIN_ENV = 'OTEA_PROJECT_ID';

// A write by an agent pinned to another project than the one its folder resolves to: refused.
export function assertPinned(pin: string | undefined, project: { id: string; name: string }) {
  if (pin === undefined || pin === project.id) return;
  throw new OteaError(
    'forbidden',
    `This agent is pinned to the project ${pin} (otea mcp --project, or ${PIN_ENV}), but this folder is the project ${project.name} (${project.id}); nothing was written. Work from a folder of ${pin}, or point the agent's MCP server at ${project.id}`,
  );
}

// The MCP server an agent adds to its own harness's config (Otea writes none: it works with any
// harness, and each keeps its config its own way): named otea, it runs this Otea's `mcp` for the
// project `project`, pinned to it, so a server started from another project's folder refuses to
// write there. It names no agent: every session names itself, so two terminals never share a name.
export function mcpEntry(launcher: Launcher, project: string): McpEntry {
  return {
    command: launcher.command,
    args: [...launcher.args, 'mcp', '--project', project],
    ...(launcher.env && Object.keys(launcher.env).length > 0 ? { env: { ...launcher.env } } : {}),
  };
}

// The otea entry an older `otea connect` wrote in the project's .mcp.json, which named one agent
// for every session started there; undefined when there is none.
export function oldMcpEntry(root: string): string | undefined {
  const path = join(root, '.mcp.json');
  if (!existsSync(path)) return undefined;
  try {
    const config = JSON.parse(readFileSync(path, 'utf8')) as {
      mcpServers?: Record<string, { args?: unknown }>;
    };
    const args = config.mcpServers?.[MCP_SERVER]?.args;
    return Array.isArray(args) && args.includes('--as') ? path : undefined;
  } catch {
    return undefined;
  }
}
