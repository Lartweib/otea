import { useEffect, useRef, useState } from 'react';
import { moveVariants } from '../actions.ts';
import { fetchItem, moveItem } from '../api.ts';
import { bulkPlan } from '../bulk.ts';
import { Button } from '../kit/index.ts';
import type { Item, Move } from '../types.ts';

// The moves each selected item can take from where it stands, read from the API as the detail
// reads them (so the browser's authority and the preset decide), keyed by the item's last change.
function useMoves(items: readonly Item[]): ReadonlyMap<string, readonly Move[]> {
  const [known, setKnown] = useState<ReadonlyMap<string, readonly Move[]>>(new Map());
  const keys = items.map(({ id, updatedAt }) => `${id}@${updatedAt}`);
  const wanted = keys.join(' ');
  // biome-ignore lint/correctness/useExhaustiveDependencies: one read per selected item and change
  useEffect(() => {
    const controller = new AbortController();
    for (const key of keys) {
      if (known.has(key)) continue;
      const id = key.slice(0, key.lastIndexOf('@'));
      fetchItem(id, controller.signal).then(
        (view) => setKnown((current) => new Map(current).set(key, view ? view.transitions : [])),
        () => undefined,
      );
    }
    return () => controller.abort();
  }, [wanted]);
  return new Map(
    items.flatMap(({ id, updatedAt }) => {
      const moves = known.get(`${id}@${updatedAt}`);
      return moves ? [[id, moves] as const] : [];
    }),
  );
}

type Step =
  | { step: 'choosing' }
  | { step: 'explaining'; move: Move; reason: string }
  | { step: 'posting'; move: Move; done: number }
  | { step: 'landed'; text: string; failed: string[] };

type BulkBarProps = {
  selected: readonly Item[];
  canWrite: boolean;
  onKeep: (ids: string[]) => void;
  onClear: () => void;
};

const RECEIPT_MS = 6000;

// The bar under a selection: how many and of which states, the moves every one of them can take
// (one primary at most, throwing work away quiet), and what keeps the others out. A move that asks a
// reason asks once, here, and records the same reason on each item. Then the bar says what landed.
export function BulkBar({ selected, canWrite, onKeep, onClear }: BulkBarProps) {
  const moves = useMoves(canWrite ? selected : []);
  const [state, setState] = useState<Step>({ step: 'choosing' });
  const reason = useRef<HTMLInputElement>(null);
  const plan = bulkPlan(selected.map((item) => ({ item, moves: moves.get(item.id) })));
  const variants = moveVariants(plan.moves);

  useEffect(() => {
    if (state.step !== 'landed') return;
    const timer = setTimeout(() => setState({ step: 'choosing' }), RECEIPT_MS);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (state.step === 'explaining') reason.current?.focus();
  }, [state.step]);

  const run = async (move: Move, why: string) => {
    const ids = selected.map(({ id }) => id);
    const failed: string[] = [];
    setState({ step: 'posting', move, done: 0 });
    for (const [index, id] of ids.entries()) {
      try {
        await moveItem(id, move.to, why);
      } catch (error) {
        failed.push(`${id}: ${error instanceof Error ? error.message : 'failed'}`);
      }
      setState({ step: 'posting', move, done: index + 1 });
    }
    const moved = ids.length - failed.length;
    const what = ids.length === 1 ? ids[0] : `${moved} items`;
    setState({
      step: 'landed',
      text: moved > 0 ? `${what} → ${move.to}` : 'Nothing moved',
      failed,
    });
    onClear();
  };

  const choose = (move: Move) => {
    if (move.reasonRequired) setState({ step: 'explaining', move, reason: '' });
    else void run(move, '');
  };

  if (state.step === 'landed') {
    return (
      <div className="bulk-bar" role="status">
        <div className="bulk-row">
          <span className="bulk-receipt">{state.text}</span>
          <Button variant="quiet" size="sm" onClick={() => setState({ step: 'choosing' })}>
            dismiss
          </Button>
        </div>
        {state.failed.length > 0 ? (
          <p className="bulk-rule action-error">{state.failed.join(' · ')}</p>
        ) : null}
      </div>
    );
  }
  if (selected.length === 0) return null;

  if (state.step === 'explaining' || state.step === 'posting') {
    const posting = state.step === 'posting';
    const why = state.step === 'explaining' ? state.reason : '';
    return (
      <div className="bulk-bar" role="toolbar" aria-label="Bulk moves">
        <div className="bulk-cap">
          <b>
            {state.move.to} · {selected.length}
          </b>
          <span>
            {posting
              ? `moving ${state.done} of ${selected.length}`
              : 'a reason is required · it is recorded on each'}
          </span>
        </div>
        {state.step === 'explaining' ? (
          <form
            className="bulk-reason"
            onSubmit={(event) => {
              event.preventDefault();
              if (why.trim() !== '') void run(state.move, why.trim());
            }}
          >
            <label className="bulk-input">
              <span className="visually-hidden">Reason for moving to {state.move.to}</span>
              <input
                ref={reason}
                value={why}
                placeholder="Why? Agents read this"
                onChange={(event) =>
                  setState({ step: 'explaining', move: state.move, reason: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setState({ step: 'choosing' });
                }}
              />
            </label>
            <Button type="submit" variant="primary" size="sm" disabled={why.trim() === ''}>
              {state.move.to} · {selected.length}
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setState({ step: 'choosing' })}>
              cancel
            </Button>
          </form>
        ) : null}
      </div>
    );
  }

  const rule =
    plan.hidden.length > 0
      ? `hidden · ${plan.hidden.map(({ moves, why }) => `${moves.join(', ')}: ${why}`).join(' · ')}`
      : selected.length === 1
        ? 'the moves this item can take'
        : `only the moves all ${selected.length} can take`;
  return (
    <div className="bulk-bar" role="toolbar" aria-label="Bulk moves">
      <div className="bulk-cap">
        <b>{selected.length} selected</b>
        <span>{plan.counts}</span>
      </div>
      <div className="bulk-row">
        {!canWrite ? (
          <span className="bulk-none">Read-only: run otea open to act from this browser.</span>
        ) : plan.loading ? (
          <span className="bulk-none">Reading the moves…</span>
        ) : plan.moves.length === 0 ? (
          <span className="bulk-none">No move fits all {selected.length}.</span>
        ) : (
          plan.moves.map((move, index) => (
            <Button
              key={move.to}
              size="sm"
              variant={variants[index] ?? 'default'}
              onClick={() => choose(move)}
            >
              {move.to}
              {move.reasonRequired ? '…' : ''}
            </Button>
          ))
        )}
        {plan.narrow.length > 0 ? <span className="bulk-sep" aria-hidden="true" /> : null}
        {plan.narrow.map(({ label, ids }) => (
          <Button key={label} size="sm" onClick={() => onKeep(ids)}>
            {label}
          </Button>
        ))}
        <Button variant="quiet" size="sm" className="bulk-x" onClick={onClear}>
          clear
        </Button>
      </div>
      {canWrite && !plan.loading ? <p className="bulk-rule">{rule}</p> : null}
    </div>
  );
}
