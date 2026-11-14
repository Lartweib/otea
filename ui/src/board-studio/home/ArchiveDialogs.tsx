import { useEffect, useState } from 'react';
import { useApp } from '../../app/context.tsx';
import { t, tx } from '../../i18n/i18n.ts';
import { Button } from '../../kit/Button.tsx';
import { Dialog } from '../../kit/pop/Dialog.tsx';
import { toast } from '../../kit/pop/toast.tsx';
import { studioHash } from '../../selection.ts';
import {
  type ArchivePlan,
  archiveBoard,
  type DeletePlan,
  deleteBoard,
  fetchArchivePlan,
  fetchDeletePlan,
  unarchiveBoard,
} from '../api.ts';
import { closeArchiveDialog, nameTyped, openArchive, useArchiveDialog } from './archive.ts';
import { loadBoards } from './boards-store.ts';

// Archivar and Eliminar (src/app/board-archive.ts), asked once in Otea's dialogs. Archivar says what
// it freezes (open items, leases released, the board a parent divides into going along) and offers
// Deshacer in its toast. Eliminar deletes an empty board on one confirmation; one with items is
// archived first, and then deleted only once its name is typed: items, their history and files go
// for good, while an empty board loses nothing a template cannot make again.

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// The plan a dialog reads first, again each time it opens.
function usePlan<T>(open: boolean, n: number, read: () => Promise<T>) {
  const [plan, setPlan] = useState<{ n: number; plan: T } | { n: number; error: string } | null>(
    null,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again once per opening
  useEffect(() => {
    if (!open) return;
    let live = true;
    read().then(
      (value) => live && setPlan({ n, plan: value }),
      (error: unknown) => live && setPlan({ n, error: message(error) }),
    );
    return () => {
      live = false;
    };
  }, [open, n]);
  return plan?.n === n ? plan : null;
}

// Back to Studio's home when the board gone was the one open in the editor.
function leaveEditor(ids: readonly string[]) {
  const at = window.location.hash;
  if (ids.some((id) => at === studioHash({ kind: 'board', board: id })))
    window.location.hash = studioHash();
}

export function ArchiveDialogs() {
  const open = useArchiveDialog();
  const [shown, setShown] = useState(open);
  if (open && open !== shown) setShown(open);
  return (
    <>
      <ArchiveDialog
        open={open?.kind === 'archive'}
        n={shown?.kind === 'archive' ? shown.n : 0}
        board={shown?.kind === 'archive' ? shown.board : ''}
      />
      <DeleteDialog
        open={open?.kind === 'delete'}
        n={shown?.kind === 'delete' ? shown.n : 0}
        board={shown?.kind === 'delete' ? shown.board : ''}
      />
    </>
  );
}

type DialogProps = { open: boolean; n: number; board: string };

function ArchiveDialog({ open, n, board }: DialogProps) {
  const app = useApp();
  const read = usePlan<ArchivePlan>(open, n, () => fetchArchivePlan(board));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new opening starts clean
  useEffect(() => {
    setBusy(false);
    setError('');
  }, [n]);
  const plan = read && 'plan' in read ? read.plan : null;
  const [main, ...along] = plan?.boards ?? [];
  const name = main?.name ?? '';
  const open_ = (plan?.boards ?? []).reduce((sum, b) => sum + b.open, 0);
  const held = (plan?.boards ?? []).reduce((sum, b) => sum + b.held, 0);

  const archive = () => {
    setBusy(true);
    setError('');
    archiveBoard(board).then(
      ({ archived }) => {
        closeArchiveDialog();
        loadBoards(app.version, true);
        app.studioChanged();
        leaveEditor(archived);
        toast({
          msg: tx('bs.archive.toast', { board: <b>{name}</b> }),
          action: {
            label: t('bs.archive.undo'),
            run: () => {
              unarchiveBoard(board).then(
                () => {
                  loadBoards(app.version, true);
                  app.studioChanged();
                  toast({ msg: tx('bs.archive.restored', { board: <b>{name}</b> }) });
                },
                (e: unknown) => toast({ msg: message(e) }),
              );
            },
          },
        });
      },
      (e: unknown) => {
        setBusy(false);
        setError(message(e));
      },
    );
  };

  return (
    <Dialog
      open={open}
      label={t('bs.archive.title', { board: name })}
      onClose={closeArchiveDialog}
      className="bsp-dialog sh-arch"
    >
      <h4 data-i="">{t('bs.archive.title', { board: name })}</h4>
      {read && 'error' in read ? (
        <p className="lede" data-i="" role="alert">
          {read.error}
        </p>
      ) : !plan ? (
        <p className="lede" data-i="">
          {t('bs.archive.loading')}
        </p>
      ) : (
        <>
          <p className="lede" data-i="">
            {t('bs.archive.lede')}
          </p>
          <ul className="sh-arch-facts" data-i="">
            {along.map((b) => (
              <li key={b.id}>{t('bs.archive.with', { child: b.name, board: name })}</li>
            ))}
            <li>{open_ ? t('bs.archive.open', { count: open_ }) : t('bs.archive.none')}</li>
            {held ? <li>{t('bs.archive.held', { count: held })}</li> : null}
          </ul>
        </>
      )}
      <p className="bsp-dwarn" aria-live="polite">
        {error}
      </p>
      <div className="dbtns" data-i="">
        <Button variant="quiet" onClick={closeArchiveDialog}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" disabled={busy || !plan} onClick={archive}>
          {busy ? t('bs.archive.archiving') : t('bs.archive.archive')}
        </Button>
      </div>
    </Dialog>
  );
}

function DeleteDialog({ open, n, board }: DialogProps) {
  const app = useApp();
  const read = usePlan<DeletePlan>(open, n, () => fetchDeletePlan(board));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new opening starts clean
  useEffect(() => {
    setBusy(false);
    setError('');
    setTyped('');
  }, [n]);
  const plan = read && 'plan' in read ? read.plan : null;
  const [main, ...along] = plan?.boards ?? [];
  const name = main?.name ?? '';
  // A board that stands with items is archived first.
  const standing = plan?.boards.find((b) => !b.archived && b.items > 0);
  const ready = !!plan && !standing && (!plan.confirm || nameTyped(name, typed));

  const remove = () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    deleteBoard(board, plan?.confirm ? typed : undefined).then(
      ({ deleted }) => {
        closeArchiveDialog();
        loadBoards(app.version, true);
        app.studioChanged();
        leaveEditor(deleted);
        toast({ msg: tx('bs.delete.toast', { board: <b>{name}</b> }) });
      },
      (e: unknown) => {
        setBusy(false);
        setError(message(e));
      },
    );
  };

  return (
    <Dialog
      open={open}
      label={t('bs.delete.title', { board: name })}
      onClose={closeArchiveDialog}
      className="bsp-dialog sh-dlg sh-arch"
    >
      <h4 data-i="">{t('bs.delete.title', { board: name })}</h4>
      {read && 'error' in read ? (
        <p className="lede" data-i="" role="alert">
          {read.error}
        </p>
      ) : !plan ? (
        <p className="lede" data-i="">
          {t('bs.archive.loading')}
        </p>
      ) : standing ? (
        <p className="lede" data-i="">
          {t('bs.delete.archiveFirst', { board: standing.name, count: standing.items })}
        </p>
      ) : (
        <>
          <ul className="sh-arch-facts" data-i="">
            {along.map((b) => (
              <li key={b.id}>{t('bs.delete.with', { child: b.name, board: name })}</li>
            ))}
            <li>
              {plan.items ? t('bs.delete.items', { count: plan.items }) : t('bs.delete.empty')}
            </li>
          </ul>
          {plan.confirm ? (
            <div data-i="">
              <label className="flab" htmlFor="sh-del-name">
                {t('bs.delete.type', { board: name })}
              </label>
              <input
                id="sh-del-name"
                className="tx"
                value={typed}
                autoComplete="off"
                spellCheck={false}
                placeholder={name}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    remove();
                  }
                }}
              />
            </div>
          ) : null}
        </>
      )}
      <p className="bsp-dwarn" aria-live="polite">
        {error}
      </p>
      <div className="dbtns" data-i="">
        <Button variant="quiet" onClick={closeArchiveDialog}>
          {t('common.cancel')}
        </Button>
        {standing ? (
          <Button variant="primary" onClick={() => openArchive(board)}>
            {t('bs.delete.toArchive')}
          </Button>
        ) : (
          <Button variant="danger" disabled={busy || !ready} onClick={remove}>
            {busy ? t('bs.delete.deleting') : t('bs.delete.delete')}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
