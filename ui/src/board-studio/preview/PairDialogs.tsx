import { type ReactNode, useEffect, useState } from 'react';
import { type BoardDefinition, DONE, type Target } from '../../../../src/core/board/model.ts';
import { language, listOf, t, tx } from '../../i18n/i18n.ts';
import { Dialog } from '../../kit/pop/Dialog.tsx';
import { RowIcon } from '../../shell/Rail.tsx';
import { boardIcon } from '../../shell/rail-model.ts';
import {
  type BoardRecord,
  createBoard,
  discardDraft,
  fetchPublishPlan,
  type PublishPlan,
  publishPair,
  restorePair,
  saveDraft,
} from '../api.ts';
import { draftOf, type PairRole, type PairWorkspace } from '../pair.ts';
import type { ReadyDraft } from '../use-board-draft.ts';
import { changeText, problemText } from '../words.ts';
import { effectLines, type Published, pairToast, publishRoles, setupLeftText } from './publish.ts';
import { failedText, plainToast } from './toasts.tsx';

// Publicar and Descartar for a joined pair (WORKSPACE rows 4–6): one plan grouped by board, errors
// of either board block (Ir jumps in place), only the board with changes when only one has them,
// one toast whose Deshacer reverts both; Descartar asks about both drafts, or the one with changes,
// with "Solo …" when the board on screen is published.

const ROLES: readonly PairRole[] = ['parent', 'child'];
const ADDS = new Set(['created', 'step_added', 'hand_added', 'part_added']);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

type Plans = Record<PairRole, PublishPlan | null>;
type Loading =
  | { status: 'saving' | 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; plans: Plans };

export type PairPublishDialogProps = {
  pair: PairWorkspace;
  open: boolean;
  onClose: () => void;
  onPublished: (record: BoardRecord) => void;
  // What is left unmarked in «Qué falta configurar» (the editor's checklist), when it shows.
  setupLeft?: number;
};

