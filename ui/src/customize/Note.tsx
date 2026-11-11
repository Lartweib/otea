import { t } from '../i18n/i18n.ts';
import { Button, Swap } from '../kit/index.ts';
import { Unroll } from '../studio/Unroll.tsx';

// The builder's note (a move, a hide, a discard, why a drop was refused): in the toast's grammar
// (mock:3423-3469), but where it stands, in the free column under the switches, so it never covers
// what was just placed. It unrolls and rolls back up mirrored; a second note replaces the words in
// place, the old ones up, the new from below.
export type NoteShown = { text: string; undo?: () => void; seq: number };

export function Note({ note }: { note: NoteShown | undefined }) {
  return (
    <Unroll open={note !== undefined} label={note?.text ?? ''} role="status" className="cz-note">
      {note ? (
        <div className="cz-note-in">
          <Swap k={note.seq} as="p" className="tmsg" dy={6} inDelay={90}>
            {note.text}
          </Swap>
          {note.undo ? (
            <Button variant="quiet" size="sm" data-undo="" onClick={note.undo}>
              {t('cz.undo')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Unroll>
  );
}
