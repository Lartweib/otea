import { useReducer } from 'react';
import { canConfirm, IDLE, isBusy, moveVariants, reduceAction } from '../actions.ts';
import { moveItem } from '../api.ts';
import { Button } from '../kit/index.ts';
import type { Move } from '../types.ts';

// onMoved: after a move lands (on a phone the unfolded item then folds and carries itself home).
type ItemActionsProps = { id: string; moves: Move[]; onMoved?: (() => void) | undefined };

export function ItemActions({ id, moves, onMoved }: ItemActionsProps) {
  const [state, dispatch] = useReducer(reduceAction, IDLE);
  const busy = isBusy(state);
  const explaining =
    state.step === 'explaining' || (state.step === 'posting' && state.reason !== '');
  const variants = moveVariants(moves);

  const submit = (to: string, reason: string) => {
    dispatch({ type: 'submit', to, reason });
    moveItem(id, to, reason).then(
      () => {
        dispatch({ type: 'succeeded' });
        onMoved?.();
      },
      (error: unknown) =>
        dispatch({ type: 'failed', message: error instanceof Error ? error.message : 'Failed' }),
    );
  };

  const choose = (move: Move) => {
    if (move.reasonRequired) dispatch({ type: 'explain', to: move.to });
    else submit(move.to, '');
  };

  if (moves.length === 0) return <p className="t-small">No moves from this state.</p>;
  return (
    <section className="actions" aria-label="Actions">
      <div className="action-buttons">
        {moves.map((move, index) => {
          const variant = variants[index] ?? 'default';
          return (
            <Button
              key={move.to}
              // While a reason is being written, Confirm is the one primary on screen.
              variant={explaining && variant === 'primary' ? 'default' : variant}
              aria-pressed={state.step === 'explaining' && state.to === move.to}
              disabled={busy}
              onClick={() => choose(move)}
            >
              {move.to}
            </Button>
          );
        })}
      </div>
      {explaining ? (
        <form
          className="reason"
          onSubmit={(event) => {
            event.preventDefault();
            if (state.step === 'explaining' && canConfirm(state)) {
              submit(state.to, state.reason.trim());
            }
          }}
        >
          <label className="t-label" htmlFor="reason">
            Reason for moving to {state.to}
          </label>
          <textarea
            id="reason"
            className="input"
            value={state.reason}
            disabled={busy}
            onChange={(event) => dispatch({ type: 'type', reason: event.target.value })}
          />
          <div className="action-buttons">
            <Button type="submit" variant="primary" disabled={!canConfirm(state)}>
              Confirm
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => dispatch({ type: 'cancel' })}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {state.step !== 'posting' && state.error ? (
        <p className="action-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
