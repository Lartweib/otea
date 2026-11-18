import { type ReactNode, useState } from 'react';
import { t } from '../../i18n/i18n.ts';
import { Button } from '../../kit/index.ts';
import type { MoveChoice } from './moves.ts';
import type { Pick } from './pick.ts';

// The options as buttons, a comment for the agent, and the ways on named for the pick («Elegir →
// Planificar», «Elegir y cerrar»), each of the same weight: the desk's moves and the phone's sheet
// draw the same form. A way stays off until an option is picked.

export type PickMade = { option: string; comment: string };

export function PickForm({
  pick,
  ways,
  onChoose,
  says,
  children,
}: {
  pick: Pick;
  ways: readonly MoveChoice[];
  onChoose: (way: MoveChoice, made: PickMade) => void;
  // The line that says what the way hovered or focused does (the first until one is).
  says: (way: MoveChoice, option: string | null) => ReactNode;
  // Under the line: the send-back and the closes, a refusal.
  children?: ReactNode;
}) {
  const [option, setOption] = useState<string | null>(pick.start);
  const [comment, setComment] = useState('');
  const [pointed, setPointed] = useState<MoveChoice | null>(null);
  const shown = pointed ?? ways[0];
  return (
    <section className="qa pick" data-key="pick">
      <div className="margin-label">{t('pick.label')}</div>
      <div>
        <div className="opts">
          {pick.options.map((o) => (
            <button
              key={o.letter}
              type="button"
              className={option === o.letter ? 'opt on' : 'opt'}
              aria-pressed={option === o.letter}
              data-option={o.letter}
              onClick={() => setOption(o.letter)}
            >
              <b>{o.letter}</b> · {o.name}
              {o.recommended ? <span className="opt-rec"> · {t('pick.recommended')}</span> : null}
            </button>
          ))}
        </div>
        <label className="free">
          {t('pick.comment')}
          <textarea
            placeholder={t('pick.placeholder')}
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        <div className="actions pick-ways">
          {ways.map((way) => (
            <Button
              key={way.move.to}
              variant="primary"
              disabled={!option || !!way.blocked}
              data-move={way.move.to}
              onMouseEnter={() => setPointed(way)}
              onFocus={() => setPointed(way)}
              onClick={() => {
                if (option) onChoose(way, { option, comment: comment.trim() });
              }}
            >
              {way.label}
            </Button>
          ))}
        </div>
        {option ? shown ? says(shown, option) : null : <p className="said">{t('pick.none')}</p>}
        {children}
      </div>
    </section>
  );
}
