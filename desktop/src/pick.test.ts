import { describe, expect, it } from 'vitest';
import { type Answer, type Probe, pickProject, type Question } from './pick.ts';

type Script = {
  probe: Probe;
  answer?: Answer;
  // What `otea init` does in the folder: made, or refused because a project above covers it.
  init?: (here: boolean) => 'ok' | { covering: string; root: string };
};

function run(script: Script, dir: string, create: boolean) {
  const asked: Question[] = [];
  const inits: { dir: string; here: boolean }[] = [];
  const result = pickProject(
    {
      probe: async () => script.probe,
      init: async (at, here) => {
        inits.push({ dir: at, here });
        const done = script.init?.(here) ?? 'ok';
        if (done !== 'ok') {
          throw Object.assign(new Error('The Otea project at … already covers …'), {
            code: 'already_exists',
            details: { kind: 'covered', ...done },
          });
        }
      },
      ask: async (question) => {
        asked.push(question);
        return script.answer ?? 'cancel';
      },
    },
    dir,
    create,
  );
  return { result, asked, inits };
}

describe('Abrir carpeta', () => {
  it('opens a folder that is in a project, asking nothing', async () => {
    const { result, asked, inits } = run({ probe: { kind: 'project' } }, '/repo/sub', false);
    expect(await result).toEqual({ kind: 'open', dir: '/repo/sub' });
    expect(asked).toEqual([]);
    expect(inits).toEqual([]);
  });

  it('asks about the repository root, where the project will be, and opens it there', async () => {
    const { result, asked, inits } = run(
      { probe: { kind: 'none', root: '/repo' }, answer: 'create' },
      '/repo/sub',
      false,
    );
    expect(await result).toEqual({ kind: 'open', dir: '/repo' });
    expect(asked).toEqual([{ kind: 'create', dir: '/repo/sub', root: '/repo' }]);
    expect(inits).toEqual([{ dir: '/repo/sub', here: false }]);
  });

  it('creates nothing when the person cancels', async () => {
    const { result, inits } = run(
      { probe: { kind: 'none', root: '/repo' }, answer: 'cancel' },
      '/repo',
      false,
    );
    expect(await result).toEqual({ kind: 'cancel' });
    expect(inits).toEqual([]);
  });
});

describe('Crear proyecto', () => {
  it('creates the project in a folder that is its own root without asking', async () => {
    const { result, asked } = run({ probe: { kind: 'none', root: '/repo' } }, '/repo', true);
    expect(await result).toEqual({ kind: 'open', dir: '/repo' });
    expect(asked).toEqual([]);
  });

  it('says first when the project will be made at the repository root', async () => {
    const { result, asked } = run(
      { probe: { kind: 'none', root: '/repo' }, answer: 'create' },
      '/repo/sub',
      true,
    );
    expect(await result).toEqual({ kind: 'open', dir: '/repo' });
    expect(asked).toEqual([{ kind: 'create', dir: '/repo/sub', root: '/repo' }]);
  });

  it('on a repo a project above covers, asks, and makes a separate project there', async () => {
    const { result, asked, inits } = run(
      {
        probe: { kind: 'project' },
        answer: 'create',
        init: (here) => (here ? 'ok' : { covering: '/product', root: '/product/api' }),
      },
      '/product/api',
      true,
    );
    expect(await result).toEqual({ kind: 'open', dir: '/product/api' });
    expect(asked).toEqual([{ kind: 'covered', root: '/product/api', covering: '/product' }]);
    expect(inits).toEqual([
      { dir: '/product/api', here: false },
      { dir: '/product/api', here: true },
    ]);
  });

  it('or opens the project that covers it', async () => {
    const { result } = run(
      {
        probe: { kind: 'project' },
        answer: 'open',
        init: () => ({ covering: '/product', root: '/product/api' }),
      },
      '/product/api',
      true,
    );
    expect(await result).toEqual({ kind: 'open', dir: '/product' });
  });

  // In a plain folder of a repository whose project sits at the repository's root, otea init made
  // nothing and reused the root's project, so the app opened the parent without a word.
  it('asks in a folder inside a project, before init reuses the project above', async () => {
    const { result, asked, inits } = run(
      { probe: { kind: 'project', root: '/repo' }, answer: 'create' },
      '/repo/docs',
      true,
    );
    expect(await result).toEqual({ kind: 'open', dir: '/repo/docs' });
    expect(asked).toEqual([{ kind: 'covered', root: '/repo/docs', covering: '/repo' }]);
    expect(inits).toEqual([{ dir: '/repo/docs', here: true }]);
  });

  it('or opens the project above, making nothing', async () => {
    const { result, inits } = run(
      { probe: { kind: 'project', root: '/repo' }, answer: 'open' },
      '/repo/docs',
      true,
    );
    expect(await result).toEqual({ kind: 'open', dir: '/repo' });
    expect(inits).toEqual([]);
  });

  it('passes any other failure on', async () => {
    const { result } = run(
      {
        probe: { kind: 'project' },
        init: () => {
          throw new Error('disk full');
        },
      },
      '/repo',
      true,
    );
    await expect(result).rejects.toThrow('disk full');
  });
});
