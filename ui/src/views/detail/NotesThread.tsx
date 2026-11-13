import { useId, useState } from 'react';
import type { NoteAnchor } from '../../../../src/core/board/notes.ts';
import { useFileUrl } from '../../evidence-files.ts';
import { t } from '../../i18n/i18n.ts';
import { AgentMark, Icon } from '../../kit/index.ts';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import type { Evidence } from '../../types.ts';
import { type ItemNote, noteContext, notesCount, noteTime, profileWords } from './notes.ts';

// The thread of notes (the notes mock, part 2): each note with the moment it was left in, between
// rules; yours on the right in your blue, the agent's answer on the left with its mark and profile;
// a note still unanswered marked with the blue dot, the agent's side a dashed gap, as an empty
// required part is. A note on a piece of evidence cites it: the thumbnail leads to the piece.

// The piece of evidence a note is on, by the very file seen: the page finds it by its id.
const pieceSelector = (evidence: number) => `[data-ev-ids~="${evidence}"]`;

// The cited piece scrolled to and lit, as the mock's flash: a ring of your blue that fades.
export function showPiece(evidence: number): void {
  const el = document.querySelector<HTMLElement>(pieceSelector(evidence));
  if (!el) return;
  const still = reduced();
  el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
  const lit = el.querySelector<HTMLElement>('[data-ev-stage]') ?? el;
  lit.animate(
    still
      ? [{ outlineColor: 'var(--you)' }, { outlineColor: 'transparent' }]
      : [
          { boxShadow: '0 0 0 0 transparent' },
          { boxShadow: '0 0 0 3px var(--you)', offset: 0.2 },
          { boxShadow: '0 0 0 0 transparent' },
        ],
    { duration: still ? 600 : 1400, easing: C.settle },
  );
}

// A piece of evidence as a small thumbnail: the image itself, a recording's first frame, or a
// file drawn as lines of text.
export function Thumb({
  evidence,
  filename,
}: {
  evidence: Evidence | undefined;
  filename: string;
}) {
  const url = useFileUrl();
  if (evidence?.kind === 'image')
    return (
      <span className="nt-tb">
        <img src={url(evidence)} alt="" loading="lazy" />
      </span>
    );
  if (evidence?.kind === 'video')
    return (
      <span className="nt-tb" aria-hidden="true">
        <video src={url(evidence)} muted preload="metadata" tabIndex={-1} />
      </span>
    );
  return (
    <span className="nt-tb file" aria-hidden="true" title={filename}>
      <i style={{ width: '70%' }} />
      <i className="m" style={{ width: '55%' }} />
      <i className="p" style={{ width: '80%' }} />
      <i className="p" style={{ width: '60%' }} />
      <i style={{ width: '45%' }} />
    </span>
  );
}

const moment = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

