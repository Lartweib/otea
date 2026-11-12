import { useEffect, useState } from 'react';
import { DONE, type Target } from '../../../../src/core/board/model.ts';
import type { Change } from '../../../../src/core/board/plan.ts';
import { language, listOf, t, tx } from '../../i18n/i18n.ts';
import { Dialog } from '../../kit/pop/Dialog.tsx';
import {
  type BoardRecord,
  createBoard,
  discardDraft,
  fetchPublishPlan,
  type PublishPlan,
  publishBoard,
  restoreBoard,
  saveDraft,
} from '../api.ts';
import type { ReadyDraft } from '../use-board-draft.ts';
import { changeText, problemText } from '../words.ts';
import { failedText, plainToast } from './toasts.tsx';

export { PracticeDialog } from './Practice.tsx';

// The editor bar's dialogs: Publicar (the change plan in sentences, where the items of removed steps
// go, what happens to items in flight, errors that block and warnings that inform; then a toast with
// Ver el tablero and Deshacer) and Descartar (asks once, then Deshacer in a toast). Every failure
// says the server's reason; nothing is swallowed.

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Publicar: the change plan in sentences, the moves for items in removed steps, the effects on
// items in flight, errors that block (each with Ir) and warnings; on publish, the toast with Ver el
// tablero and Deshacer (restore).
export type PublishDialogProps = {
  draft: ReadyDraft;
  open: boolean;
  onClose: () => void;
  // The record after publishing, or after Deshacer restored the previous version.
  onPublished: (record: BoardRecord) => void;
};

const ADDS = new Set<Change['kind']>(['created', 'step_added', 'hand_added', 'part_added']);

type Plan =
  | { status: 'saving' }
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; plan: PublishPlan };

