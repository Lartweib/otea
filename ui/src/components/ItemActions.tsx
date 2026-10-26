import { useReducer } from 'react';
import { canConfirm, IDLE, isBusy, moveTone, reduceAction } from '../actions.ts';
import { moveItem } from '../api.ts';
import type { Move } from '../types.ts';

type ItemActionsProps = { id: string; moves: Move[] };

export function ItemActions({ id, moves }: ItemActionsProps) {
  const [state, dispatch] = useReducer(reduceAction, IDLE);
  const busy = isBusy(state);
  const explaining =
    state.step === 'explaining' || (state.step === 'posting' && state.reason !== '');

  const submit = (to: string, reason: string) => {
    dispatch({ type: 'submit', to, reason });
    moveItem(id, to, reason).then(
      () => dispatch({ type: 'succeeded' }),
      (error: unknown) =>
        dispatch({ type: 'failed', message: error instanceof Error ? error.message : 'Failed' }),
    );
  };

  const choose = (move: Move) => {
    if (move.reasonRequired) dispatch({ type: 'explain', to: move.to });
    else submit(move.to, '');
  };

  if (moves.length === 0) return <p className="muted">No moves from this state.</p>;
  return (
    <section className="actions" aria-label="Actions">
      <div className="action-buttons">
        {moves.map((move) => (
          <button
            key={move.to}
            type="button"
            className="action"
            data-tone={moveTone(move)}
            aria-pressed={state.step === 'explaining' && state.to === move.to}
            disabled={busy}
            onClick={() => choose(move)}
          >
            {move.to}
          </button>
        ))}
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
          <label htmlFor="reason">Reason for moving to {state.to}</label>
          <textarea
            id="reason"
            value={state.reason}
            disabled={busy}
            onChange={(event) => dispatch({ type: 'type', reason: event.target.value })}
          />
          <div className="action-buttons">
            <button
              type="submit"
              className="action"
              data-tone="approve"
              disabled={!canConfirm(state)}
            >
              Confirm
            </button>
            <button
              type="button"
              className="action"
              disabled={busy}
              onClick={() => dispatch({ type: 'cancel' })}
            >
              Cancel
            </button>
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
