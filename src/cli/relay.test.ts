import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, presetCollection, tempGitRepo } from './testing.ts';

const QUOTE = 'Discard it, the old flow is gone';
const USAGE = 'Usage: otea relay <id> <state> --quote <what the human said> [--reason <reason>]';

describe('relay', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    presetCollection(repo.dir, 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'Old flow', '--description', 'D');
    await otea('create', '--collection', 'tasks', '--title', 'Held', '--description', 'D');
    // Another agent did the step: an agent relays only decisions on work it did not do itself.
    await otea('handoff', 'TASKS-1', '--as', 'codex');
  });

  afterEach(() => repo.remove());

  it('moves the item as the human via the agent and prints it as a list row', async () => {
    const result = await otea('relay', 'TASKS-1', 'dropped', '--quote', QUOTE, '--reason', 'Gone');

    expect(result).toMatchObject({ code: 0, out: 'TASKS-1  Dropped  none  Old flow\n' });
    expect((await json('show', 'TASKS-1')).events.at(-1)).toMatchObject({
      type: 'transitioned',
      actor: { kind: 'human', name: 'human' },
      data: {
        from: 'todo__review',
        to: 'dropped',
        reason: 'Gone',
        channel: 'cli',
        via: 'claude',
        source: 'conversation',
        quote: QUOTE,
      },
    });
  });

  it('names the relaying agent with --as', async () => {
    await otea(
      'relay',
      'TASKS-1',
      'dropped',
      '--quote',
      QUOTE,
      '--reason',
      'Gone',
      '--as',
      'gemini',
    );

    expect((await json('show', 'TASKS-1')).events.at(-1).data.via).toBe('gemini');
  });

  it('shows the relay and the quote in the timeline of show', async () => {
    await otea('relay', 'TASKS-1', 'dropped', '--quote', QUOTE, '--reason', 'Gone');

    expect((await otea('show', 'TASKS-1')).out).toMatch(
      /human:human +transitioned {2}Hacerlo \(in review\) -> Dropped \(Gone\), relayed by claude: "Discard it, the old flow is gone"$/m,
    );
  });

  it('prints the moved item with --json', async () => {
    const item = await json('relay', 'TASKS-1', 'dropped', '--quote', QUOTE, '--reason', 'x');

    expect(item).toMatchObject({ id: 'TASKS-1', state: 'dropped', turn: 'none' });
  });

  it('requires --quote, with the usage', async () => {
    const { code, err } = await otea('relay', 'TASKS-1', 'dropped', '--reason', 'Gone');

    expect(code).toBe(2);
    expect(err).toContain('Missing --quote for "otea relay"');
    expect(err).toContain(USAGE);
  });

  it('refuses a blank quote with quote_required (exit 2)', async () => {
    const { code, err } = await otea('relay', 'TASKS-1', 'dropped', '--quote', ' ', '--json');

    expect(code).toBe(2);
    expect(JSON.parse(err).error.code).toBe('quote_required');
    expect((await json('show', 'TASKS-1')).state).toBe('todo__review');
  });

  it('requires --reason when the transition does (exit 2)', async () => {
    const { code, err } = await otea('relay', 'TASKS-1', 'dropped', '--quote', QUOTE);

    expect(code).toBe(2);
    expect(err).toContain('Not dropped TASKS-1: say why with --reason.');
  });

  it('refuses a human-ui transition with forbidden (exit 7), pointing to the web UI', async () => {
    const { code, err } = await otea('relay', 'TASKS-1', 'done', '--quote', 'Approved', '--json');

    expect(code).toBe(7);
    expect(JSON.parse(err).error).toEqual({
      code: 'forbidden',
      message:
        'Moving from "todo__review" to "done" requires human-ui authority (a human in the web UI) and cannot be relayed; the human must make it in the web UI',
    });
    expect((await json('show', 'TASKS-1')).state).toBe('todo__review');
  });

  it('refuses an agent transition with not_relayable (exit 4), pointing to otea move', async () => {
    const { code, err } = await otea('relay', 'TASKS-2', 'todo__review', '--quote', 'Go ahead');

    expect(code).toBe(4);
    expect(err).toContain('make it with "otea move"');
  });

  it('fails as usual for an invalid transition or an unknown item', async () => {
    expect((await otea('relay', 'TASKS-2', 'done', '--quote', 'Done')).code).toBe(4);
    expect((await otea('relay', 'TASKS-9', 'dropped', '--quote', 'x', '--reason', 'x')).code).toBe(
      3,
    );
  });

  it('is not blocked by a lease another agent holds, and releases it', async () => {
    await otea('claim', 'TASKS-2', '--as', 'codex');

    const result = await otea('relay', 'TASKS-2', 'dropped', '--quote', QUOTE, '--reason', 'x');

    expect(result.code).toBe(0);
    const item = await json('show', 'TASKS-2');
    expect(item.lease).toBeNull();
    expect(item.events.at(-1)).toMatchObject({
      type: 'released',
      actor: { kind: 'human', name: 'human' },
      data: { holder: 'codex', cause: 'handoff', via: 'claude' },
    });
  });
});

