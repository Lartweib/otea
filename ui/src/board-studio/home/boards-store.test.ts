import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardOfCollection, boardsState, loadBoards, resetBoards } from './boards-store.ts';

// The boards are read once per version of the project, whoever asks; a first failure says why.

const summary = (name: string, collection: string | null) =>
  ({ id: `b${name}`, name, collection }) as never;

function respond(...answers: Array<() => Response>) {
  const fetch = vi.fn(async () => {
    const next = answers.shift();
    if (!next) throw new Error('no more answers');
    return next();
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const ok = (boards: unknown[]) => () => new Response(JSON.stringify({ boards }), { status: 200 });
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  resetBoards();
  vi.unstubAllGlobals();
});

describe('the boards store', () => {
  it('reads the boards once for each version of the project', async () => {
    const fetch = respond(ok([summary('Recursos', 'Recursos')]), ok([]));
    loadBoards(1);
    loadBoards(1);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    loadBoards(2);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(boardsState()).toMatchObject({ status: 'ready', boards: [] });
  });

  it('reads them again when asked, even for the same version', async () => {
    const fetch = respond(ok([]), ok([]));
    loadBoards(1);
    await flush();
    loadBoards(1, true);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('tries again after a failure', async () => {
    const fetch = respond(
      () => new Response(JSON.stringify({ error: { message: 'down' } }), { status: 500 }),
      ok([]),
    );
    loadBoards(1);
    await flush();
    expect(boardsState()).toEqual({ status: 'failed', message: 'down' });
    loadBoards(1);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(boardsState()).toMatchObject({ status: 'ready' });
  });

  it('finds the board a collection is the published form of', () => {
    const boards = [summary('Recursos', 'Recursos'), summary('Notas', null)];
    expect(boardOfCollection(boards, 'Recursos')).toMatchObject({ name: 'Recursos' });
    expect(boardOfCollection(boards, 'Notas')).toBeUndefined();
  });
});
