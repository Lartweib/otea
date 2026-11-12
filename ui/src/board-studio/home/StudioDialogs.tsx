import { useEffect, useRef } from 'react';
import { useApp } from '../../app/context.tsx';
import { t, tx } from '../../i18n/i18n.ts';
import { toast } from '../../kit/pop/toast.tsx';
import { studioHash } from '../../selection.ts';
import type { BoardSummary } from '../api.ts';
import { AgentDraftDialog } from './AgentDraftDialog.tsx';
import { boardsOf, useBoards } from './boards-store.ts';
import { arrivedDrafts } from './home-model.ts';
import { NewBoardDialog } from './NewBoardDialog.tsx';
import {
  closeStudioDialog,
  drafterOf,
  rememberDrafter,
  useStudioDialog,
} from './studio-dialogs.ts';

// Studio's creation dialogs, rendered once for the whole app, and what Studio watches on the
// change feed wherever you are: a draft an agent delivered (a toast offers Abrirlo), and a board
// published since the boards were last read (the rail reads its boards again).
export function StudioDialogs() {
  const app = useApp();
  const open = useStudioDialog();
  const last = useRef(open);
  if (open) last.current = open;
  const shown = last.current;
  const state = useBoards(app.version);
  const boards = state.status === 'ready' ? state.boards : null;
  const before = useRef<BoardSummary[] | null>(null);
  const { collections, studioChanged } = app;

  useEffect(() => {
    if (!boards) return;
    for (const board of arrivedDrafts(before.current, boards)) {
      const agent = drafterOf(board.id);
      const name = <b>{board.name}</b>;
      rememberDrafter(board.id, null);
      toast({
        msg: agent ? tx('bs.ask.arrived', { agent, name }) : tx('bs.ask.arrivedAny', { name }),
        action: {
          label: t('bs.ask.open'),
          run: () => {
            window.location.hash = studioHash({ kind: 'board', board: board.id });
          },
        },
      });
    }
    before.current = boards;
  }, [boards]);

  // A board published elsewhere (the editor, another tab): its collection is new to the rail.
  // Asked once per collection, so a list that disagrees never loops.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    const known = new Set(collections.map((c) => c.name));
    const missing = boardsOf(state)
      .map((b) => b.collection)
      .filter((c): c is string => !!c && !known.has(c) && !asked.current.has(c));
    if (!missing.length) return;
    for (const c of missing) asked.current.add(c);
    studioChanged();
  }, [state, collections, studioChanged]);

  return (
    <>
      <NewBoardDialog
        open={open?.kind === 'new'}
        n={shown?.kind === 'new' ? shown.n : 0}
        template={shown?.kind === 'new' ? shown.template : null}
        onClose={closeStudioDialog}
      />
      <AgentDraftDialog
        open={open?.kind === 'agent'}
        n={shown?.kind === 'agent' ? shown.n : 0}
        onClose={closeStudioDialog}
      />
    </>
  );
}