describe('relay of a decision on the agent’s own step', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    presetCollection(repo.dir, 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'Mine', '--description', 'D');
    await otea('handoff', 'TASKS-1');
  });

  afterEach(() => repo.remove());

  it('refuses it with forbidden (exit 7) and leaves the item in review', async () => {
    const { code, err } = await otea(
      'relay',
      'TASKS-1',
      'todo',
      '--quote',
      'dale',
      '--reason',
      'Redo',
      '--json',
    );

    expect(code).toBe(7);
    expect(JSON.parse(err).error).toEqual({
      code: 'forbidden',
      message:
        'Not relayed: claude did Hacerlo on TASKS-1 in this round, so it may not relay the decision on its own work; the person makes it in the web UI.',
    });
    expect((await json('show', 'TASKS-1')).state).toBe('todo__review');
  });

  it('refuses any human decision on it, a discard included', async () => {
    const { code } = await otea('relay', 'TASKS-1', 'dropped', '--quote', 'drop', '--reason', 'x');

    expect(code).toBe(7);
    expect((await json('show', 'TASKS-1')).state).toBe('todo__review');
  });

  it('lets another agent relay it', async () => {
    const relayed = ['relay', 'TASKS-1', 'todo', '--quote', 'redo', '--reason', 'Redo'];

    expect((await otea(...relayed, '--as', 'codex')).code).toBe(0);
    expect((await json('show', 'TASKS-1')).state).toBe('todo');
  });

  it('lets the agent relay again once a new round of the step is handed off by another', async () => {
    await otea('relay', 'TASKS-1', 'todo', '--quote', 'redo', '--reason', 'Redo', '--as', 'codex');
    await otea('handoff', 'TASKS-1', '--note', 'Redone', '--as', 'codex');

    const { code } = await otea('relay', 'TASKS-1', 'todo', '--quote', 'again', '--reason', 'R');

    expect(code).toBe(0);
  });
});

describe('move by an agent', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init');
    presetCollection(repo.dir, 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'T', '--description', 'D');
    await otea('handoff', 'TASKS-1');
  });

  afterEach(() => repo.remove());

  it.each([
    ['done', []],
    ['todo', ['--reason', 'Redo']],
  ])('refuses %s from the person’s review with forbidden', async (to, extra) => {
    const { code, err } = await otea('move', 'TASKS-1', to, ...extra);

    expect(code).toBe(7);
    // On a board, the step engine says whose review it is.
    expect(err).toContain('Not your turn: the person reviews Hacerlo on TASKS-1');
  });
  it('refuses dropped as otea drop does: only the person drops items here', async () => {
    const { code, err } = await otea('move', 'TASKS-1', 'dropped', '--reason', 'Drop');

    expect(code).toBe(7);
    expect(err).toContain('Not dropped TASKS-1: only the person drops items here.');
  });
});
