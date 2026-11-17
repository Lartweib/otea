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
    expect((await person('topic', 'on')).code).toBe(0);

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
});
