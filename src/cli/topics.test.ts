import { describe, expect, it } from 'vitest';
import { cliAt, seedOnce, startCli, until } from './testing.ts';

// otea topic: side topics the person asked an agent about, kept as short conversations. The agent
// records the question and its answer (a summary and the full text); the person keeps one going,
// closes it or turns it into a task. Off until the person turns them on.
describe('otea topic', () => {
  const { fresh } = seedOnce(async (_otea, dir) => {
    await cliAt(dir)('board', 'add', 'Cambios', '--template', 'changes');
  });

  it('refuses topics while they are off, and says how to turn them on', async () => {
    const { otea } = fresh();
    const added = await otea('topic', 'add', '¿Por qué falla el build?');
    expect(added.code).not.toBe(0);
    expect(added.err).toContain('otea topic on');
  });

  it('records a question and its answer, and lists what waits', async () => {
    const { repo, otea } = fresh();
    const person = cliAt(repo.dir);
    const on = await person('topic', 'on');
    expect(on.code).toBe(0);
    // Harness-agnostic: no advice to install a Claude Code hook.
    expect(on.out.trim()).toBe('Topics are on: agents record the side questions you ask them.');

    const added = await otea(
      'topic',
      'add',
      '¿Por qué falla el build en Windows?',
      '--session',
      'abc',
    );
    expect(added.code).toBe(0);
    expect(added.out).toContain('TEM-1');

    const answered = await otea(
      'topic',
      'answer',
      'TEM-1',
      '--summary',
      'Falta una variable de entorno.',
      '--full',
      'La respuesta completa…',
    );
    expect(answered.code).toBe(0);

    const listed = await person('topic', 'list', '--json');
    const [topic] = JSON.parse(listed.out) as { id: string; state: string; turns: unknown[] }[];
    expect(topic).toMatchObject({ id: 'TEM-1', state: 'answered' });
    expect(topic?.turns).toHaveLength(2);

    const shown = await person('topic', 'show', 'TEM-1');
    expect(shown.out).toContain('Falta una variable de entorno.');
    expect(shown.out).toContain('La respuesta completa…');
  });

  it('lets only the person close a topic or keep it going', async () => {
    const { repo, otea } = fresh();
    const person = cliAt(repo.dir);
    await person('topic', 'on');
    await otea('topic', 'add', 'q');
    await otea('topic', 'answer', 'TEM-1', '--summary', 's');

    expect((await otea('topic', 'close', 'TEM-1')).code).not.toBe(0);
    expect((await person('topic', 'note', 'TEM-1', '¿Y en Linux?')).code).toBe(0);
    expect((await person('topic', 'close', 'TEM-1')).code).toBe(0);
  });

  it('wakes a waiting agent with a note the person left on its topic', async () => {
    const { repo, otea } = fresh();
    const person = cliAt(repo.dir);
    await person('topic', 'on');
    await otea('topic', 'add', 'q');
    await otea('topic', 'answer', 'TEM-1', '--summary', 's');

    const waiting = startCli(
      repo.dir,
      'wait',
      '--turn',
      'agent',
      '--unclaimed',
      '--timeout',
      '20s',
    );
    await person('topic', 'note', 'TEM-1', '¿Y en Linux?');
    await until(() => waiting.out().includes('TEM-1'), 10_000);
    expect(waiting.out()).toContain('¿Y en Linux?');
    await waiting.stop();
  });

  it('links a task an agent makes from a topic', async () => {
    const { repo, otea } = fresh();
    const person = cliAt(repo.dir);
    await person('topic', 'on');
    await otea('topic', 'add', 'q');
    const made = await otea(
      'create',
      '--collection',
      'Cambios',
      '--title',
      'Arreglar el build',
      '--field',
      'Qué quiero=Que pase en Windows',
      '--from',
      'TEM-1',
    );
    expect(made.code).toBe(0);

    const topic = JSON.parse((await person('topic', 'show', 'TEM-1', '--json')).out) as {
      links: string[];
    };
    expect(topic.links).toEqual(['CAM-1']);
  });

  it('tells agents to record topics only while they are on', async () => {
    const { repo, otea } = fresh();
    expect((await otea('board')).out).not.toContain('otea topic add');
    await cliAt(repo.dir)('topic', 'on');
    expect((await otea('board')).out).toContain('otea topic add');
  });

  it('names in otea next the topics waiting for the agent, and the topics rule while they are on', async () => {
    const { repo, otea } = fresh();
    const person = cliAt(repo.dir);
    await otea(
      'profile',
      '--model',
      'claude-opus-5-5',
      '--effort',
      'high',
      '--harness',
      'claude-code',
    );
    const before = await otea('next');
    expect(before.err).toBe('');
    expect(before.out).not.toContain('otea topic');

    // Turned on mid-session: the agent never read rule 13 in its guide.
    await person('topic', 'on');
    expect((await otea('next')).out).toContain('otea topic add');

    await otea('topic', 'add', 'q');
    await otea('topic', 'answer', 'TEM-1', '--summary', 's');
    await person('topic', 'note', 'TEM-1', '¿Y en Linux?');
    const next = (await otea('next')).out;
    expect(next).toContain('TEM-1');
    expect(next).toContain('otea topic answer TEM-1');
    // What the person wrote, so the agent answers it without a wait to show it.
    expect(next).toContain('"¿Y en Linux?"');
  });

  it('wakes a waiting agent once the person turns topics on, with the topics rule', async () => {
    const { repo } = fresh();
    const person = cliAt(repo.dir);
    const waiting = startCli(
      repo.dir,
      'wait',
      '--turn',
      'agent',
      '--unclaimed',
      '--timeout',
      '20s',
    );
    await person('topic', 'on');
    await until(() => waiting.out().includes('otea topic add'), 10_000);
    expect(waiting.out()).toContain('turned topics on');
    await waiting.stop();
  });

  it('refuses --from for a topic that does not exist', async () => {
    const { repo, otea } = fresh();
    await cliAt(repo.dir)('topic', 'on');
    const made = await otea(
      'create',
      '--collection',
      'Cambios',
      '--title',
      't',
      '--field',
      'Qué quiero=x',
      '--from',
      'TEM-9',
    );
    expect(made.code).not.toBe(0);
  });

  it('searches every topic, closed ones too, and gives each its answer', async () => {
    const { repo, otea } = fresh();
    const person = cliAt(repo.dir);
    await person('topic', 'on');
    await otea('topic', 'add', '¿Qué licencia uso, MIT o Apache?');
    await otea('topic', 'answer', 'TEM-1', '--summary', 'MIT, por simple.', '--full', 'MIT.');
    await person('topic', 'close', 'TEM-1');
    await otea('topic', 'add', '¿Por qué 0.1 + 0.2 no da 0.3?');

    const found = await person('topic', 'list', '--search', 'licencia');
    expect(found.code).toBe(0);
    expect(found.out).toContain('TEM-1');
    expect(found.out).toContain('MIT, por simple.');
    expect(found.out).not.toContain('TEM-2');

    const none = await person('topic', 'list', '--search', 'kubernetes');
    expect(none.out.trim()).toBe('No topic mentions "kubernetes".');
  });

  it('explains its commands with otea topic --help', async () => {
    const { repo } = fresh();
    const help = await cliAt(repo.dir)('topic', '--help');
    expect(help.code).toBe(0);
    for (const command of ['add', 'answer', 'list', 'show', 'note', 'close', 'on', 'off'])
      expect(help.out).toContain(`otea topic ${command}`);
    expect((await cliAt(repo.dir)('help', 'topic')).out).toBe(help.out);
  });

  it('tells agents to record a side question before answering it, and to look in the topics for the past', async () => {
    const { repo, otea } = fresh();
    await cliAt(repo.dir)('topic', 'on');
    const guide = (await otea('board')).out;
    expect(guide).toContain('Before you answer it, record it');
    expect(guide).toContain('A request to do work is never a topic');
    expect(guide).toContain('otea topic list --search');
  });

  it('reminds an agent that otea wait wakes to record side questions while topics are on', async () => {
    const { repo, otea } = fresh();
    await otea(
      'create',
      '--collection',
      'Cambios',
      '--title',
      'Arreglar el build',
      '--field',
      'Qué quiero=x',
    );
    const before = await otea('wait', '--turn', 'agent', '--timeout', '5s');
    expect(before.out).not.toContain('otea topic add');

    await cliAt(repo.dir)('topic', 'on');
    const woken = await otea('wait', '--turn', 'agent', '--timeout', '5s');
    expect(woken.code).toBe(0);
    expect(woken.out).toContain('otea topic add');
  });
});
