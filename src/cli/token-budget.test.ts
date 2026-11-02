import { writeFileSync } from 'node:fs';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { createMcpServer } from '../mcp/server.ts';
import { COMMANDS } from './commands.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

// What an agent reads back costs tokens on every call, so each operation has a budget per surface:
// the CLI text, the CLI --json and the MCP tool result. Tokens are estimated as characters / 4,
// rounded up: no tokenizer, close enough to catch a regression. Each budget is the size measured on
// the bug below when the budget was set, plus about 10% headroom. Raise one only on purpose, and
// say why in the commit. OTEA_TOKEN_REPORT=<file> writes the measured sizes there.
const tokens = (text: string) => Math.ceil(text.length / 4);

type Surface = 'text' | 'json' | 'mcp';
type Sizes = Partial<Record<Surface, number>>;

const BUDGETS: Readonly<Record<string, Sizes>> = {
  // The bug being fixed: every field, six events, two evidence files.
  show: { text: 380, json: 810, mcp: 810 },
  // One row per item; measured with that bug alone.
  list: { text: 25, json: 195, mcp: 195 },
  'playbook index': { text: 40, json: 30, mcp: 30 },
  // The whole bug-triage playbook, read once per session; show's Next: line covers each step.
  playbook: { text: 2920, json: 2990, mcp: 2990 },
  create: { text: 5, json: 180, mcp: 180 },
  claim: { text: 25, json: 195, mcp: 195 },
  move: { text: 25, json: 195, mcp: 195 },
  attach: { text: 15, json: 90, mcp: 90 },
  wait: { text: 25, json: 195, mcp: 195 },
  // The tool definitions an MCP client reads when it connects.
  tools: { mcp: 1910 },
};

// A bug as an agent files it in the bug-triage preset, every field filled.
const DESCRIPTION = 'Saving a draft with an emoji in the title crashes the editor.';
const FIELDS = [
  'steps=1. Open a new draft\n2. Type "Hi 👋" as the title\n3. Press Save',
  'expected=The draft is saved.',
  'actual=The editor shows a blank page and the console logs a RangeError.',
  'environment=Firefox 131, macOS 15',
  'severity=high',
  'category=crash',
  'area=editor',
];
const TITLE = 'Emoji title crashes the editor';
const BUG_ARGS = [
  '--collection',
  'bugs',
  '--title',
  TITLE,
  '--description',
  DESCRIPTION,
  ...FIELDS.flatMap((field) => ['--field', field]),
];

type Call = { cli: string[]; mcp: Record<string, unknown> };

describe('token budget', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  let client: Client;
  const sizes: Record<string, Sizes> = {};

  const ok = async (...argv: string[]) => {
    const result = await otea(...argv);
    if (result.code !== 0) throw new Error(`otea ${argv.join(' ')}: ${result.err}`);
    return result.out;
  };

  const toolText = async ({ name, args }: { name: string; args: Record<string, unknown> }) => {
    const reply = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    const text = reply.content[0]?.text ?? '';
    if (reply.isError) throw new Error(`${name}: ${text}`);
    return text;
  };

  // Runs the operation as text, as --json and as an MCP tool. A write gets a fresh call (a fresh
  // item) for each surface, so all three read back the same thing.
  const measure = async (name: string, tool: string, next: () => Promise<Call>) => {
    const text = await ok(...(await next()).cli);
    const json = await ok(...(await next()).cli, '--json');
    const mcp = await toolText({ name: tool, args: (await next()).mcp });
    sizes[name] = { text: tokens(text), json: tokens(json), mcp: tokens(mcp) };
  };

  // A bug filed, accepted by the human in conversation and claimed: ready to be fixed.
  const accepted = async () => {
    const { id } = JSON.parse(await ok('create', ...BUG_ARGS, '--json')) as { id: string };
    await ok('relay', id, 'accepted', '--quote', 'Yes, fix it');
    await ok('claim', id);
    return id;
  };

  const same = (call: Call) => async () => call;
  const onAccepted = (call: (id: string) => Call) => async () => call(await accepted());

  beforeAll(async () => {
    repo = tempGitRepo();
    repo.write('shots/before.png', 'x'.repeat(2048));
    repo.write('test.log', 'PASS 12 tests\n');
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await ok('init');
    await ok('collection', 'add', 'bugs', '--preset', 'bug-triage');
    const actor: Actor = { kind: 'agent', name: 'claude' };
    const server = createMcpServer(COMMANDS, { cwd: repo.dir, actor, warn: () => {} });
    client = new Client({ name: 'test', version: '0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);

    // The bug being fixed, with proof attached.
    const id = await accepted();
    await ok('move', id, 'fixing');
    await ok('attach', id, 'shots/before.png', '--role', 'before', '--caption', 'Blank page');
    await ok('attach', id, 'test.log', '--caption', '12 tests pass');

    await measure('show', 'show', same({ cli: ['show', id], mcp: { id } }));
    await measure('list', 'list', same({ cli: ['list'], mcp: {} }));
    await measure(
      'wait',
      'wait',
      same({ cli: ['wait', '--turn', 'agent'], mcp: { turn: 'agent' } }),
    );
    await measure('playbook index', 'playbook', same({ cli: ['playbook'], mcp: {} }));
    await measure(
      'playbook',
      'playbook',
      same({ cli: ['playbook', '--collection', 'bugs'], mcp: { collection: 'bugs' } }),
    );
    await measure(
      'create',
      'create',
      same({
        cli: ['create', ...BUG_ARGS],
        mcp: { collection: 'bugs', title: TITLE, description: DESCRIPTION, field: FIELDS },
      }),
    );
    await measure('claim', 'claim', async () => {
      const { id } = JSON.parse(await ok('create', ...BUG_ARGS, '--json')) as { id: string };
      await ok('relay', id, 'accepted', '--quote', 'Yes, fix it');
      return { cli: ['claim', id], mcp: { id } };
    });
    await measure(
      'move',
      'move',
      onAccepted((id) => ({ cli: ['move', id, 'fixing'], mcp: { id, state: 'fixing' } })),
    );
    await measure(
      'attach',
      'attach',
      onAccepted((id) => ({
        cli: ['attach', id, 'test.log', '--caption', '12 tests pass'],
        mcp: { id, file: 'test.log', caption: '12 tests pass' },
      })),
    );
    sizes.tools = { mcp: tokens(JSON.stringify(await client.listTools())) };
  }, 60_000);

  afterAll(async () => {
    await client?.close();
    repo?.remove();
    const report = process.env.OTEA_TOKEN_REPORT;
    if (report) writeFileSync(report, `${JSON.stringify(sizes, null, 2)}\n`);
  });

  for (const [name, budget] of Object.entries(BUDGETS)) {
    it(`keeps ${name} within its budget`, () => {
      for (const [surface, limit] of Object.entries(budget)) {
        expect(sizes[name]?.[surface as Surface], `${name} ${surface}`).toBeLessThanOrEqual(limit);
      }
    });
  }
});
