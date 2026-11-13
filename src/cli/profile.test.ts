import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject } from '../app/project.ts';
import { createMcpServer } from '../mcp/server.ts';
import { findProfile } from '../store/queries.ts';
import { COMMANDS } from './commands.ts';
import { type Cli, cliAt, type TempRepo, tempGitRepo } from './testing.ts';

const DECLARE = ['profile', '--model', 'claude-opus-5-5', '--effort', 'high'];

// Every agent declares the profile it runs as; next and claim stand on it.
describe('otea profile', () => {
  let repo: TempRepo;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);
  const profileOf = (agent: string) => {
    const project = openProject(repo.dir);
    try {
      return findProfile(project.db, agent);
    } finally {
      project.db.close();
    }
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local');
    await otea('create', '--collection', 'Tareas', '--title', 'First');
  });

  afterEach(() => repo.remove());

  it('declares the harness, model and effort the agent runs as', async () => {
    const { code, out } = await otea(...DECLARE, '--harness', 'claude-code');

    expect(code).toBe(0);
    expect(out).toBe('claude runs as claude-opus-5-5 · high on claude-code (family opus)\n');
    expect(await json('profile')).toEqual({
      agent: 'claude',
      profile: {
        harness: 'claude-code',
        model: 'claude-opus-5-5',
        effort: 'high',
        family: 'opus',
      },
      confirmed: true,
    });
  });

  it('asks a command-line agent for its harness the first time', async () => {
    const { code, err } = await otea(...DECLARE);

    expect(code).toBe(2);
    expect(err).toContain('--harness <name>');
  });

  it('updates one value and keeps the rest', async () => {
    await otea(...DECLARE, '--harness', 'claude-code');
    await otea('profile', '--effort', 'max');

    expect(profileOf('claude')?.profile).toEqual({
      harness: 'claude-code',
      model: 'claude-opus-5-5',
      effort: 'max',
    });
  });

  it('says there is none yet, and how to declare it', async () => {
    const { code, out } = await otea('profile');

    expect(code).toBe(0);
    expect(out).toContain('claude has no profile yet');
    expect(out).toContain('otea profile --model <id> --effort <level> --as claude');
  });

  describe('claim', () => {
    it('is refused without a profile, saying how to declare it', async () => {
      const { code, err } = await otea('claim', 'TAR-1');

      expect(code).toBe(2);
      expect(err).toContain('claude has no profile yet');
      expect(err).toContain('otea profile --model <id> --effort <level> --as claude');
    });

    it('keeps the profile on its event', async () => {
      await otea(...DECLARE, '--harness', 'claude-code');
      await otea('claim', 'TAR-1');

      const events = await otea('events', '--item', 'TAR-1', '--json');
      const claimed = events.out
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
        .find((event) => event.type === 'claimed');
      expect(claimed.profile).toEqual({
        harness: 'claude-code',
        model: 'claude-opus-5-5',
        effort: 'high',
        family: 'opus',
      });
    });
  });

  describe('next', () => {
    it('is refused without a profile', async () => {
      const { code, err } = await otea('next');

      expect(code).toBe(2);
      expect(err).toContain('claude has no profile yet');
    });

    it('ends with the profile on record and how to update it', async () => {
      await otea(...DECLARE, '--harness', 'claude-code');

      const { out } = await otea('next');
      const answer = await json('next');

      expect(out.trimEnd().split('\n').at(-1)).toBe(
        'Your profile: claude-opus-5-5 · high. If you changed model or effort, update it: otea profile --model <id> --effort <level> --as claude',
      );
      expect(answer.profile).toEqual({
        harness: 'claude-code',
        model: 'claude-opus-5-5',
        effort: 'high',
        family: 'opus',
      });
      expect(answer.text).toContain('Your profile: claude-opus-5-5 · high.');
    });
  });

  describe('connect', () => {
    it('is refused without a profile, saying how to give one', async () => {
      const { code, err } = await otea('connect', '--as', 'claude-b');

      expect(code).toBe(2);
      expect(err).toContain('--model <id> --effort <level>');
    });

    it('records the profile, to be confirmed when the agent connects', async () => {
      const { code } = await otea(
        'connect',
        '--as',
        'claude-b',
        '--model',
        'gpt-5',
        '--effort',
        'low',
      );

      expect(code).toBe(0);
      expect(profileOf('claude-b')).toEqual({
        profile: { harness: 'mcp', model: 'gpt-5', effort: 'low' },
        confirmed: false,
      });
    });
  });

  describe('over MCP', () => {
    let client: Client;

    const connectClient = async (agent?: string) => {
      const context = { cwd: repo.dir, warn: () => {}, ...(agent ? { agent } : {}) };
      const server = createMcpServer(COMMANDS, context);
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      await server.connect(serverSide);
      const next = new Client({ name: 'claude-code', version: '2.1.0' });
      await next.connect(clientSide);
      return next;
    };

    const call = async (name: string, args: Record<string, unknown>) => {
      const reply = (await client.callTool({ name, arguments: args })) as {
        isError?: boolean;
        content: { text: string }[];
      };
      return { isError: reply.isError === true, data: JSON.parse(reply.content[0]?.text ?? '') };
    };

    afterEach(async () => client?.close());

    it('takes the harness from the client', async () => {
      client = await connectClient();

      const { data } = await call('profile', {
        as: 'quill',
        model: 'claude-sonnet-4-5',
        effort: 'medium',
      });

      expect(data.profile).toEqual({
        harness: 'claude-code',
        model: 'claude-sonnet-4-5',
        effort: 'medium',
        family: 'sonnet',
      });
    });

    it('leaves the profile unconfirmed in a new session until it is declared again', async () => {
      client = await connectClient();
      await call('profile', { as: 'quill', model: 'claude-opus-5-5', effort: 'high' });
      expect((await call('next', { as: 'quill' })).isError).toBe(false);
      await client.close();

      client = await connectClient();
      const refused = await call('next', { as: 'quill' });

      expect(refused.isError).toBe(true);
      expect(refused.data.error.code).toBe('profile_required');
      expect(refused.data.error.message).toContain('not confirmed in this session');
      expect(refused.data.error.message).toContain(
        'the profile tool with as "quill", model <id> and effort <level>',
      );

      await call('profile', { as: 'quill', model: 'claude-opus-5-5', effort: 'high' });
      expect((await call('next', { as: 'quill' })).isError).toBe(false);
    });
  });
});
