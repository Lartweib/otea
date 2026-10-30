import { execFileSync } from 'node:child_process';
import { readFileSync, truncateSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_EVIDENCE_BYTES } from '../core/evidence.ts';
import { EVIDENCE_YAML } from '../core/testing.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

describe('attach', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);
  const errorCode = (err: string) => JSON.parse(err).error.code;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    await otea('collection', 'add', 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'Crash', '--description', 'On save');
    repo.write('shots/before.png', 'png-before');
    repo.write('test.log', 'PASS 12 tests\n');
  });

  afterEach(() => repo.remove());

  it('attaches a file given relative to the working directory and prints the entry', async () => {
    const { code, out } = await otea(
      'attach',
      'TASKS-1',
      'shots/before.png',
      '--role',
      'before',
      '--caption',
      'Blank page after save',
    );

    expect(code).toBe(0);
    expect(out).toBe('#1  before  image  before.png  10 B  Blank page after save\n');
  });

  it('prints the entry with --json', async () => {
    expect(await json('attach', 'TASKS-1', 'test.log')).toMatchObject({
      id: 1,
      itemId: 'TASKS-1',
      role: 'single',
      kind: 'log',
      filename: 'test.log',
      contentType: 'text/plain',
      size: 14,
      caption: null,
      actor: { kind: 'agent', name: 'claude' },
      channel: 'cli',
    });
  });

  it('accepts an absolute path', async () => {
    expect((await json('attach', 'TASKS-1', join(repo.dir, 'test.log'))).kind).toBe('log');
  });

  it('resolves a relative path against the working directory, not the project root', async () => {
    const inShots = cliAt(join(repo.dir, 'shots'), { OTEA_AGENT: 'claude' });

    expect((await inShots('attach', 'TASKS-1', 'before.png')).code).toBe(0);
  });

  it('stores the copy under .otea/evidence, which git ignores', async () => {
    const { sha256 } = await json('attach', 'TASKS-1', 'test.log');
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: repo.dir,
      encoding: 'utf8',
    });

    expect(readFileSync(join(repo.dir, '.otea', 'evidence', sha256), 'utf8')).toBe(
      'PASS 12 tests\n',
    );
    expect(status).not.toContain('.otea');
    expect(status).toContain('test.log');
  });

  it('lists the evidence in show, above the events that record it', async () => {
    await otea('attach', 'TASKS-1', 'shots/before.png', '--role', 'before', '--caption', 'Blank');
    await otea('attach', 'TASKS-1', 'test.log');

    const { out } = await otea('show', 'TASKS-1');

    expect(out).toContain(
      'Evidence:\n  #1  before  image  before.png  10 B  Blank\n  #2  single  log    test.log    14 B\n\nEvents:',
    );
    expect(out).toMatch(
      /agent:claude {2}evidence_added {2}#1 before image before\.png \("Blank"\)/,
    );
    expect((await json('show', 'TASKS-1')).evidence).toHaveLength(2);
  });

  it('leaves show without an evidence section when there is none', async () => {
    expect((await otea('show', 'TASKS-1')).out).not.toContain('Evidence:');
    expect((await json('show', 'TASKS-1')).evidence).toEqual([]);
  });

  it('records the attachment in the event log', async () => {
    await otea('attach', 'TASKS-1', 'test.log');

    expect((await otea('events', '--since', '1')).out).toMatch(
      /^2 {2}TASKS-1 {2}\S+ {2}agent:claude {2}evidence_added {2}#1 single log test\.log\n$/,
    );
    expect((await json('events', '--since', '1')).type).toBe('evidence_added');
  });

  describe('refusals', () => {
    it('refuses an unknown role as a usage error (exit 2)', async () => {
      const { code, err } = await otea('attach', 'TASKS-1', 'test.log', '--role', 'during');

      expect(code).toBe(2);
      expect(err).toContain('--role must be one of before, after, single');
    });

    it('refuses a missing file with file_not_found (exit 3)', async () => {
      const { code, err } = await otea('attach', 'TASKS-1', 'nope.png', '--json');

      expect(code).toBe(3);
      expect(errorCode(err)).toBe('file_not_found');
    });

    it('refuses a file over the size limit with evidence_too_large (exit 14)', async () => {
      repo.write('huge.mp4', '');
      truncateSync(join(repo.dir, 'huge.mp4'), MAX_EVIDENCE_BYTES + 1);

      const { code, err } = await otea('attach', 'TASKS-1', 'huge.mp4', '--json');

      expect(code).toBe(14);
      expect(errorCode(err)).toBe('evidence_too_large');
    });

    it('refuses an item another agent holds with lease_held (exit 12)', async () => {
      await otea('claim', 'TASKS-1', '--as', 'codex');

      const { code, err } = await otea('attach', 'TASKS-1', 'test.log', '--json');

      expect(code).toBe(12);
      expect(errorCode(err)).toBe('lease_held');
    });

    it('refuses a closed item with item_closed (exit 4)', async () => {
      await otea('create', '--collection', 'tasks', '--title', 'Vague');
      await otea('move', 'TASKS-2', 'discarded', '--reason', 'Too vague');

      const { code, err } = await otea('attach', 'TASKS-2', 'test.log', '--json');

      expect(code).toBe(4);
      expect(errorCode(err)).toBe('item_closed');
    });
  });
});

