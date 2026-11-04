import { type ReactNode, useReducer, useState } from 'react';
import type { Waits } from '../actions.ts';
import {
  barMoves,
  canConfirm,
  IDLE,
  isBusy,
  moveBlock,
  moveSays,
  moveVariants,
  reduceAction,
} from '../actions.ts';
import { moveItem } from '../api.ts';
import { t } from '../i18n/i18n.ts';
import { Button, type ButtonVariant, Icon } from '../kit/index.ts';
import { keyTitle, useStateWord } from '../preset-words.ts';
import type { Move, Turn } from '../types.ts';
import { useMenu } from './menu.ts';
import { Sheet } from './Sheet.tsx';

// onMoved: after a move lands, with its target (on a phone the unfolded item then folds and carries
// itself home). waits: the item's open children and blockers, so a move waiting for them is drawn
// disabled. turn and agent: where the item stands and the agent a move would hand it to, for the
// line that says what each move does. receipt: what the last move you made here did, said on that
// line until another move is hovered. compact: the phone's bar of moves, one row without that line:
// the lead move, and the rest in a sheet under "more", each with what it does (see barMoves).
type ItemActionsProps = {
  id: string;
  moves: Move[];
  waits?: Waits | undefined;
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
  waits,
  onMoved,
  turn,
  agent,
  receipt,
  compact = false,
}: ItemActionsProps) {
  const [state, dispatch] = useReducer(reduceAction, IDLE);
  const word = useStateWord();
  const [pointed, setPointed] = useState<string | null>(null);
  const more = useMenu();
  const busy = isBusy(state);
  const explaining =
    state.step === 'explaining' || (state.step === 'posting' && state.reason !== '');
  const variants = moveVariants(moves, waits);

  const submit = (to: string, reason: string) => {
    dispatch({ type: 'submit', to, reason });
    moveItem(id, to, reason).then(
      () => {
        dispatch({ type: 'succeeded' });
        onMoved?.(to);
      },
      (error: unknown) =>
        dispatch({
          type: 'failed',
          message: error instanceof Error ? error.message : t('common.failed'),
        }),
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
      <p className="t-small">{t('move.none')}</p>
    );
  }

  // then: what else a press does first (a move chosen in the sheet closes it).
  const button = (move: Move, variant: ButtonVariant, then?: () => void) => {
    const blocked = moveBlock(move, waits);
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
        onClick={() => {
          then?.();
          choose(move);
        }}
        onPointerLeave={() => setPointed(null)}
        onBlur={() => setPointed(null)}
        {...point}
        title={keyTitle(word(move.to), move.to)}
      >
        <span className="move-label">
          {word(move.to)}
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
    // Waiting for children or blockers: the move stays in view, disabled, with why next to it.
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
  const split = barMoves(moves, waits);
  const at = (index: number) => placed[index] as (typeof placed)[number];
  return (
    <section className="actions moves" aria-label={t('move.aria')} data-step={state.step}>
      {compact ? (
        <div className="action-buttons move-row move-bar">
          {split.bar.map((index) => button(at(index).move, at(index).variant))}
          {split.more.length > 0 ? (
            <Button
              className="move-more"
              aria-haspopup="dialog"
              aria-expanded={more.open}
              disabled={busy}
              onClick={more.toggle}
            >
              {t('move.more', { count: split.more.length })}
              <Icon name="chevron" />
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="action-buttons move-row">
          {opening.map(({ move, variant }) => button(move, variant))}
          {closing.length > 0 ? (
            <span className="move-close">
              <span className="move-close-label t-cap">{t('common.closeAs')}</span>
              {closing.map(({ move, variant }) => button(move, variant))}
            </span>
          ) : null}
        </div>
      )}
      {compact && split.more.length > 0 ? (
        <Sheet menu={more} label={t('move.moreTitle')} title={t('move.moreTitle')}>
          <ul className="move-sheet">
            {split.more.map((index) => (
              <li key={at(index).move.to}>
                {button(at(index).move, at(index).variant, more.close)}
                <span className="move-says t-cap">{moveSays(at(index).move, { turn, agent })}</span>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}
      {compact ? null : (
        <p className="move-says t-cap">
          {said ? (
            <span key={said.to}>
              <b>{word(said.to)}</b> → {moveSays(said, { turn, agent })}
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
            {t('common.reasonFor', { state: word(state.to) })}
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
              {t('common.confirm')}
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => dispatch({ type: 'cancel' })}>
              {t('common.cancel')}
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
