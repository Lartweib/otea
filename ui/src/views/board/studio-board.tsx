import { useEffect, useState } from 'react';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { useApp } from '../../app/context.tsx';
import { fetchBoard } from '../../board-studio/api.ts';
import { boardOfCollection, boardsOf, useBoards } from '../../board-studio/home/boards-store.ts';
import { doesText } from '../../board-studio/words.ts';
import { t, tx } from '../../i18n/i18n.ts';
import { Button } from '../../kit/Button.tsx';
import { Icon } from '../../kit/Icon.tsx';
import { studioHash } from '../../selection.ts';

// A published board, as Studio shapes it (the mock's boardHtml): its live version's About for the
// dek, «Crear · Ítem» and «Editar tablero», and the empty state that teaches where a new item
// lands. A collection Studio does not shape yet (never migrated) keeps today's head.

export type StudioBoard = {
  id: string;
  version: number;
  changed: boolean;
  live: BoardDefinition;
};

// The live definition is read from the board's record: the home's summary carries the draft.
export function useStudioBoard(collection: string): StudioBoard | null {
  const app = useApp();
  const summary = boardOfCollection(boardsOf(useBoards(app.version)), collection);
  const [board, setBoard] = useState<StudioBoard | null>(null);
  const id = summary?.id;
  const status = summary?.status;
  const version = summary?.liveVersion;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again when the board changes
  useEffect(() => {
    if (!id) {
      setBoard(null);
      return;
    }
    const controller = new AbortController();
    fetchBoard(id, controller.signal).then(
      ({ record }) => {
        if (!record.live) return setBoard(null);
        setBoard({
          id,
          version: record.live.version,
          changed: record.draft !== null,
          live: record.live.definition,
        });
      },
      // The head keeps what it had: the board's lanes still work without it.
      () => undefined,
    );
    return () => controller.abort();
  }, [id, status, version]);
  return board && board.id === id ? board : null;
}

export function BoardActs({ studio, canWrite }: { studio: StudioBoard; canWrite: boolean }) {
  const app = useApp();
  const collection = app.route.view === 'board' ? app.route.board : '';
  return (
    <div className="bv-acts" data-enter="fade">
      {canWrite ? (
        <Button variant="primary" onClick={() => app.newItem({ board: collection })}>
          <Icon name="plus" />
          {t('bs.board.create', { item: studio.live.item })}
        </Button>
      ) : null}
      {app.session.canConfigure ? (
        <Button
          variant="quiet"
          onClick={() => {
            window.location.hash = studioHash({ kind: 'board', board: studio.id });
          }}
        >
          {t('bs.home.editBoard')}
        </Button>
      ) : null}
      {studio.changed && app.session.canConfigure ? (
        <span className="tag you">{t('bs.board.changes')}</span>
      ) : null}
    </div>
  );
}

// «Todavía no hay ítems en X. Con Crear · Ítem empieza uno en Paso, donde …».
export function Teach({ board, studio }: { board: string; studio: StudioBoard }) {
  const first = studio.live.steps[0];
  return (
    <p className="teach">
      {tx('bs.board.teach', {
        board,
        create: <b>{t('bs.board.create', { item: studio.live.item })}</b>,
        step: <b>{first?.name ?? '—'}</b>,
        does: doesText(first?.doer ?? 'any'),
      })}
    </p>
  );
}