export function PublishDialog({ draft, open, onClose, onPublished }: PublishDialogProps) {
  const [plan, setPlan] = useState<Plan>({ status: 'loading' });
  const [moves, setMoves] = useState<Record<string, Target>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const id = draft.record.id;
  const saved = draft.save.kind === 'saved';

  // The plan is the server's, of the draft as saved: a pending save goes first.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per opening, after the save lands
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!saved) {
      setPlan({ status: 'saving' });
      if (draft.save.kind !== 'saving') draft.retrySave();
      return;
    }
    let live = true;
    setPlan({ status: 'loading' });
    fetchPublishPlan(id)
      .then((next) => {
        if (!live) return;
        setPlan({ status: 'ready', plan: next });
        setMoves(Object.fromEntries(next.effects.moves.map((m) => [m.step, m.suggested])));
      })
      .catch((e: unknown) => live && setPlan({ status: 'failed', message: message(e) }));
    return () => {
      live = false;
    };
  }, [open, saved, attempt]);

  const def = draft.def;
  const ready = plan.status === 'ready' ? plan.plan : null;
  const errors = ready?.problems.filter((p) => p.level === 'error') ?? [];
  const warnings = ready?.problems.filter((p) => p.level === 'warning') ?? [];
  const first = def.steps[0];
  const isNew = ready ? ready.from === null : draft.baseVersion === null;
  const name = def.name;

  const publish = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const result = await publishBoard(id, moves, draft.record.draft?.updatedAt ?? null);
      setBusy(false);
      onClose();
      onPublished(result.record);
      const board = result.record.collection;
      const view = board ? (
        <a className="bsp-tlink" href={`#/b/${encodeURIComponent(board)}`}>
          {t('bs.preview.publish.seeBoard')}
        </a>
      ) : null;
      const msg = isNew
        ? tx('bs.preview.publish.toast.first', {
            name: <b>{name}</b>,
            step: <b>{first?.name ?? '—'}</b>,
          })
        : tx('bs.preview.publish.toast.next', { name: <b>{name}</b>, v: result.version });
      plainToast(
        <>
          {msg} {view}
        </>,
        () => {
          restoreBoard(id, ready.from)
            .then((record) => {
              onPublished(record);
              plainToast(
                ready.from === null
                  ? tx('bs.preview.publish.toast.undoneFirst', { name: <b>{name}</b> })
                  : t('bs.preview.publish.toast.undone', { v: ready.from }),
              );
            })
            .catch((e: unknown) => plainToast(failedText(message(e))));
        },
      );
    } catch (e) {
      setBusy(false);
      setError(message(e));
    }
  };

  let content = null;
  if (plan.status === 'saving' || plan.status === 'loading')
    content = (
      <p className="bsp-fhint" data-i="">
        {t(plan.status === 'saving' ? 'bs.preview.publish.saving' : 'bs.preview.publish.loading')}
      </p>
    );
  else if (plan.status === 'failed')
    content = (
      <>
        <p className="bsp-dwarn" data-i="">
          {failedText(plan.message)}
        </p>
        <div className="dbtns" data-i="">
          <button type="button" className="btn quiet" onClick={onClose}>
            {t('bs.preview.publish.keepEditing')}
          </button>
          <button type="button" className="btn primary" onClick={() => setAttempt((n) => n + 1)}>
            {t('bs.preview.publish.retry')}
          </button>
        </div>
      </>
    );
  else if (ready) {
    const effects = ready.effects;
    const hasEffects = effects.moves.length + effects.needs.length + effects.reopened.length > 0;
    content = (
      <>
        <p className="lede" data-i="">
          {isNew
            ? first
              ? tx('bs.preview.publish.introFirst', {
                  name: <b>{name}</b>,
                  step: <b>{first.name}</b>,
                })
              : tx('bs.preview.publish.introFirstEmpty', { name: <b>{name}</b> })
            : tx('bs.preview.publish.intro', {
                name: <b>{name}</b>,
                from: ready.from ?? 0,
                to: ready.to,
              })}
        </p>
        {errors.length ? (
          <ul className="bsp-chg" data-i="">
            {errors.map((problem) => (
              <li key={`${problem.code}:${JSON.stringify(problem.at)}`} className="err">
                <span>
                  {problemText(problem)}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      draft.reveal(problem.at);
                    }}
                  >
                    {t('bs.preview.publish.go')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="bsp-chg" data-i="">
          {ready.changes.length ? (
            ready.changes.map((change, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the plan's order is the key
              <li key={i} className={ADDS.has(change.kind) ? 'add' : undefined}>
                <span>{changeText(change)}</span>
              </li>
            ))
          ) : (
            <li>
              <span>{t('bs.preview.publish.noChanges')}</span>
            </li>
          )}
        </ul>
        {isNew || hasEffects ? (
          <div className="bsp-effects" data-i="">
            <span className="margin-label">{t('bs.preview.publish.items')}</span>
            {isNew ? <p className="lede plain">{t('bs.preview.publish.noItemsYet')}</p> : null}
            {effects.moves.map((m) => (
              <p className="lede plain" key={m.step}>
                {tx('bs.preview.publish.moves', {
                  count: m.items.length,
                  step: <b>{m.name}</b>,
                  select: (
                    <select
                      aria-label={t('bs.preview.publish.moveTo', { step: m.name })}
                      value={moves[m.step] ?? m.suggested}
                      onChange={(e) => setMoves({ ...moves, [m.step]: e.target.value })}
                    >
                      {def.steps.map((step) => (
                        <option key={step.id} value={step.id}>
                          {step.name}
                        </option>
                      ))}
                      <option value={DONE}>{t('bs.done')}</option>
                    </select>
                  ),
                })}
              </p>
            ))}
            {effects.needs.map((need) => (
              <p className="lede plain" key={`n:${need.step}`}>
                {tx('bs.preview.publish.needs', {
                  count: need.items.length,
                  step: <b>{need.name}</b>,
                  parts: <b>{listOf(need.parts)}</b>,
                })}
              </p>
            ))}
            {effects.reopened.map((back) => (
              <p className="lede plain" key={`r:${back.step}`}>
                {tx('bs.preview.publish.reopened', {
                  count: back.items.length,
                  step: <b>{back.name}</b>,
                })}
              </p>
            ))}
          </div>
        ) : (
          <p className="bsp-fhint" data-i="">
            {t('bs.preview.publish.nothingMoves')}
          </p>
        )}
        {warnings.length ? (
          <ul className="bsp-chg warns" data-i="">
            {warnings.map((problem) => (
              <li key={`${problem.code}:${JSON.stringify(problem.params)}`}>
                <span>{problemText(problem)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="bsp-dwarn" aria-live="polite">
          {error ? failedText(error) : ''}
        </p>
        <div className="dbtns" data-i="">
          <button type="button" className="btn quiet" onClick={onClose}>
            {t('bs.preview.publish.keepEditing')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={errors.length > 0 || busy}
            onClick={() => void publish()}
          >
            {busy ? t('bs.preview.publish.publishing') : t('bs.preview.publish.publish')}
          </button>
        </div>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      label={t('bs.preview.publish.label')}
      onClose={onClose}
      className="bsp-dialog wide"
    >
      <h4 data-i="">
        {isNew ? t('bs.preview.publish.titleFirst', { name }) : t('bs.preview.publish.title')}
      </h4>
      {content}
    </Dialog>
  );
}

// Descartar: asks once, then Deshacer in a toast (the draft is saved again).
export type DiscardDialogProps = {
  draft: ReadyDraft;
  open: boolean;
  onClose: () => void;
  // `deleted`: the board was never published and is gone; the editor goes back to the home.
  onDiscarded: (result: { deleted: boolean }) => void;
};

export function DiscardDialog({ draft, open, onClose, onDiscarded }: DiscardDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  const def = draft.def;
  const live = draft.record.live;
  const id = draft.record.id;

  const discard = async () => {
    const kept = structuredClone(def);
    const base = draft.baseVersion;
    setBusy(true);
    setError(null);
    try {
      const { deleted } = await discardDraft(id);
      setBusy(false);
      onClose();
      onDiscarded({ deleted });
      plainToast(tx('bs.preview.discard.toast', { name: <b>{kept.name}</b> }), () => {
        // A board that never went live is gone with its draft: it comes back as a new board.
        const back: Promise<unknown> = deleted
          ? createBoard({ name: kept.name, item: kept.item, lang: language() }).then(
              async (record: BoardRecord) => {
                await saveDraft(record.id, kept, null);
                window.location.hash = `#/studio/board/${encodeURIComponent(record.id)}`;
              },
            )
          : saveDraft(id, kept, base).then(() => draft.reload());
        back
          .then(() => plainToast(tx('bs.preview.discard.undone', { name: <b>{kept.name}</b> })))
          .catch((e: unknown) => plainToast(failedText(message(e))));
      });
    } catch (e) {
      setBusy(false);
      setError(message(e));
    }
  };

  return (
    <Dialog
      open={open}
      label={t('bs.preview.discard.label')}
      onClose={onClose}
      className="bsp-dialog"
    >
      <h4 data-i="">{t('bs.preview.discard.title')}</h4>
      <p className="lede" data-i="">
        {live
          ? t('bs.preview.discard.live', { v: live.version })
          : t('bs.preview.discard.never', { name: def.name })}
      </p>
      <p className="bsp-dwarn" aria-live="polite">
        {error ? failedText(error) : ''}
      </p>
      <div className="dbtns" data-i="">
        <button type="button" className="btn quiet" onClick={onClose}>
          {t('bs.preview.publish.keepEditing')}
        </button>
        <button
          type="button"
          className="btn quiet warn"
          disabled={busy}
          onClick={() => void discard()}
        >
          {t('bs.preview.discard.discard')}
        </button>
      </div>
    </Dialog>
  );
}

// Probar: a practice item through a throwaway copy of the draft; nothing is kept.
export type PracticeDialogProps = {
  draft: ReadyDraft;
  open: boolean;
  onClose: () => void;
};
