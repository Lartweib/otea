import { useEffect, useState } from 'react';
import { useApp } from '../../app/context.tsx';
import { t, tx } from '../../i18n/i18n.ts';
import { Button } from '../../kit/Button.tsx';
import { Count } from '../../kit/Count.tsx';
import { toast } from '../../kit/pop/toast.tsx';
import { hashFor } from '../../selection.ts';
import { type ArchivedBoard, fetchArchivedBoards, unarchiveBoard } from '../api.ts';
import { archivedMatches, openDelete } from './archive.ts';
import { loadBoards } from './boards-store.ts';

// Studio's Archivados: the boards put away, each with its items to open (read-only) and search, and
// Restaurar and Eliminar… for the person. Shown only once a board is archived. A board archived
// with the board that divides into it is restored and deleted with that one.

type State =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; boards: ArchivedBoard[] };

function useArchived(version: number): State {
  const [state, setState] = useState<State>({ status: 'loading' });
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version of the project reads them again
  useEffect(() => {
    const ctl = new AbortController();
    fetchArchivedBoards(ctl.signal).then(
      (boards) => setState({ status: 'ready', boards }),
      (error: unknown) => {
        if (ctl.signal.aborted) return;
        setState({
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => ctl.abort();
  }, [version]);
  return state;
}

const dayOf = (iso: string) => iso.slice(0, 10);

export function Archived({ canWrite }: { canWrite: boolean }) {
  const app = useApp();
  const state = useArchived(app.version);
  const [query, setQuery] = useState('');
  if (state.status === 'loading') return null;
  if (state.status === 'failed')
    return (
      <p className="sh-note" data-e="in" role="alert">
        {t('bs.archived.failed', { reason: state.message })}
      </p>
    );
  if (!state.boards.length) return null;
  const names = new Map(state.boards.map((b) => [b.id, b.name]));
  const found = archivedMatches(state.boards, query);

  const restore = (board: ArchivedBoard) => {
    unarchiveBoard(board.id).then(
      () => {
        loadBoards(app.version, true);
        app.studioChanged();
        toast({ msg: tx('bs.archive.restored', { board: <b>{board.name}</b> }) });
      },
      (e: unknown) => toast({ msg: e instanceof Error ? e.message : String(e) }),
    );
  };

  return (
    <section className="sh-archived" aria-label={t('bs.archived.title')}>
      <div className="sec spaced" id="sh-archived">
        <h2 data-e="in">{t('bs.archived.title')}</h2>
        <Count value={state.boards.length} />
        <span className="gloss">{t('bs.archived.gloss')}</span>
        <span className="rl" data-e="line" />
      </div>
      <div className="sh-arch-search" data-e="in">
        <label className="flab" htmlFor="sh-arch-q">
          {t('bs.archived.search')}
        </label>
        <input
          id="sh-arch-q"
          className="tx"
          type="search"
          value={query}
          autoComplete="off"
          placeholder={t('bs.archived.placeholder')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="brows">
        {found.length === 0 ? (
          <p className="sh-note" data-e="in">
            {t('bs.archived.nothing', { query: query.trim() })}
          </p>
        ) : (
          found.map(({ board, entries }) => (
            <div className="brow still sh-arow" data-e="in" key={board.id}>
              <div>
                <div className="bname">
                  <span>{board.name}</span>
                  <span className="tag line">{t('bs.home.eachItem', { item: board.item })}</span>
                </div>
                <div className="bmeta">
                  <span className="bpart">
                    {t('bs.archived.when', { date: dayOf(board.archivedAt) })}
                  </span>
                  <span className="bpart">· {t('bs.archived.items', { count: board.items })}</span>
                  {board.open ? (
                    <span className="bpart">· {t('bs.archived.open', { count: board.open })}</span>
                  ) : null}
                  {board.parent ? (
                    <span className="bpart">
                      · {t('bs.archived.with', { board: names.get(board.parent) ?? '' })}
                    </span>
                  ) : null}
                </div>
                {entries.length ? (
                  <ul className="sh-arch-items">
                    {entries.map((entry) => (
                      <li key={entry.id} className={entry.closed ? 'closed' : undefined}>
                        <a href={hashFor(entry.id)}>
                          <span className="aid">{entry.id}</span>
                          <span className="att">{entry.title}</span>
                        </a>
                        <span className="ast">
                          {entry.closed === 'done'
                            ? t('node.done')
                            : entry.closed === 'dropped'
                              ? t('node.discarded')
                              : entry.stateName}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="bdesc">{t('bs.archived.empty')}</div>
                )}
              </div>
              <div className="bacts">
                {canWrite && !board.parent ? (
                  <>
                    <Button variant="text" size="sm" onClick={() => openDelete(board.id)}>
                      {t('bs.archived.delete')}
                    </Button>
                    <Button variant="quiet" size="sm" onClick={() => restore(board)}>
                      {t('bs.archived.restore')}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
