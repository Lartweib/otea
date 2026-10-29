import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

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
    await otea('collection', 'add', 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'Old flow', '--description', 'D');
    await otea('create', '--collection', 'tasks', '--title', 'Held', '--description', 'D');
    await otea('move', 'TASKS-1', 'in_progress');
    await otea('move', 'TASKS-1', 'review');
  });

  afterEach(() => repo.remove());

  it('moves the item as the human via the agent and prints it as a list row', async () => {
    const result = await otea(
      'relay',
      'TASKS-1',
      'discarded',
      '--quote',
      QUOTE,
      '--reason',
      'Gone',
    );

    expect(result).toMatchObject({ code: 0, out: 'TASKS-1  discarded  none  Old flow\n' });
    expect((await json('show', 'TASKS-1')).events.at(-1)).toMatchObject({
      type: 'transitioned',
      actor: { kind: 'human', name: 'human' },
      data: {
        from: 'review',
        to: 'discarded',
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
      'discarded',
      '--quote',
      QUOTE,
      '--reason',
      'Gone',
      '--as',
      'codex',
    );

    expect((await json('show', 'TASKS-1')).events.at(-1).data.via).toBe('codex');
  });

  it('shows the relay and the quote in the timeline of show', async () => {
    await otea('relay', 'TASKS-1', 'discarded', '--quote', QUOTE, '--reason', 'Gone');

    expect((await otea('show', 'TASKS-1')).out).toMatch(
      /human:human +transitioned {2}review -> discarded \(Gone\), relayed by claude: "Discard it, the old flow is gone"$/m,
    );
  });

  it('prints the moved item with --json', async () => {
    const item = await json('relay', 'TASKS-1', 'discarded', '--quote', QUOTE, '--reason', 'x');

    expect(item).toMatchObject({ id: 'TASKS-1', state: 'discarded', turn: 'none' });
  });

  it('requires --quote, with the usage', async () => {
    const { code, err } = await otea('relay', 'TASKS-1', 'discarded', '--reason', 'Gone');

    expect(code).toBe(2);
    expect(err).toContain('Missing --quote for "otea relay"');
    expect(err).toContain(USAGE);
  });

  it('refuses a blank quote with quote_required (exit 2)', async () => {
    const { code, err } = await otea('relay', 'TASKS-1', 'discarded', '--quote', ' ', '--json');

    expect(code).toBe(2);
    expect(JSON.parse(err).error.code).toBe('quote_required');
    expect((await json('show', 'TASKS-1')).state).toBe('review');
  });

  it('requires --reason when the transition does (exit 2)', async () => {
    const { code, err } = await otea('relay', 'TASKS-1', 'discarded', '--quote', QUOTE);

    expect(code).toBe(2);
    expect(err).toContain('Moving from "review" to "discarded" requires a reason');
  });

  it('refuses a human-ui transition with forbidden (exit 7), pointing to the web UI', async () => {
    const { code, err } = await otea('relay', 'TASKS-1', 'done', '--quote', 'Approved', '--json');

    expect(code).toBe(7);
    expect(JSON.parse(err).error).toEqual({
      code: 'forbidden',
      message:
        'Moving from "review" to "done" requires human-ui authority (a human in the web UI) and cannot be relayed; the human must make it in the web UI',
    });
    expect((await json('show', 'TASKS-1')).state).toBe('review');
  });

  it('refuses an agent transition with not_relayable (exit 4), pointing to otea move', async () => {
    const { code, err } = await otea('relay', 'TASKS-2', 'in_progress', '--quote', 'Go ahead');

    expect(code).toBe(4);
    expect(err).toContain('make it with "otea move"');
  });

  it('fails as usual for an invalid transition or an unknown item', async () => {
    expect((await otea('relay', 'TASKS-2', 'done', '--quote', 'Done')).code).toBe(4);
    expect(
      (await otea('relay', 'TASKS-9', 'discarded', '--quote', 'x', '--reason', 'x')).code,
    ).toBe(3);
  });

  it('is not blocked by a lease another agent holds, and releases it', async () => {
    await otea('claim', 'TASKS-2', '--as', 'codex');

    const result = await otea('relay', 'TASKS-2', 'discarded', '--quote', QUOTE, '--reason', 'x');

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

describe('move by an agent', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init');
    await otea('collection', 'add', 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'T', '--description', 'D');
    await otea('move', 'TASKS-1', 'in_progress');
    await otea('move', 'TASKS-1', 'review');
  });

  afterEach(() => repo.remove());

  it.each([
    ['done', [], 'human-ui'],
    ['todo', ['--reason', 'Redo'], 'human-ui'],
    ['discarded', ['--reason', 'Drop'], 'human'],
  ])('refuses %s from review (%s authority) with forbidden', async (to, extra, by) => {
    const { code, err } = await otea('move', 'TASKS-1', to, ...extra);

    expect(code).toBe(7);
    expect(err).toContain(`requires ${by} authority`);
  });
});