export function PairPublishDialog({
  pair,
  open,
  onClose,
  onPublished,
  setupLeft = 0,
}: PairPublishDialogProps) {
  const [loading, setLoading] = useState<Loading>({ status: 'loading' });
  const [moves, setMoves] = useState<Record<PairRole, Record<string, Target>>>({
    parent: {},
    child: {},
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const saved = ROLES.every((role) => draftOf(pair, role).save.kind === 'saved');

  // biome-ignore lint/correctness/useExhaustiveDependencies: once per opening, after both saves land
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!saved) {
      setLoading({ status: 'saving' });
      for (const role of ROLES) {
        const draft = draftOf(pair, role);
        if (draft.save.kind !== 'saved' && draft.save.kind !== 'saving') draft.retrySave();
      }
      return;
    }
    let live = true;
    setLoading({ status: 'loading' });
    const planOf = (role: PairRole) => {
      const draft = draftOf(pair, role);
      return draft.record.draft ? fetchPublishPlan(draft.record.id) : Promise.resolve(null);
    };
    Promise.all([planOf('parent'), planOf('child')])
      .then(([parent, child]) => {
        if (!live) return;
        setLoading({ status: 'ready', plans: { parent, child } });
        const suggested = (plan: PublishPlan | null) =>
          Object.fromEntries(plan?.effects.moves.map((m) => [m.step, m.suggested]) ?? []);
        setMoves({ parent: suggested(parent), child: suggested(child) });
      })
      .catch((e: unknown) => live && setLoading({ status: 'failed', message: message(e) }));
    return () => {
      live = false;
    };
  }, [open, saved, attempt]);

  const plans = loading.status === 'ready' ? loading.plans : null;
  const roles = plans
    ? publishRoles({
        parent: plans.parent && { from: plans.parent.from, changes: plans.parent.changes.length },
        child: plans.child && { from: plans.child.from, changes: plans.child.changes.length },
      })
    : [];
  const two = roles.length === 2;
  const parentDef = pair.parent.def;
  const childDef = pair.child.def;
  const errors = ROLES.flatMap((role) =>
    draftOf(pair, role)
      .problems.filter((p) => p.level === 'error')
      .map((problem) => ({ role, problem })),
  );
  const warnings = roles.flatMap((role) =>
    (plans?.[role]?.problems ?? [])
      .filter((p) => p.level === 'warning')
      .map((problem) => ({ role, problem })),
  );

  const publish = async () => {
    if (!plans || roles.length === 0) return;
    setBusy(true);
    setError(null);
    const stamps = Object.fromEntries(
      roles.map((role) => [role, draftOf(pair, role).record.draft?.updatedAt ?? null]),
    );
    const sent = Object.fromEntries(roles.map((role) => [role, moves[role]]));
    try {
      const result = await publishPair({
        parent: pair.ids.parent,
        child: pair.ids.child,
        moves: sent,
        draftStamps: stamps,
      });
      setBusy(false);
      onClose();
      const recs: Published[] = roles.map((role) => {
        const def = draftOf(pair, role).def;
        return {
          name: def.name,
          from: plans[role]?.from ?? null,
          version: result[role]?.version ?? 1,
          ...(def.steps[0] ? { first: def.steps[0].name } : {}),
        };
      });
      for (const role of ROLES) draftOf(pair, role).reload();
      const active = result[pair.active]?.record ?? result.parent?.record ?? result.child?.record;
      if (active) onPublished(active);
      const words = pairToast(recs, parentDef.item, { rich: true });
      const first = roles[0] ? result[roles[0]]?.record : undefined;
      const board = first?.collection;
      const view = board ? (
        <a className="bsp-tlink" href={`#/b/${encodeURIComponent(board)}`}>
          {two
            ? t('bs.preview.publish.pair.see', {
                name: draftOf(pair, roles[0] ?? 'parent').def.name,
              })
            : t('bs.preview.publish.seeBoard')}
        </a>
      ) : null;
      plainToast(
        <>
          {words.done} {view}
        </>,
        () => {
          const versions = Object.fromEntries(
            roles.map((role) => [role, plans[role]?.from ?? null]),
          );
          restorePair({ parent: pair.ids.parent, child: pair.ids.child, versions })
            .then((back) => {
              for (const role of ROLES) draftOf(pair, role).reload();
              const record = back[pair.active] ?? back.parent ?? back.child;
              if (record) onPublished(record);
              plainToast(words.undone);
            })
            .catch((e: unknown) => plainToast(failedText(message(e))));
        },
      );
    } catch (e) {
      setBusy(false);
      setError(message(e));
    }
  };

  const group = (role: PairRole) => {
    const plan = plans?.[role];
    if (!plan) return null;
    const draft = draftOf(pair, role);
    const def = draft.def;
    const first = def.steps[0];
    const effects = plan.effects;
    const isNew = plan.from === null;
    const parts = role === 'parent' ? childDef.name : null;
    const lines = effectLines(effects, parts, { rich: true });
    const hasEffects =
      effects.moves.length + effects.needs.length + effects.reopened.length + lines.length > 0;
    return (
      <div className="bsp-pgroup" data-i="" key={role}>
        <p className="pgh">
          <span className="pgn">
            <RowIcon icon={boardIcon(def.icon)} />
            {def.name}
          </span>
          <span className="gloss">
            {isNew ? t('bs.preview.publish.pair.headFirst') : `v${plan.from} → v${plan.to}`}
          </span>
          <span className="rl" />
        </p>
        {isNew && first ? (
          <p className="bsp-fhint">
            {tx('bs.preview.publish.pair.firstStep', { step: <b>{first.name}</b> })}
          </p>
        ) : null}
        <ul className="bsp-chg">
          {plan.changes.length ? (
            plan.changes.map((change, i) => (
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
        {hasEffects ? (
          <div className="bsp-effects">
            <span className="margin-label">{t('bs.preview.publish.pair.items')}</span>
            <Effects
              draft={draft}
              plan={plan}
              moves={moves[role]}
              onMove={(step, to) => setMoves({ ...moves, [role]: { ...moves[role], [step]: to } })}
              lines={lines}
            />
          </div>
        ) : (
          <p className="bsp-fhint">
            {t(isNew ? 'bs.preview.publish.noItemsYet' : 'bs.preview.publish.pair.noneMove')}
          </p>
        )}
      </div>
    );
  };

  let content: ReactNode = null;
  if (loading.status === 'saving' || loading.status === 'loading')
    content = (
      <p className="bsp-fhint" data-i="">
        {t(
          loading.status === 'saving' ? 'bs.preview.publish.saving' : 'bs.preview.publish.loading',
        )}
      </p>
    );
  else if (loading.status === 'failed')
    content = (
      <>
        <p className="bsp-dwarn" data-i="">
          {failedText(loading.message)}
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
  else if (plans) {
    const only = roles[0];
    const other = only === 'parent' ? 'child' : 'parent';
    const otherLive = draftOf(pair, other).record.live;
    content = (
      <>
        <p className="lede" data-i="">
          {two
            ? tx('bs.preview.publish.pair.lede', {
                a: <b>{parentDef.name}</b>,
                b: <b>{childDef.name}</b>,
                item: parentDef.item.toLocaleLowerCase(),
                child: childDef.name,
              })
            : only
              ? otherLive
                ? tx('bs.preview.publish.pair.onlyOneAt', {
                    name: <b>{draftOf(pair, only).def.name}</b>,
                    other: <b>{draftOf(pair, other).def.name}</b>,
                    v: otherLive.version,
                  })
                : tx('bs.preview.publish.pair.onlyOne', {
                    name: <b>{draftOf(pair, only).def.name}</b>,
                    other: <b>{draftOf(pair, other).def.name}</b>,
                  })
              : t('bs.preview.publish.noChanges')}
        </p>
        {errors.length ? (
          <ul className="bsp-chg" data-i="">
            {errors.map(({ role, problem }) => (
              <li key={`${role}:${problem.code}:${JSON.stringify(problem.at)}`} className="err">
                <span>
                  <b className="eb">{draftOf(pair, role).def.name}</b> {problemText(problem)}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (pair.active !== role) pair.setActive(role);
                      draftOf(pair, role).reveal(problem.at);
                    }}
                  >
                    {t('bs.preview.publish.go')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {roles.map(group)}
        {warnings.length ? (
          <ul className="bsp-chg warns" data-i="">
            {warnings.map(({ role, problem }) => (
              <li key={`${role}:${problem.code}:${JSON.stringify(problem.params)}`}>
                <span>
                  <b className="eb">{draftOf(pair, role).def.name}</b> {problemText(problem)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {roles.some((role) => plans[role]?.from !== null) ? (
          <p className="bsp-fhint" data-i="">
            {t('bs.preview.publish.pair.nextCall')}
          </p>
        ) : null}
        {setupLeft > 0 ? (
          <p className="bsp-fhint" data-i="">
            {setupLeftText(setupLeft)}
          </p>
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
            disabled={errors.length > 0 || busy || roles.length === 0}
            onClick={() => void publish()}
          >
            {busy
              ? t('bs.preview.publish.publishing')
              : two
                ? t('bs.preview.publish.pair.publish')
                : t('bs.preview.publish.publish')}
          </button>
        </div>
      </>
    );
  }

  const only = roles.length === 1 ? draftOf(pair, roles[0] ?? 'parent') : null;
  const title = two
    ? t('bs.preview.publish.pair.title')
    : only
      ? only.record.live
        ? t('bs.preview.publish.pair.titleChanges', { name: only.def.name })
        : t('bs.preview.publish.titleFirst', { name: only.def.name })
      : t('bs.preview.publish.pair.title');
  return (
    <Dialog
      open={open}
      label={t('bs.preview.publish.label')}
      onClose={onClose}
      className="bsp-dialog wide"
    >
      <h4 data-i="">{title}</h4>
      {content}
    </Dialog>
  );
}

// What happens to a board's items: the moves of removed steps (each a choice), new needs, reviews
// that went away, and the new capabilities' waits and frozen branches.
export function Effects({
  draft,
  plan,
  moves,
  onMove,
  lines,
}: {
  draft: ReadyDraft;
  plan: PublishPlan;
  moves: Record<string, Target>;
  onMove: (step: string, to: Target) => void;
  lines: ReactNode[];
}) {
  const def = draft.def;
  const { effects } = plan;
  return (
    <>
      {effects.moves.map((m) => (
        <p className="lede plain" key={m.step}>
          {tx('bs.preview.publish.moves', {
            count: m.items.length,
            step: <b>{m.name}</b>,
            select: (
              <select
                aria-label={t('bs.preview.publish.moveTo', { step: m.name })}
                value={moves[m.step] ?? m.suggested}
                onChange={(e) => onMove(m.step, e.target.value)}
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
      {lines.map((line, k) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the effects' order is the key
        <p className="lede plain" key={`w:${k}`}>
          {line}
        </p>
      ))}
    </>
  );
}

type Kept = { role: PairRole; id: string; def: BoardDefinition; base: number | null };

export type PairDiscardDialogProps = {
  pair: PairWorkspace;
  open: boolean;
  onClose: () => void;
  // `deleted`: the board on screen was never published and is gone.
  onDiscarded: (result: { deleted: boolean }) => void;
};

export function PairDiscardDialog({ pair, open, onClose, onDiscarded }: PairDiscardDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  const changed = ROLES.filter((role) => draftOf(pair, role).record.draft !== null);
  const two = changed.length === 2;
  const current = draftOf(pair);
  const canOne = two && current.record.live !== null;

  const say = (role: PairRole) => {
    const draft = draftOf(pair, role);
    const live = draft.record.live;
    return live
      ? t('bs.preview.discard.liveOf', { name: draft.def.name, v: live.version })
      : t('bs.preview.discard.never', { name: draft.def.name });
  };

  const run = async (roles: readonly PairRole[]) => {
    const kept: Kept[] = roles.map((role) => {
      const draft = draftOf(pair, role);
      return {
        role,
        id: draft.record.id,
        def: structuredClone(draft.def),
        base: draft.baseVersion,
      };
    });
    setBusy(true);
    setError(null);
    try {
      // The parent first: its split names the child.
      const gone = new Set<PairRole>();
      for (const k of kept) {
        const { deleted } = await discardDraft(k.id);
        if (deleted) gone.add(k.role);
      }
      setBusy(false);
      onClose();
      onDiscarded({ deleted: gone.has(pair.active) || gone.has('parent') });
      for (const role of ROLES) if (!gone.has(role)) draftOf(pair, role).reload();
      const names = listOf(kept.map((k) => k.def.name));
      plainToast(
        kept.length > 1
          ? tx('bs.preview.discard.toastBoth', { names: <b>{names}</b> })
          : tx('bs.preview.discard.toast', { name: <b>{kept[0]?.def.name}</b> }),
        () => {
          undoDiscard(kept, gone)
            .then(() =>
              plainToast(
                kept.length > 1
                  ? tx('bs.preview.discard.undoneBoth', { names: <b>{names}</b> })
                  : tx('bs.preview.discard.undone', { name: <b>{kept[0]?.def.name}</b> }),
              ),
            )
            .catch((e: unknown) => plainToast(failedText(message(e))));
        },
      );
    } catch (e) {
      setBusy(false);
      setError(message(e));
    }
  };

  // Puts the drafts back: a live board's draft is saved again; a board that never went live comes
  // back as a new board (the child first, so the parent's split can name it), then the editor opens it.
  const undoDiscard = async (kept: readonly Kept[], gone: ReadonlySet<PairRole>) => {
    const ids: Partial<Record<PairRole, string>> = {};
    for (const k of [...kept].sort((a, b) => ROLES.indexOf(b.role) - ROLES.indexOf(a.role))) {
      if (!gone.has(k.role)) {
        await saveDraft(k.id, k.def, k.base);
        ids[k.role] = k.id;
        continue;
      }
      const def = structuredClone(k.def);
      if (k.role === 'parent' && def.split && ids.child)
        def.split = { ...def.split, board: ids.child };
      const record = await createBoard({ name: def.name, item: def.item, lang: language() });
      await saveDraft(record.id, def, null);
      ids[k.role] = record.id;
    }
    if (gone.size > 0) {
      const open = ids.parent ?? ids.child;
      if (open) window.location.hash = `#/studio/board/${encodeURIComponent(open)}`;
    } else for (const role of ROLES) draftOf(pair, role).reload();
  };

  const untouched = ROLES.find((role) => !changed.includes(role));
  return (
    <Dialog
      open={open}
      label={t('bs.preview.discard.label')}
      onClose={onClose}
      className="bsp-dialog"
    >
      <h4 data-i="">
        {two
          ? t('bs.preview.discard.pairTitle')
          : t('bs.preview.discard.oneTitle', {
              name: draftOf(pair, changed[0] ?? pair.active).def.name,
            })}
      </h4>
      <p className="lede" data-i="">
        {changed.map(say).join(' ')} {t('bs.preview.discard.lost')}
      </p>
      {!two && untouched ? (
        <p className="bsp-fhint" data-i="">
          {t('bs.preview.discard.untouched', { name: draftOf(pair, untouched).def.name })}
        </p>
      ) : null}
      <p className="bsp-dwarn" aria-live="polite">
        {error ? failedText(error) : ''}
      </p>
      <div className="dbtns" data-i="">
        <button type="button" className="btn quiet" onClick={onClose}>
          {t('bs.preview.publish.keepEditing')}
        </button>
        {canOne ? (
          <button
            type="button"
            className="btn quiet warn"
            disabled={busy}
            onClick={() => void run([pair.active])}
          >
            {t('bs.preview.discard.only', { name: current.def.name })}
          </button>
        ) : null}
        <button
          type="button"
          className="btn quiet warn"
          disabled={busy || changed.length === 0}
          onClick={() => void run(changed)}
        >
          {two ? t('bs.preview.discard.both') : t('bs.preview.discard.discard')}
        </button>
      </div>
    </Dialog>
  );
}
