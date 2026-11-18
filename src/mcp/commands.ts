// Which commands MCP serves as tools, and the tools' names: no dependencies, so the CLI's help
// reads them without loading the MCP server.
// The commands an agent runs, each served as the tool of the same name. The rest belong to the
// human or to setup and stay in the CLI.
export const AGENT_COMMANDS = [
  'board',
  'board draft',
  'list',
  'show',
  'create',
  'update',
  'attach',
  'detach',
  'link',
  'unlink',
  'next',
  'reply',
  'merged',
  'reopen',
  'tick',
  'topic add',
  'topic answer',
  'ask',
  'handoff',
  'drop',
  'approve',
  'send-back',
  'move',
  'claim',
  'profile',
  'heartbeat',
  'release',
  'relay',
  'events',
  'wait',
] as const;

export const CLI_ONLY_COMMANDS = [
  'init',
  'brief',
  // How each model performs is the person's reading, not an agent's.
  'stats',
  'projects list',
  'projects current',
  'projects add',
  'projects relink',
  'projects forget',
  // A repo's name decides which items a gate checks, so agents never set it.
  'repos list',
  'repos add',
  'repos remove',
  'migrate',
  'connect',
  'board add',
  // What the person pastes into an agent's chat: the person copies it, the agent never needs it.
  'prompt',
  // A cut-out image is a file on the agent's own disk, which only the command line can hand it.
  'crop',
  // Topics are the person's to turn on, read, keep going and close; agents record and answer them.
  'topic on',
  'topic off',
  'topic list',
  'topic show',
  'topic note',
  'topic close',
  'collection icon',
  'validate',
  'check',
  'hook install',
  'hook remove',
  'serve',
  'open',
  'devices list',
  'devices revoke',
  'phone status',
  'phone lan',
  'phone tailscale',
  'phone relay',
  'mcp',
];

// next is not among them: it keeps what it offers each agent, and claims it with claim.
export const READ_ONLY = new Set(['board', 'list', 'show', 'events', 'wait']);

// A tool is named after its command, with words joined by underscores (send-back is send_back).
export function toolName(command: string): string {
  return command.replace(/[ -]/g, '_');
}