describe('attach to a type that places evidence modules', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const failure = async (...argv: string[]) => {
    const { code, err } = await otea(...argv, '--json');
    return { exit: code, ...JSON.parse(err).error };
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    repo.write('.otea/presets/proof/preset.yaml', EVIDENCE_YAML);
    await otea('collection', 'add', 'proof', '--preset', 'proof');
    await otea('create', '--collection', 'proof', '--type', 'bug', '--title', 'Crash');
    await otea('create', '--collection', 'proof', '--type', 'impr', '--title', 'Faster');
    repo.write('before.png', 'png-before');
    repo.write('home.png', 'png-home');
    repo.write('run.log', 'PASS\n');
    repo.write('notes.zip', 'zip');
  });

  afterEach(() => repo.remove());

  it('prints the module the file went to', async () => {
    const { out } = await otea('attach', 'PROOF-1', 'before.png', '--role', 'before');

    expect(out).toBe('#1  images  before  image  before.png  10 B\n');
  });

  it('places a file in the module named by --module', async () => {
    const { out } = await otea('attach', 'PROOF-2', 'home.png', '--module', 'mockup');

    expect(out).toBe('#1  mockup  single  image  home.png  8 B\n');
  });

  it('refuses a kind no module takes with evidence_not_accepted (exit 15)', async () => {
    expect(await failure('attach', 'PROOF-1', 'notes.zip')).toEqual({
      exit: 15,
      code: 'evidence_not_accepted',
      message:
        'PROOF-1 (bug) does not take notes.zip. It takes: "images" (images, compare): png, gif; "log" (log): log',
    });
  });

  it('asks for --module when two modules take the file (exit 2)', async () => {
    const { exit, code, message } = await failure('attach', 'PROOF-2', 'home.png');

    expect([exit, code]).toEqual([2, 'module_required']);
    expect(message).toBe(
      'home.png fits more than one evidence module of PROOF-2 (impr): pass --module screens or --module mockup',
    );
  });

  it('refuses a compare without --role before or after (exit 2)', async () => {
    const { exit, code, message } = await failure('attach', 'PROOF-1', 'before.png');

    expect([exit, code]).toEqual([2, 'invalid_role']);
    expect(message).toContain('pass --role before or --role after');
  });

  it('groups evidence by module in show, with what is still empty', async () => {
    await otea('attach', 'PROOF-1', 'before.png', '--role', 'before', '--caption', 'Blank');
    await otea('attach', 'PROOF-2', 'home.png', '--module', 'mockup');

    expect((await otea('show', 'PROOF-1')).out).toContain(
      [
        'Evidence:',
        '  images (images, compare)',
        '    #1  before  image  before.png  10 B  Blank',
        '  log (log, required)',
        '    nothing yet',
        '',
        'Events:',
      ].join('\n'),
    );
    expect((await otea('show', 'PROOF-2')).out).toContain(
      '  mockup (images)\n    #2  single  image  home.png  8 B\n',
    );
  });
});
