import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBoard, publishBoard, saveDraft } from '../app/boards.ts';
import { leaveNote } from '../app/notes.ts';
import { openProject } from '../app/project.ts';
import { creatures } from '../core/board/testing.ts';
import { createMcpServer } from '../mcp/server.ts';
import { COMMANDS } from './commands.ts';
import { type Cli, cliAt, declareProfiles, type TempRepo, tempGitRepo } from './testing.ts';

// Notes from the person while an agent works: what the agent reads of them on the CLI and over MCP,
// how it answers, and the handoff they hold.
describe('notes from the person, on the CLI and over MCP', () => {
  let repo: TempRepo;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  const note = (text: string, anchor?: { evidence: number; seconds?: number }) => {
    const project = openProject(repo.dir);
    try {
      return leaveNote(project, {
        id: 'CRI-1',
        text,
        ...(anchor ? { anchor } : {}),
        actor: { kind: 'human', name: 'human' },
        channel: 'ui',
      });
    } finally {
      project.db.close();
    }
  };

  const art = () => {
    const path = join(repo.dir, 'art.png');
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return path;
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    declareProfiles(repo.dir, 'claude');
    const project = openProject(repo.dir);
    try {
      const record = createBoard(project, { name: 'Criaturas', lang: 'es' });
      saveDraft(project, record.id, { definition: creatures(), baseVersion: null });
      publishBoard(project, record.id, { moves: {}, by: { kind: 'human', name: 'fede' } });
    } finally {
      project.db.close();
    }
    await otea(
      'create',
      '--collection',
      'Criaturas',
      '--title',
      'Tortuga',
      '--field',
      'fdesc=Lenta',
    );
    await otea('claim', 'CRI-1');
  });

  afterEach(() => repo.remove());

  it('gives the note in the heartbeat, with the command that answers it', async () => {
    note('¿Y la cola?');

    const { code, out } = await otea('heartbeat', 'CRI-1');

    expect(code).toBe(0);
    expect(out).toContain('New note from the person (note 1, unanswered):\n  "¿Y la cola?"\n');
    expect(out).toContain('when you had 0 of 1 handoff deliverables');
    expect(out).toContain('  otea reply CRI-1 --note 1 "<your short answer>"');
    const data = await json('heartbeat', 'CRI-1');
    expect(data.notes.map(({ note: n }: { note: number }) => n)).toEqual([1]);
    expect(data.text).toContain('New note from the person (note 1, unanswered):');
  });

  it('says nothing of notes in a heartbeat when none waits', async () => {
    const { out } = await otea('heartbeat', 'CRI-1');
    expect(out).not.toContain('note');
    expect(await json('heartbeat', 'CRI-1')).not.toHaveProperty('notes');
  });

  it('gives the note in show and next, and after an attach', async () => {
    note('¿Y la cola?');

    expect((await otea('show', 'CRI-1')).out).toContain('Notes from the person: 1, 1 unanswered');
    expect((await json('show', 'CRI-1')).notes).toHaveLength(1);
    const next = await otea('next');
    expect(next.out).toContain('  ✗ Notes from the person answered: required (note 1 is not)');
    expect((await json('next')).notes).toHaveLength(1);
    const attached = await otea('attach', 'CRI-1', art(), '--module', 'eart');
    expect(attached.out).toContain('New note from the person (note 1, unanswered):');
    expect((await json('attach', 'CRI-1', art(), '--module', 'eart')).notes).toHaveLength(1);
  });

  it('refuses the handoff with exit 8 until the note is answered, then hands off', async () => {
    await otea('attach', 'CRI-1', art(), '--module', 'eart');
    note('¿Y la cola?');

    const refused = await otea('handoff', 'CRI-1');
    expect(refused.code).toBe(8);
    expect(refused.err).toBe(
      'otea: Not handed off CRI-1: note 1 from the person is unanswered.\nAnswer it first: otea reply CRI-1 --note 1 "<your short answer>"\n',
    );

    const replied = await otea('reply', 'CRI-1', '--note', '1', 'Va en la ronda');
    expect(replied).toMatchObject({
      code: 0,
      out: 'Answered note 1 on CRI-1. Nothing left unanswered: you may hand it off.\n',
    });
    expect((await otea('handoff', 'CRI-1')).code).toBe(0);
    const events = await otea('events', '--item', 'CRI-1');
    expect(events.out).toContain('note_left  note 1: "¿Y la cola?"');
    expect(events.out).toContain('note_answered  note 1: "Va en la ronda"');
  });

  it('refuses a reply without a number, or to a note that is not there', async () => {
    expect((await otea('reply', 'CRI-1', 'hola')).code).toBe(2);
    expect((await otea('reply', 'CRI-1', '--note', 'uno', 'hola')).code).toBe(2);
    const missing = await otea('reply', 'CRI-1', '--note', '3', 'hola');
    expect(missing).toMatchObject({ code: 3, err: 'otea: CRI-1 has no note 3\n' });
  });

  it('wakes a wait with the note', async () => {
    note('¿Y la cola?');
    const { code, out } = await otea('wait', '--turn', 'agent', '--timeout', '5s');
    expect(code).toBe(0);
    expect(out).toBe('CRI-1: new note from the person (note 1). Read it: otea show CRI-1\n');
  });

  it('answers over MCP with the reply tool, and gives the notes as JSON with the text', async () => {
    note('¿Y la cola?');
    const server = createMcpServer(COMMANDS, { cwd: repo.dir, agent: 'claude', warn: () => {} });
    const client = new Client({ name: 'test', version: '0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);
    const call = async (name: string, args: Record<string, unknown>) => {
      const reply = (await client.callTool({ name, arguments: args })) as {
        isError?: boolean;
        content: { text: string }[];
      };
      return { isError: reply.isError, data: JSON.parse(reply.content[0]?.text ?? 'null') };
    };

    const beat = await call('heartbeat', { id: 'CRI-1' });
    expect(beat.data.notes).toHaveLength(1);
    expect(beat.data.text).toContain('otea reply CRI-1 --note 1');

    const answered = await call('reply', { id: 'CRI-1', note: '1', answer: 'Sí' });
    expect(answered.isError).toBe(false);
    expect(answered.data.text).toBe(
      'Answered note 1 on CRI-1. Nothing left unanswered: you may hand it off.',
    );
    expect(answered.data.note.answer).toMatchObject({ text: 'Sí', by: 'claude' });
    await client.close();
  });
});
