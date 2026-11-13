import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBoard, publishBoard, saveDraft } from '../app/boards.ts';
import { getItem } from '../app/items.ts';
import { sendBackItem } from '../app/next.ts';
import { openProject } from '../app/project.ts';
import { handoffCheck, positionOf } from '../core/board/engine.ts';
import { nextText, refusalText } from '../core/board/next.ts';
import { creatures } from '../core/board/testing.ts';
import { createMcpServer } from '../mcp/server.ts';
import { COMMANDS } from './commands.ts';
import { type Cli, cliAt, declareProfiles, type TempRepo, tempGitRepo } from './testing.ts';

// The line every next ends with, for an agent that declared the profile declareProfiles gives.
const reminder = (agent: string) =>
  `Your profile: claude-opus-5-5 · high. If you changed model or effort, update it: otea profile --model <id> --effort <level> --as ${agent}`;

// Agents on a published board: next, handoff, approve and send-back, worded by the one writer.
describe('next and the board moves', () => {
  let repo: TempRepo;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    declareProfiles(repo.dir, 'claude', 'quill', 'kiln', 'scout');
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
  });

  afterEach(() => repo.remove());

  const art = () => {
    const path = join(repo.dir, 'art.png');
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return path;
  };

  it('prints the item to take in exactly the words nextText writes', async () => {
    const { code, out } = await otea('next', '--as', 'quill');

    const project = openProject(repo.dir);
    let expected: string;
    try {
      const item = getItem(project, 'CRI-1');
      const position = positionOf(item.state);
      expected = nextText(creatures(), {
        id: 'CRI-1',
        title: 'Tortuga',
        position,
        round: 1,
        fields: item.fields,
        evidence: {},
        missing: handoffCheck(creatures(), 'sconcept', { fields: item.fields, evidence: [] })
          .missing,
        me: 'quill',
      });
    } finally {
      project.db.close();
    }
    expect(code).toBe(0);
    expect(out).toBe(`${expected}\n\n${reminder('quill')}\n`);
  });

  it('says what to do meanwhile when nothing is the agent’s', async () => {
    await otea('attach', 'CRI-1', art(), '--module', 'eart', '--as', 'quill');
    await otea('handoff', 'CRI-1', '--as', 'quill');

    const { code, out } = await otea('next', '--collection', 'Criaturas', '--as', 'kiln');

    expect(code).toBe(0);
    expect(out).toBe(
      `Nothing to do on Criaturas right now.\nWait for one: otea wait --turn agent --unclaimed --collection Criaturas, then otea next --collection Criaturas.\n\n${reminder('kiln')}\n`,
    );
    expect((await otea('next', '--collection', 'Nope')).code).toBe(3);
  });

  it('claims the item it offers with --claim, so a second agent gets another', async () => {
    await otea('create', '--collection', 'Criaturas', '--title', 'Rana', '--field', 'fdesc=Verde');

    const taken = await json('next', '--claim', '--as', 'quill');
    const other = await json('next', '--as', 'kiln');

    expect(taken).toMatchObject({ item: 'CRI-1', lease: { holder: 'quill' } });
    expect(taken.text).toContain('\nYou hold it until ');
    expect((await json('show', 'CRI-1')).lease).toMatchObject({ holder: 'quill' });
    expect(other.item).toBe('CRI-2');
    expect(other.text).toContain('\nClaim it first: otea claim CRI-2 ');
    // kiln was just offered CRI-2: a third agent is offered neither.
    expect((await json('next', '--as', 'scout')).item).toBeNull();
  });

  it('lists the ways a step has when an agent names one it has not', async () => {
    const bad = await otea('handoff', 'CRI-1', '--way', 'Triar', '--as', 'quill');

    expect(bad.code).toBe(4);
    expect(bad.err).toBe(
      'otea: CRI-1 has no way "Triar" from Concepto. From Concepto it goes on to Animar or Done.\n',
    );
  });

  it('refuses a handoff with nothing attached, exactly, then hands it off', async () => {
    const early = await otea('handoff', 'CRI-1', '--as', 'quill');

    expect(early.code).toBe(8);
    expect(early.err).toBe(
      `otea: ${refusalText('CRI-1', [{ ref: 'eart', name: 'Arte conceptual', reason: 'missing', fresh: true }])}\n`,
    );
    expect(early.err).toContain('Not handed off CRI-1: missing Arte conceptual (new this round).');
    await otea('attach', 'CRI-1', art(), '--module', 'eart', '--as', 'quill');

    const handed = await otea('handoff', 'CRI-1', '--as', 'quill');

    expect(handed).toMatchObject({
      code: 0,
      out: 'Handed off. CRI-1 waits for the person to review Concepto.\n',
    });
    expect((await json('show', 'CRI-1')).state).toBe('sconcept__review');
  });

  it('refuses an agent approving the person’s review as forbidden, and a bad way', async () => {
    await otea('attach', 'CRI-1', art(), '--module', 'eart', '--as', 'quill');
    await otea('handoff', 'CRI-1', '--as', 'quill');

    expect((await otea('approve', 'CRI-1', '--as', 'quill')).code).toBe(7);
    expect((await otea('send-back', 'CRI-1', '--reason', 'No', '--as', 'quill')).code).toBe(7);
    expect((await otea('send-back', 'CRI-1')).code).toBe(2);
    const bad = await otea('handoff', 'CRI-1', '--way', 'Nowhere', '--as', 'quill');
    expect(bad.code).toBe(4);
  });

  it('gives the note of a send-back to next, show and MCP, and wants a note to hand it in again', async () => {
    await otea('attach', 'CRI-1', art(), '--module', 'eart', '--as', 'quill');
    await otea('handoff', 'CRI-1', '--as', 'quill');
    const project = openProject(repo.dir);
    try {
      sendBackItem(project, {
        id: 'CRI-1',
        actor: { kind: 'human', name: 'fede' },
        channel: 'ui',
        reason: 'Más barro en las patas',
      });
    } finally {
      project.db.close();
    }
    const block = 'Sent back to you: "Más barro en las patas"\n  by the person, ';
    const sentBack = {
      note: 'Más barro en las patas',
      by: { kind: 'human', name: 'fede' },
      step: 'Concepto',
      round: 1,
    };

    expect((await otea('next', '--as', 'quill')).out).toContain(block);
    expect(await json('next', '--as', 'quill')).toMatchObject({ item: 'CRI-1', sentBack });
    expect((await otea('show', 'CRI-1', '--as', 'quill')).out).toContain(
      'Next:\n  CRI-1 · Criatura · Concepto, round 2\n  Your turn: do this step.\n  Claim it first: otea claim CRI-1 (otea next --claim takes and claims the next in one call).\n\n  Sent back to you: "Más barro en las patas"\n    by the person, ',
    );
    expect((await json('show', 'CRI-1', '--as', 'quill')).board.sentBack).toMatchObject(sentBack);

    const client = new Client({ name: 'test', version: '0' });
    const server = createMcpServer(COMMANDS, {
      cwd: repo.dir,
      agent: 'quill',
      warn: () => {},
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);
    const tool = async (name: string, args: Record<string, unknown>) => {
      const reply = (await client.callTool({ name, arguments: args })) as {
        content: { text: string }[];
      };
      return JSON.parse(reply.content[0]?.text ?? '');
    };
    try {
      // A new session: the agent declares its profile before next offers it work.
      await tool('profile', { model: 'claude-opus-5-5', effort: 'high' });
      const next = await tool('next', {});
      expect(next).toMatchObject({ item: 'CRI-1', sentBack });
      expect(next.text).toContain(block);
      expect((await tool('show', { id: 'CRI-1' })).board.sentBack).toMatchObject(sentBack);
    } finally {
      await client.close();
    }

    await otea('attach', 'CRI-1', art(), '--module', 'eart', '--as', 'quill');
    const bare = await otea('handoff', 'CRI-1', '--as', 'quill');
    expect(bare.code).toBe(8);
    expect(bare.err).toBe(
      'otea: Not handed off CRI-1: missing a note (it was sent back: say what you changed).\nCall handoff again with --note "<what you changed since it was sent back>".\n',
    );
    const noted = await otea('handoff', 'CRI-1', '--note', 'Barro añadido', '--as', 'quill');
    expect(noted).toMatchObject({
      code: 0,
      out: 'Handed off. CRI-1 waits for the person to review Concepto.\n',
    });
  });

  it('sends another agent elsewhere while one holds the item, in show and MCP alike', async () => {
    await otea('claim', 'CRI-1', '--as', 'quill');
    const held =
      /^ {2}CRI-1 · Criatura · Concepto, round 1\n {2}Held by quill until \d{4}-\d\d-\d\d \d\d:\d\d UTC: pick another item\.$/m;

    const shown = (await otea('show', 'CRI-1', '--as', 'scout')).out;
    expect(shown).toMatch(held);
    expect(shown).not.toContain('Your turn');
    expect((await otea('show', 'CRI-1', '--as', 'quill')).out).toContain(
      'Your turn: do this step.',
    );

    const client = new Client({ name: 'test', version: '0' });
    const server = createMcpServer(COMMANDS, {
      cwd: repo.dir,
      agent: 'scout',
      warn: () => {},
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);
    try {
      const reply = (await client.callTool({ name: 'show', arguments: { id: 'CRI-1' } })) as {
        content: { text: string }[];
      };
      const hint = JSON.parse(reply.content[0]?.text ?? '').hint as string;
      expect(hint).toMatch(
        /\nHeld by quill until \d{4}-\d\d-\d\d \d\d:\d\d UTC: pick another item\.$/,
      );
    } finally {
      await client.close();
    }
  });

  it('prints the moved item and the line with --json', async () => {
    await otea('attach', 'CRI-1', art(), '--module', 'eart', '--as', 'quill');

    const handed = await json('handoff', 'CRI-1', '--as', 'quill');

    expect(handed).toMatchObject({
      item: { id: 'CRI-1', state: 'sconcept__review', turn: 'human' },
      text: 'Handed off. CRI-1 waits for the person to review Concepto.',
    });
  });
});

