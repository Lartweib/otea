import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertAgentName } from '../core/item.ts';

const BEGIN = '<!-- otea:begin -->';
const END = '<!-- otea:end -->';

// The marked block `otea init --agents-md` keeps in the project's AGENTS.md: it points agents at
// their playbook. Only the text between the markers is Otea's.
export const AGENTS_BLOCK = [
  BEGIN,
  '## Otea',
  '',
  'This project hands work between humans and agents through Otea. Before you pick up an item, run `otea playbook` (or call the `playbook` tool of the Otea MCP server) and follow the playbook of the collection you work in. `otea show <id>` says what to do next with each item.',
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

export type McpEntry = { command: string; args: string[] };

export type Connection = McpEntry & { path: string; server: string; agent: string };

// Pins the agent's name in the project's MCP config (.mcp.json, read by Claude Code and other
// clients), so everything the server does is attributed to it. Other servers are kept.
export function connectAgent(root: string, agent: string, main: string): Connection {
  assertAgentName(agent);
  const path = join(root, '.mcp.json');
  const config = existsSync(path) ? readConfig(path) : {};
  const entry: McpEntry = {
    command: 'node',
    args: ['--disable-warning=ExperimentalWarning', main, 'mcp', '--as', agent],
  };
  const servers = { ...(config.mcpServers ?? {}), [MCP_SERVER]: entry };
  writeFileSync(path, `${JSON.stringify({ ...config, mcpServers: servers }, null, 2)}\n`);
  return { path, server: MCP_SERVER, agent, ...entry };
}

type McpConfig = { mcpServers?: Record<string, unknown> };

function readConfig(path: string): McpConfig {
  try {
    const config: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (config !== null && typeof config === 'object' && !Array.isArray(config)) return config;
  } catch {}
  throw new Error(`${path} is not a JSON object; fix it or remove it, then connect again`);
}
