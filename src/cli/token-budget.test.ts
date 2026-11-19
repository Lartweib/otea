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
  // Raised when each file got a path an agent can open: one per file in --json and MCP, one line
  // with the first as the example in the text (P5-R2-4; measured at 584, 1174 and 1179).
  show: { text: 640, json: 1290, mcp: 1290 },
  // One row per item; measured with that bug alone. Raised with show, for the same names.
  list: { text: 25, json: 285, mcp: 285 },
  // Raised when otea board began with Otea's agent guide (instructions below): read once a session.
  // Raised again with the guide's line on declaring the profile (otea profile), and with its line
  // on asking the person with otea ask (measured at 308), and its line on proposing a new board
  // with otea board draft --new (measured at 341), and its line on keeping going after a handoff,
  // waiting when there is nothing (measured at 412), and with board draft's --template and asking
  // the person first (measured at 432), and with next following the order the person set on the
  // Matrix, a word agents did not know (measured at 449), and with claiming again once a lease ran
  // out and a subagent releasing what it holds before it ends (measured at 473), and with every
  // chat request going on a board first and waiting in a background shell (measured at 512).
  // Raised to 560 for otea whoami, which gives a new session the name it worked under. Raised to
  // 630 with the guide's lines on answering in Otea and on staying in the wait (measured at 606).
  // Raised to 640 with the guide's line on otea answer (P4-R2-2; measured at 633). Raised to 660
  // with rule 2 saying to declare what the session says and never to open config files outside the
  // project, as an agent read the person's harness settings to learn its effort (P3C-R3-8; measured
  // at 649). Raised to 700 with rule 12 saying to set an item aside with otea release --later when
  // the person wants it later, and never to poll in a loop of one's own, as an agent did both
  // (P3C-R3-2; measured at 690).
  'board index': { text: 700, json: 53, mcp: 53 },
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
  // Raised for its last line, the exact command to keep going and wait again (measured at 60).
  wait: { text: 70, json: 285, mcp: 285 },
  // The tool definitions an MCP client reads when it connects.
  // Raised for next, handoff, approve and send_back, the board moves.
  // drop, handoff's --note and its ways back. Raised for the as every tool takes: the agent making
  // the call, so subagents sharing one server keep their own leases. Raised for reply, the answer
  // to a note from the person, and wait saying a note wakes it (measured at 3347). Raised for ask,
  // an agent's question to the person, which hands the turn over (measured at 3481). Raised for
  // board_draft's new and why, an agent proposing a board the person asked for (measured at 3606).
  // Raised for merged, recording that a Done item's branch is in (measured at 3768). Raised for
  // tick, a checklist point with its proof, and attach's --point (measured at 3980). Raised for
  // topic_add and topic_answer, the side topics an agent records, and create's --from (measured
  // at 4275). Raised for reopen, the way back for a Done item whose PR conflicts (measured at 4393). Raised for
  // detach, taking back a file attached by mistake (measured at 4541). Raised for topic_list (with
  // its search) and topic_show, so an agent asked what was concluded before reads the topics kept
  // (measured at 4806). Raised for whoami, the name a new session worked under before. Raised for
  // release's --later, setting aside an item the person wants for later (measured at 5012). Raised
  // for topic_list's all-projects and topic_show's project: what was concluded about one project is
  // often asked in another (P6-R2-4; measured at 5078). Raised for board_draft's change, an agent
  // proposing a field or a step for a published board, which agents told the person they could not
  // do (P4-6; measured at 5134 with board_draft's summary trimmed). Raised for reply's note, whose
  // description was only "n": an agent answered a send-back reason with it three times, so it says
  // what the number is and that a send-back reason is not one (P2S-R3-5; measured at 5162).
  // Raised for answer, the person's answer to a question given in the chat, which an agent could
  // not put on the question and asked the person to paste into Otea (P4-R2-2; measured at 5272).
  // Raised for profile's help: declare what the session says, never a config file opened outside
  // the project, which an agent read to learn its effort (P3C-R3-8; measured at 5288).
  tools: { mcp: 5300 },
  // Otea's agent guide, the server's instructions: in every MCP agent's context from the start, so
  // it buys only what agents keep getting wrong. Measured at 203. Raised to 270 for the line on
  // declaring the profile every agent and subagent must keep current (measured at 246). Raised to
  // 300 for the line on asking the person only with otea ask, the one way that hands the turn over
  // (measured at 279). Raised to 340 for the line on proposing a new board with board draft --new,
  // which agents told the person they could not do (measured at 312). Raised to 400 for the line on
  // keeping going until the person stops it, as agents did one item and ended (measured at 383).
  // Raised to 410 for drafting a board from a template after asking the person (measured at 403).
  // Raised to 450 for next following the order the person set on the Matrix, a view agents asked
  // to "use the Matrix" did not know (measured at 430). Raised to 470 for claiming again once a
  // lease ran out, which Otea now enforces, and for a subagent releasing what it holds before it
  // ends, as dead subagents' leases blocked the lead (measured at 454). Raised to 510 for every chat
  // request going on a board first, as an agent did eleven chat requests with no item, and for
  // waiting in a background shell, as the MCP wait tool held OpenCode's chat (measured at 494).
  // Raised to 545 for otea whoami (rule 1), so one agent keeps one name across sessions. Raised to
  // 610 for telling the person to answer in Otea, not in the chat (P4-R2-2), and for staying in the
  // wait: only it hears the desk, agents went back to it neither after a chat reply nor stopped it
  // safely (P2S-6, P8-R2-13, P8-R2-11; measured at 587). Raised to 620 because people answer in the
  // chat anyway: rule 10 now says that answer goes on the question with otea answer, where it
  // said to tell them to answer in Otea (P4-R2-2; measured at 614). Raised to 640 for rule 2:
  // declare what the session says, never open config files outside the project, as «read from your
  // settings» sent an agent to the person's harness settings (P3C-R3-8; measured at 630). Raised
  // to 680 for rule 12: «leave it for later» is otea release --later, and otea wait is the way to
  // wait, as an agent released an item plainly, stopped waiting and later polled on its own
  // (P3C-R3-2; measured at 671).
  instructions: { mcp: 680 },
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
