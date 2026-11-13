import { writeFileSync } from 'node:fs';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpServer } from '../mcp/server.ts';
import { COMMANDS } from './commands.ts';
import { type Cli, cliAt, declareProfiles, presetCollection, tempGitRepo } from './testing.ts';

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
  // Raised when show's Next: became next's whole answer on a board, and again when a preset's
  // playbook became the board's text: Next: gives its first paragraph and where the rest is.
  // Raised when --json and MCP gave each field as { id, name, value } and each step its name.
  show: { text: 580, json: 1170, mcp: 1170 },
  // One row per item; measured with that bug alone. Raised with show, for the same names.
  list: { text: 25, json: 285, mcp: 285 },
  // Raised when otea board began with Otea's agent guide (instructions below): read once a session.
  // Raised again with the guide's line on declaring the profile (otea profile), and with its line
  // on asking the person with otea ask (measured at 308).
  'board index': { text: 330, json: 53, mcp: 53 },
  // The bug board's own words and each step's instructions, read once per session; show's Next:
  // block covers the step at hand. Raised when a preset collection read as a board kept its
  // playbook as the board's text: what agents read on the preset, as before.
  // Its text opens with Otea's agent guide too.
  board: { text: 3255, json: 3090, mcp: 3090 },
  // On a board, create says where the item starts (and why its first step was skipped).
  // The item rows below were raised with show, for the same names.
  create: { text: 20, json: 270, mcp: 270 },
  claim: { text: 25, json: 285, mcp: 285 },
  handoff: { text: 25, json: 295, mcp: 295 },
  attach: { text: 15, json: 90, mcp: 90 },
  wait: { text: 25, json: 285, mcp: 285 },
  // The tool definitions an MCP client reads when it connects.
  // Raised for next, handoff, approve and send_back, the board moves.
  // drop, handoff's --note and its ways back. Raised for the as every tool takes: the agent making
  // the call, so subagents sharing one server keep their own leases. Raised for reply, the answer
  // to a note from the person, and wait saying a note wakes it (measured at 3347). Raised for ask,
  // an agent's question to the person, which hands the turn over (measured at 3481).
  tools: { mcp: 3600 },
  // Otea's agent guide, the server's instructions: in every MCP agent's context from the start, so
  // it buys only what agents keep getting wrong. Measured at 203. Raised to 270 for the line on
  // declaring the profile every agent and subagent must keep current (measured at 246). Raised to
  // 300 for the line on asking the person only with otea ask, the one way that hands the turn over
  // (measured at 279).
  instructions: { mcp: 300 },
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
    await ok('init', '--template', 'none');
    declareProfiles(repo.dir, 'claude');
    presetCollection(repo.dir, 'bugs', 'bug-triage');
    const server = createMcpServer(COMMANDS, { cwd: repo.dir, agent: 'claude', warn: () => {} });
    client = new Client({ name: 'test', version: '0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);

    // The bug being fixed, with proof attached.
    const id = await accepted();
    await ok('attach', id, 'shots/before.png', '--role', 'before', '--caption', 'Blank page');
    await ok('attach', id, 'test.log', '--caption', '12 tests pass');

    await measure('show', 'show', same({ cli: ['show', id], mcp: { id } }));
    await measure('list', 'list', same({ cli: ['list'], mcp: {} }));
    await measure(
      'wait',
      'wait',
      same({ cli: ['wait', '--turn', 'agent'], mcp: { turn: 'agent' } }),
    );
    await measure('board index', 'board', same({ cli: ['board'], mcp: {} }));
    await measure('board', 'board', same({ cli: ['board', 'bugs'], mcp: { name: 'bugs' } }));
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
      'handoff',
      'handoff',
      onAccepted((id) => ({
        cli: ['handoff', id, '--note', 'Saved with an emoji: no crash'],
        mcp: { id, note: 'Saved with an emoji: no crash' },
      })),
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
    sizes.instructions = { mcp: tokens(client.getInstructions() ?? '') };
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
