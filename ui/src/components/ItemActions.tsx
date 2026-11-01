import { type ReactNode, useReducer, useState } from 'react';
import {
  canConfirm,
  IDLE,
  isBusy,
  moveBlock,
  moveSays,
  moveVariants,
  reduceAction,
} from '../actions.ts';
import { moveItem } from '../api.ts';
import { Button, type ButtonVariant } from '../kit/index.ts';
import type { ChildrenSummary, Move, Turn } from '../types.ts';

// onMoved: after a move lands, with its target (on a phone the unfolded item then folds and carries
// itself home). openChildren: the item's children summary, so a move waiting for them is drawn
// disabled. turn and agent: where the item stands and the agent a move would hand it to, for the
// line that says what each move does. receipt: what the last move you made here did, said on that
// line until another move is hovered. compact: the phone's bar of moves, without that line.
type ItemActionsProps = {
  id: string;
  moves: Move[];
  openChildren?: ChildrenSummary | undefined;
  onMoved?: ((to: string) => void) | undefined;
  turn: Turn;
  agent?: string | undefined;
  receipt?: ReactNode;
  compact?: boolean;
};

// The moves, text only. Hovered, a line draws itself around one: ink around a plain move, a ring in
// your color just outside the primary, an underline under a move that closes the item (those sit
// after "close as", quieter). One line under them says what the hovered or focused move does,
// the primary's by default.
export function ItemActions({
  id,
  moves,
  openChildren: children,
  onMoved,
  turn,
  agent,
  receipt,
  compact = false,
}: ItemActionsProps) {
  const [state, dispatch] = useReducer(reduceAction, IDLE);
  const [pointed, setPointed] = useState<string | null>(null);
  const busy = isBusy(state);
  const explaining =
    state.step === 'explaining' || (state.step === 'posting' && state.reason !== '');
  const variants = moveVariants(moves, children);

  const submit = (to: string, reason: string) => {
    dispatch({ type: 'submit', to, reason });
    moveItem(id, to, reason).then(
      () => {
        dispatch({ type: 'succeeded' });
        onMoved?.(to);
      },
      (error: unknown) =>
        dispatch({ type: 'failed', message: error instanceof Error ? error.message : 'Failed' }),
    );
  };

  const choose = (move: Move) => {
    if (move.reasonRequired) dispatch({ type: 'explain', to: move.to });
    else submit(move.to, '');
  };

  if (moves.length === 0) {
    return receipt && !compact ? (
      <p className="move-says t-cap">{receipt}</p>
    ) : (
      <p className="t-small">No moves from this state.</p>
    );
  }

  const button = (move: Move, variant: ButtonVariant) => {
    const blocked = moveBlock(move, children);
    const noteId = `move-block-${id}-${move.to}`;
    const point = blocked
      ? {}
      : { onPointerEnter: () => setPointed(move.to), onFocus: () => setPointed(move.to) };
    const element = (
      <Button
        key={move.to}
        className="move"
        data-variant={blocked ? 'blocked' : variant}
        // While a reason is being written, Confirm is the one primary on screen.
        variant={explaining && variant === 'primary' ? 'default' : variant}
        aria-pressed={state.step === 'explaining' && state.to === move.to}
        aria-describedby={blocked ? noteId : undefined}
        disabled={busy || blocked !== undefined}
        onClick={() => choose(move)}
        onPointerLeave={() => setPointed(null)}
        onBlur={() => setPointed(null)}
        {...point}
      >
        <span className="move-label">
          {move.to}
          {move.reasonRequired ? '…' : ''}
        </span>
        {variant === 'quiet' ? (
          <i className="move-under" aria-hidden="true" />
        ) : (
          <svg className="move-trace" aria-hidden="true">
            <rect
              pathLength={1}
              x="0"
              y="0"
              width="100%"
              height="100%"
              rx={variant === 'primary' ? 22 : 18}
            />
          </svg>
        )}
      </Button>
    );
    if (!blocked) return element;
    // Waiting for children: the move stays in view, disabled, with why next to it.
    return (
      <span key={move.to} className="move-blocked">
        {element}
        <span className="move-block-note t-cap" id={noteId}>
          {blocked}
        </span>
      </span>
    );
  };

  const placed = moves.map((move, index) => ({ move, variant: variants[index] ?? 'default' }));
  const opening = placed.filter(({ variant }) => variant !== 'quiet');
  const closing = placed.filter(({ variant }) => variant === 'quiet');
  const primary = placed.find(({ variant }) => variant === 'primary')?.move;
  // The move being explained is the one said, until another is pointed at.
  const chosen = state.step === 'choosing' ? undefined : state.to;
  const said =
    moves.find((move) => move.to === (pointed ?? chosen)) ?? (receipt ? undefined : primary);
  return (
    <section className="actions moves" aria-label="Actions" data-step={state.step}>
      <div className="action-buttons move-row">
        {opening.map(({ move, variant }) => button(move, variant))}
        {closing.length > 0 ? (
          <span className="move-close">
            {compact ? null : <span className="move-close-label t-cap">close as</span>}
            {closing.map(({ move, variant }) => button(move, variant))}
          </span>
        ) : null}
      </div>
      {compact ? null : (
        <p className="move-says t-cap">
          {said ? (
            <span key={said.to}>
              <b>{said.to}</b> → {moveSays(said, { turn, agent })}
            </span>
          ) : (
            receipt
          )}
        </p>
      )}
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