describe('audio and other files on a board', () => {
  let repo: TempRepo;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    declareProfiles(repo.dir, 'claude', 'quill', 'kiln', 'scout');
    const def = creatures();
    def.parts.evoice = { id: 'evoice', name: 'Voz', kind: 'audio', hint: '', options: [] };
    def.parts.efile = { id: 'efile', name: 'Proyecto', kind: 'file', hint: '', options: [] };
    def.steps[0]?.hand.push(
      { ref: 'evoice', req: 'no', fresh: false },
      { ref: 'efile', req: 'no', fresh: false },
    );
    const project = openProject(repo.dir);
    try {
      const record = createBoard(project, { name: 'Criaturas', lang: 'es' });
      saveDraft(project, record.id, { definition: def, baseVersion: null });
      publishBoard(project, record.id, { moves: {}, by: { kind: 'human', name: 'fede' } });
    } finally {
      project.db.close();
    }
    await otea('create', '--collection', 'Criaturas', '--title', 'Rana', '--field', 'fdesc=Verde');
  });

  afterEach(() => repo.remove());

  it('lets an agent attach a sound and a project file to their parts', async () => {
    repo.write('croak.mp3', 'ID3');
    repo.write('rana.blend', 'BLENDER');

    const sound = await otea('attach', 'CRI-1', join(repo.dir, 'croak.mp3'), '--json');
    const file = await otea(
      'attach',
      'CRI-1',
      join(repo.dir, 'rana.blend'),
      '--module',
      'efile',
      '--json',
    );

    expect(sound.code, sound.err).toBe(2);
    expect(sound.err).toContain('module');
    const voice = await otea(
      'attach',
      'CRI-1',
      join(repo.dir, 'croak.mp3'),
      '--module',
      'evoice',
      '--json',
    );
    expect(JSON.parse(voice.out)).toMatchObject({
      module: 'evoice',
      moduleName: 'Voz',
      kind: 'audio',
    });
    expect(JSON.parse(file.out)).toMatchObject({
      module: 'efile',
      moduleName: 'Proyecto',
      kind: 'file',
    });
  });
});