function Cite({ anchor, evidence }: { anchor: NoteAnchor; evidence: Evidence | undefined }) {
  const small = [
    anchor.partName,
    anchor.seconds === undefined ? null : t('notes.at', { time: moment(anchor.seconds) }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      type="button"
      className="nt-cite"
      title={t('notes.cite', { file: anchor.filename })}
      onClick={() => showPiece(anchor.evidence)}
    >
      <Thumb evidence={evidence} filename={anchor.filename} />
      <span className="tx">
        <b>{anchor.filename}</b>
        {small ? <small>{small}</small> : null}
      </span>
    </button>
  );
}

function Exchange({
  note,
  evidence,
  now,
  agent,
}: {
  note: ItemNote;
  evidence: readonly Evidence[];
  now: number;
  agent: string | null;
}) {
  const open = !note.answer;
  const cited = note.anchor ? evidence.find(({ id }) => id === note.anchor?.evidence) : undefined;
  const who = note.answer?.by ?? note.to ?? agent;
  const profile = profileWords(note.answer?.profile);
  return (
    <div className="nt-ex" data-note={note.note}>
      <div className="when">
        <span className="w">{noteContext(note, now)}</span>
      </div>
      <div className={open ? 'nt-msg you open' : 'nt-msg you'}>
        {note.anchor ? <Cite anchor={note.anchor} evidence={cited} /> : null}
        <q>{note.text}</q>
        <div className="by">
          {open ? (
            <>
              <span className="nt-un">{t('notes.open')}</span>
              <span>·</span>
            </>
          ) : null}
          <b>{t('notes.you')}</b>
          <span>· {noteTime(note.at, now)}</span>
        </div>
      </div>
      {note.answer ? (
        <div className="nt-msg ag">
          <div className="by">
            <AgentMark name={note.answer.by} decorative />
            <span className="nm">{note.answer.by}</span>
            {profile ? <span className="prof">({profile})</span> : null}
            <span>· {noteTime(note.answer.at, now)}</span>
          </div>
          <q>{note.answer.text}</q>
        </div>
      ) : (
        <div className="nt-msg wait">
          <p>{who ? t('notes.waiting', { agent: who }) : t('notes.waitingAny')}</p>
          <small>{t('notes.waitingSmall')}</small>
        </div>
      )}
    </div>
  );
}

// The thread of a round's notes, oldest first.
export function Thread({
  notes,
  evidence,
  now,
  agent,
}: {
  notes: readonly ItemNote[];
  evidence: readonly Evidence[];
  now: number;
  agent: string | null;
}) {
  return (
    <div className="nt-thread">
      {notes.map((note) => (
        <Exchange key={note.note} note={note} evidence={evidence} now={now} agent={agent} />
      ))}
    </div>
  );
}

// "3 notas" over "1 sin respuesta" (or "todas contestadas"), for a margin label or a phone's.
export function countWords(notes: readonly ItemNote[]): { count: string; state: string } {
  const { count, unanswered } = notesCount(notes);
  return {
    count: t('notes.count', { count }),
    state: unanswered
      ? t('notes.unanswered', { count: unanswered })
      : t('notes.allAnswered', { count }),
  };
}

// The notes section of the body while the agent works: the round's thread under «Notas».
export function NotesSection({
  notes,
  evidence,
  now,
  agent,
}: {
  notes: readonly ItemNote[];
  evidence: readonly Evidence[];
  now: number;
  agent: string | null;
}) {
  const words = countWords(notes);
  const open = notesCount(notes).unanswered > 0;
  return (
    <section className="d-sec nt-sec" data-key="notes" id="nt-thread">
      <div className="margin-label">
        {t('notes.title')}
        <span className={open ? 'you' : undefined}>
          {words.count}
          <br />
          {words.state}
        </span>
      </div>
      <Thread notes={notes} evidence={evidence} now={now} agent={agent} />
    </section>
  );
}

// «Sobre qué»: the pieces attached in the round so far, and «Ninguna» first; one picked.
export function AnchorPicker({
  pieces,
  picked,
  onPick,
  strip = false,
}: {
  pieces: readonly Evidence[];
  picked: number | null;
  onPick: (evidence: number | null) => void;
  strip?: boolean;
}) {
  return (
    <div
      className={strip ? 'nt-apick strip' : 'nt-apick'}
      role="radiogroup"
      aria-label={t('notes.anchor.aria')}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: thumbnails to pick from, as a gallery's */}
      <button
        type="button"
        className="nt-ap"
        role="radio"
        aria-checked={picked === null}
        onClick={() => onPick(null)}
      >
        <span className="nt-tb none">{t('notes.anchor.none').toLowerCase()}</span>
        <span className="nm">{t('notes.anchor.none')}</span>
      </button>
      {pieces.map((e) => (
        // biome-ignore lint/a11y/useSemanticElements: thumbnails to pick from, as a gallery's
        <button
          key={e.id}
          type="button"
          className="nt-ap"
          role="radio"
          aria-checked={picked === e.id}
          title={e.filename}
          onClick={() => onPick(e.id)}
        >
          <Thumb evidence={e} filename={e.filename} />
          <span className="nm">{e.filename}</span>
        </button>
      ))}
    </div>
  );
}

// A round's notes inside its card in Rondas: while the round is being done, a line that leads to
// the thread; once handed off, the thread itself, folded under «3 notas mientras la hacía».
export function RoundNotesLine({
  notes,
  live,
  evidence,
  now,
}: {
  notes: readonly ItemNote[];
  live: boolean;
  evidence: readonly Evidence[];
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const body = useId();
  const { count, unanswered } = notesCount(notes);
  if (count === 0) return null;
  if (live)
    return (
      <button
        type="button"
        className="rn-notes"
        onClick={() =>
          document
            .getElementById('nt-thread')
            ?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' })
        }
      >
        <b>{t('notes.round.live', { count })}</b>
        {unanswered ? (
          <span className="nt-un">{t('notes.unanswered', { count: unanswered })}</span>
        ) : (
          <span className="st">{t('notes.allAnswered', { count })}</span>
        )}
      </button>
    );
  return (
    <div className="rn-fold" data-open={open || undefined}>
      <button
        type="button"
        className="rn-notes"
        aria-expanded={open}
        aria-controls={body}
        onClick={() => setOpen(!open)}
      >
        <Icon name="chevron" />
        <b>{t('notes.round.done', { count })}</b>
        {unanswered ? (
          <span className="nt-un">{t('notes.unanswered', { count: unanswered })}</span>
        ) : (
          <span className="st">{t('notes.allAnswered', { count })}</span>
        )}
      </button>
      <div className="rn-body" id={body}>
        <div className="rn-inner" inert={!open}>
          <Thread notes={notes} evidence={evidence} now={now} agent={null} />
        </div>
      </div>
    </div>
  );
}
