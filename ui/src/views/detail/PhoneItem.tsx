import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { evidenceFileUrl } from '../../api.ts';
import { useApp } from '../../app/context.tsx';
import { EvidenceReader, type ReaderDecide } from '../../components/evidence/EvidenceViewer.tsx';
import { pickableOn, type ReaderPick } from '../../components/evidence/reader-pick.ts';
import { NoteText } from '../../components/NoteText.tsx';
import { t, tx } from '../../i18n/i18n.ts';
import { AgentMark, Button, Icon, StepPill } from '../../kit/index.ts';
import type { Look } from '../../lanes/looks.ts';
import { BottomSheet } from '../../phone/BottomSheet.tsx';
import { useKeyboardInset } from '../../phone/CaptureSheet.tsx';
import { valueWord } from '../../preset-words.ts';
import { roundsOf } from '../../rounds.ts';
import type { Evidence, ItemView, TypeView } from '../../types.ts';
import { evidenceWords } from '../toca/phone.ts';
import { spanText } from '../toca/words.ts';
import { Acts, type ActsMode } from './Acts.tsx';
import type { Facts } from './facts.ts';
import { toastOf } from './frame.ts';
import { type MoveChoice, type MovePlan, moveSaysOf } from './moves.ts';
import { AnchorPicker, countWords, showPiece, Thread } from './NotesThread.tsx';
import type { ItemNote } from './notes.ts';
import { useOpened } from './opened.ts';
import {
  compareFiles,
  fileMarks,
  handedFields,
  notesDock,
  type PhoneRound,
  partNames,
  phoneRounds,
  roundTagWord,
  splitEvidence,
  unopenedOf,
} from './phone-review.ts';

// Reviewing an item on the phone (mobile mock 2, 2b): what was delivered first (the round's note,
// its evidence, what you asked the round before), the rounds of the step as one segment (Ronda N ·
// … · Comparar), the rest folded under Detalles and Lo pedido, and Aprobar and Devolver docked at
// the bottom at 48 px. Devolver… opens a sheet from below with the note focused; it leaves the way
// it came. An item that is not on your turn is read only: the stuck one keeps Retomar and
// Reasignar, nothing closes or discards it here.

type PhoneItemProps = {
  item: ItemView;
  type: TypeView | undefined;
  // On a Studio board: its definition and the step the item is on (or, closed, none).
  board?: { def: BoardDefinition; step: string | null } | undefined;
  look: Look;
  facts: Facts;
  plan: MovePlan;
  mode: ActsMode;
  word: (state: string) => string;
  stand: ReactNode;
  // The route, the hand and wait checklists: drawn by the sheet, placed here.
  route: ReactNode;
  checks: ReactNode;
  details: ReactNode;
  detailsSummary: string;
  request: ReactNode;
  requestSummary: string;
  // What holds it back, what it holds back, implements or relates to, in any board (read only).
  links?: ReactNode | undefined;
  linksSummary?: string | undefined;
  refuse?: ((choice: MoveChoice) => string | null) | undefined;
  back?: ((state: string) => { agent: string | null; round: number }) | undefined;
  onClose: () => void;
  notes?: PhoneNotes | undefined;
};

// The person's notes on the phone (the notes mock, part 4): while the agent works, the round's
// thread and «Dejar una nota» docked, its sheet with the pieces as a strip; when reviewing, each
// round's notes folded under what was delivered.
export type PhoneNotes = {
  // While you review the step: a comment left from the reader, on a file, a line or a node, and
  // the line the reader says of it (it goes with a send-back, or stays a note if you approve).
  review?: {
    says: string;
    sendOn: (text: string, anchor: { evidence: number } & ReaderPick) => Promise<boolean>;
  };
  // The notes of a round of the step under review (or being done), by its number.
  of: (round: number) => ItemNote[];
  // How many notes are on each piece of evidence, by its id.
  noted: ReadonlyMap<number, number>;
  // While the agent does the step and you may write: the round's notes, who they go to, the round,
  // the pieces a note can be on, and the words after the note.
  leave?: {
    round: number;
    to: string | null;
    step: string;
    pieces: Evidence[];
    says: string;
    warn: boolean;
    send: (text: string, anchor: number | null) => void;
    // A note on a line or a diagram node of a piece, picked in the reader.
    sendOn: (text: string, anchor: { evidence: number } & ReaderPick) => Promise<boolean>;
  };
};

function Fold({
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={open ? 'p-fold-sec open' : 'p-fold-sec'} data-c>
      <button type="button" className="p-more" aria-expanded={open} onClick={onToggle}>
        <span className="l">{label}</span>
        <span className="s">{summary}</span>
        <Icon name="chevron" />
      </button>
      {open ? <div className="p-fold-body">{children}</div> : null}
    </div>
  );
}

function Lab({ children, x }: { children: ReactNode; x?: ReactNode }) {
  return (
    <div className="p-lab">
      <span>{children}</span>
      {x ? <span className="x">{x}</span> : null}
    </div>
  );
}

function Pin({ count }: { count: number | undefined }) {
  return count ? <span className="pin">{t('notes.count', { count })}</span> : null;
}

type Mark = 'new' | 'changed' | 'same';

const MARK_WORD: Record<Mark, () => string> = {
  new: () => t('phone.r.new'),
  changed: () => t('phone.r.changedFile'),
  same: () => t('phone.r.same'),
};

// The round's files: images as thumbnails, the rest as rows with their kind, each marked against
// the round before. A tap opens it in the reader, the desk's viewer for its kind, from where the
// others are a step away ("2 de 7"); nothing opens as a raw file.
function Files({
  evidence,
  noted,
  marks,
  parts,
  decide,
  comment,
  onSeen,
}: {
  evidence: readonly Evidence[];
  // While you review: a comment left from the reader (it goes with a send-back).
  comment?:
    | ((text: string, anchor: { evidence: number } & ReaderPick) => Promise<boolean>)
    | undefined;
  // The board part each file went to, by module id; a file without one reads by its kind.
  parts?: ReadonlyMap<string, string> | undefined;
  // Aprobar and Devolver from inside the reader, on the round that waits for your verdict.
  decide?: ReaderDecide | undefined;
  noted?: ReadonlyMap<number, number> | undefined;
  marks?: ReadonlyMap<number, Mark> | undefined;
  // A file shown in the reader, opened or stepped to.
  onSeen?: ((id: number) => void) | undefined;
}) {
  const { images, files } = splitEvidence(evidence);
  const order = [...images, ...files];
  const [at, setAt] = useState<number | null>(null);
  const seenId = at === null ? null : (order[at]?.id ?? null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per file shown
  useEffect(() => {
    if (seenId !== null) onSeen?.(seenId);
  }, [seenId]);
  const opened = useRef<HTMLElement | null>(null);
  const open = (e: Evidence, from: HTMLElement) => {
    opened.current = from;
    setAt(order.indexOf(e));
  };
  // A move from inside the reader: the sheet leaves first, then the move is made as from the dock,
  // so its note sheet or refusal shows where it always does.
  const after = (go: () => void) => () => {
    setAt(null);
    let tries = 0;
    const wait = () => {
      if (document.querySelector('.p-read') && tries++ < 90) requestAnimationFrame(wait);
      else go();
    };
    requestAnimationFrame(wait);
  };
  const deciding = decide
    ? {
        seen: decide.seen,
        notice: decide.notice,
        back: decide.back ? { ...decide.back, onClick: after(decide.back.onClick) } : undefined,
        approve: decide.approve
          ? { ...decide.approve, onClick: after(decide.approve.onClick) }
          : undefined,
      }
    : undefined;
  const mark = (e: Evidence) => {
    const m = marks?.get(e.id);
    return m ? <span className={`mk ${m}`}>{MARK_WORD[m]()}</span> : null;
  };
  return (
    <>
      {images.length ? (
        <div className="p-ev">
          {images.map((e) => (
            <button
              key={e.id}
              type="button"
              className="p-shot"
              data-ev-ids={e.id}
              aria-label={t('phone.r.read', { file: e.filename })}
              onClick={(ev) => open(e, ev.currentTarget)}
            >
              <img src={evidenceFileUrl(e.id)} alt="" loading="lazy" />
              <span className="cap">{e.filename}</span>
              {mark(e)}
              <Pin count={noted?.get(e.id)} />
            </button>
          ))}
        </div>
      ) : null}
      {files.length ? (
        <div className="p-files">
          {files.map((e) => (
            <button
              key={e.id}
              type="button"
              className="p-file"
              data-ev-ids={e.id}
              onClick={(ev) => open(e, ev.currentTarget)}
            >
              <span className="fn">{e.filename}</span>
              <span className="kd">
                {(e.module === null ? undefined : parts?.get(e.module)) ??
                  t(`evidence.kind.${e.kind}`)}
              </span>
              {mark(e)}
              <Pin count={noted?.get(e.id)} />
            </button>
          ))}
        </div>
      ) : null}
      {images.length + files.length === 0 ? (
        <p className="p-none">{t('phone.r.noEvidence')}</p>
      ) : null}
      <BottomSheet
        open={at !== null}
        label={t('phone.r.reader')}
        title={t('phone.r.reader')}
        className="p-sb p-read"
        from={() => opened.current}
        onClose={() => setAt(null)}
      >
        {at !== null ? (
          <div data-i="">
            <EvidenceReader
              evidence={order}
              at={at}
              onAt={setAt}
              phone
              decide={deciding}
              note={comment ? { onSend: (text, on) => comment(text, on) } : undefined}
            />
          </div>
        ) : null}
      </BottomSheet>
    </>
  );
}

function Quote({ text }: { text: string }) {
  return (
    <div className="p-asked">
      <q>{text}</q>
    </div>
  );
}

// A round's notes, folded under what was delivered: open the first time.
function RoundThread({
  notes,
  evidence,
  now,
}: {
  notes: readonly ItemNote[];
  evidence: readonly Evidence[];
  now: number;
}) {
  const [open, setOpen] = useState(true);
  if (notes.length === 0) return null;
  const words = countWords(notes);
  return (
    <Fold
      label={t('notes.phone.round')}
      summary={`${words.count}, ${words.state}`}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      <Thread notes={notes} evidence={evidence} now={now} agent={null} />
    </Fold>
  );
}

function RoundView({
  r,
  prior,
  newest,
  now,
  notes,
  parts,
  decide,
  comment,
  onSeen,
  handed,
}: {
  r: PhoneRound;
  // The fields the step handed off (Commit en main), on the newest round only: their values today.
  handed?: readonly { ref: string; name: string; value: string }[] | undefined;
  parts?: ReadonlyMap<string, string> | undefined;
  decide?: ReaderDecide | undefined;
  comment?:
    | ((text: string, anchor: { evidence: number } & ReaderPick) => Promise<boolean>)
    | undefined;
  // The round before it, to mark its files against.
  prior: PhoneRound | undefined;
  newest: boolean;
  now: number;
  notes?: PhoneNotes | undefined;
  onSeen?: ((id: number) => void) | undefined;
}) {
  const { images, files } = splitEvidence(r.evidence);
  return (
    <>
      <section className="p-part" data-c>
        <Lab x={newest && r.n > 1 ? t('phone.r.newIn', { n: r.n }) : t('toca.round', { n: r.n })}>
          {t('phone.r.delivered')}
        </Lab>
        {handed?.length ? (
          <dl className="p-handed">
            {handed.map((f) => (
              <div key={f.ref}>
                <dt>{f.name}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {r.note ? (
          <NoteText className="p-text" text={r.note} />
        ) : handed?.length ? null : (
          <p className="p-text none">{t('phone.r.noNote')}</p>
        )}
        <div className="p-by">
          <AgentMark name={r.by} decorative />
          {r.by} · {t('sheet.ago', { time: spanText(now - Date.parse(r.at)) })}
        </div>
      </section>
      {notes ? (
        <RoundThread key={r.n} notes={notes.of(r.n)} evidence={r.evidence} now={now} />
      ) : null}
      <section className="p-part" data-c>
        <Lab x={evidenceWords(images.length, files.length) || '—'}>{t('sheet.evidence')}</Lab>
        <Files
          evidence={r.evidence}
          noted={notes?.noted}
          marks={prior ? fileMarks(prior.evidence, r.evidence) : undefined}
          parts={parts}
          decide={decide}
          comment={comment}
          onSeen={onSeen}
        />
      </section>
      {r.asked ? (
        <section className="p-part" data-c>
          <Lab>{t('phone.r.asked', { n: r.asked.n })}</Lab>
          <Quote text={r.asked.text} />
        </section>
      ) : null}
      {r.reason ? (
        <section className="p-part" data-c>
          <Lab>{t('phone.r.yourNote')}</Lab>
          <Quote text={r.reason} />
        </section>
      ) : null}
    </>
  );
}

// Comparar, on the phone: one column, the two rounds' notes in order and the files marked by what
// changed; never two side by side.
function CompareView({ older, newer }: { older: PhoneRound; newer: PhoneRound }) {
  const changes = compareFiles(older.evidence, newer.evidence);
  const note = (r: PhoneRound) =>
    r.note ? (
      <NoteText className="p-text" text={r.note} />
    ) : (
      <p className="p-text none">{t('phone.r.noNote')}</p>
    );
  return (
    <>
      <section className="p-part" data-c>
        <Lab x={t('phone.r.changed', { a: older.n, b: newer.n })}>{t('phone.r.delivered')}</Lab>
        <div className="p-cmp was">
          <span className="k">{t('bi.rounds.round', { n: older.n })}</span>
          {note(older)}
          {older.reason ? <Quote text={older.reason} /> : null}
        </div>
        <div className="p-cmp">
          <span className="k">{t('bi.rounds.round', { n: newer.n })}</span>
          {note(newer)}
        </div>
      </section>
      <section className="p-part" data-c>
        <Lab x={t('phone.r.changed', { a: older.n, b: newer.n })}>{t('sheet.evidence')}</Lab>
        {changes.length ? (
          <div className="p-files">
            {changes.map((c) => (
              <div key={`${c.change}:${c.name}`} className={`p-file ${c.change}`}>
                <span className="fn">{c.name}</span>
                <span className="ch">
                  {c.change === 'new'
                    ? `+ ${t('phone.r.new')}`
                    : c.change === 'gone'
                      ? `− ${t('phone.r.gone')}`
                      : c.change === 'changed'
                        ? `~ ${t('phone.r.changedFile')}`
                        : t('phone.r.same')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-none">{t('phone.r.noEvidence')}</p>
        )}
      </section>
    </>
  );
}

type Asking = { choice: MoveChoice; open: boolean };

export function PhoneItem(p: PhoneItemProps) {
  const app = useApp();
  const { item, plan, facts, word } = p;
  const now = app.now;

  // ---- the rounds of the step under review, as rounds.ts reads them (the engine's numbers) ----
  const rounds = useMemo(() => {
    const board = p.board
      ? { def: p.board.def, ...(p.board.step ? { step: p.board.step } : {}) }
      : undefined;
    const read = roundsOf(item.events, item.evidence, p.type?.states ?? [], board);
    return phoneRounds(read, item.turn === 'human');
  }, [item.events, item.evidence, item.turn, p.type, p.board]);
  const parts = useMemo(() => (p.type ? partNames(p.type.layout) : undefined), [p.type]);
  const handed = useMemo(
    () =>
      p.board
        ? handedFields(p.board.def, p.board.step, item.fields).map((f) => ({
            ...f,
            value: valueWord(p.type, f.ref, f.value),
          }))
        : [],
    [p.board, p.type, item.fields],
  );
  const [pick, setPick] = useState<number | 'compare' | null>(null);
  const shown = pick === 'compare' ? null : (rounds.find((r) => r.n === pick) ?? rounds[0] ?? null);
  const newest = rounds[0];
  const before = rounds[1];

  // The files the person has opened in the reader, for Aprobar to say what is left unseen.
  const [seen, markSeen] = useOpened(item.id, app.session.canWrite);
  const unseen = newest ? unopenedOf(newest.evidence, seen) : { unopened: 0, total: 0 };

  const [details, setDetails] = useState(false);
  const [request, setRequest] = useState(rounds.length === 0);
  const [linked, setLinked] = useState(false);

  // ---- the moves: Aprobar and Devolver docked; a note asked for in a sheet from below ----
  const dock = p.mode === 'moves' && app.session.canWrite;
  const sendback = plan.quiet.find((c) => c.kind === 'sendback' && !c.blocked);
  const primary = plan.primary && !plan.primary.blocked ? plan.primary : null;
  const leave = notesDock(p.mode, app.session.canWrite) ? p.notes?.leave : undefined;
  const docked = (dock && (primary || sendback)) || !!leave;
  const [asking, setAsking] = useState<Asking | null>(null);
  const [refused, setRefused] = useState('');
  const [text, setText] = useState('');
  const backBtn = useRef<HTMLButtonElement>(null);
  const primaryBtn = useRef<HTMLButtonElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  // The note to the agent at work, in a sheet from below.
  const [noting, setNoting] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [anchor, setAnchor] = useState<number | null>(null);
  // The piece read in the reader to pick a line or node for the note, by its place among the pieces.
  const [pickIn, setPickIn] = useState<number | null>(null);
  const noteBtn = useRef<HTMLButtonElement>(null);
  const noteArea = useRef<HTMLTextAreaElement>(null);
  const inset = useKeyboardInset(!!asking?.open || noting || pickIn !== null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on each opening only
  useLayoutEffect(() => {
    if (noting) noteArea.current?.focus({ preventScroll: true });
  }, [noting]);
  const openNote = () => {
    setNoteText('');
    setAnchor(null);
    setNoting(true);
  };
  const sendNote = () => {
    if (!leave || !noteText.trim()) return;
    setNoting(false);
    leave.send(noteText.trim(), anchor);
  };
  const anchored = leave && anchor !== null ? leave.pieces.find((e) => e.id === anchor) : undefined;
  const pickable = anchored ? pickableOn(anchored) : null;
  // From the note sheet to the reader, the note begun carried along, to put it on a line or a node.
  const pickInPiece = () => {
    if (!leave || !anchored) return;
    setNoting(false);
    setPickIn(leave.pieces.indexOf(anchored));
  };
  const roundNotes = leave ? (p.notes?.of(leave.round) ?? []) : [];
  const noteWords = countWords(roundNotes);

  const make = (c: MoveChoice, reason = '') => {
    const kind = c.deliver ? 'deliver' : c.move.closes === 'done' ? 'close' : c.kind;
    app
      .move(item.id, c.move.to, reason, toastOf(kind, item.title, word(c.move.to)))
      .then(() => p.onClose())
      .catch(() => setRefused(t('sheet.refused')));
  };
  const ask = (c: MoveChoice) => {
    setText('');
    setAsking({ choice: c, open: true });
  };
  const choose = (c: MoveChoice) => {
    const no = p.refuse?.(c);
    if (no) {
      setRefused(no);
      return;
    }
    if (c.move.reasonRequired || c.kind === 'sendback') ask(c);
    else make(c);
  };
  // Aprobar and Devolver from inside the reader, as the dock has them: the newest round only.
  const readerDecide: ReaderDecide | undefined =
    docked && dock && (primary || sendback) && newest
      ? {
          seen: newest.evidence.filter((e) => seen.has(e.id)).length,
          notice: p.notes?.review?.says,
          back: sendback ? { label: sendback.label, onClick: () => choose(sendback) } : undefined,
          approve: primary ? { label: primary.label, onClick: () => choose(primary) } : undefined,
        }
      : undefined;
  const send = () => {
    if (!asking || !text.trim()) return;
    setAsking({ ...asking, open: false });
    make(asking.choice, text.trim());
  };

  // The note takes the focus as the sheet rises, so the keyboard comes up with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on each opening only
  useLayoutEffect(() => {
    if (asking?.open) area.current?.focus({ preventScroll: true });
  }, [asking?.open, asking?.choice]);

  const says = primary
    ? moveSaysOf(primary, { agent: facts.agent, round: facts.round, word, back: p.back })
    : null;
  const lands =
    asking?.choice.kind === 'sendback'
      ? (p.back?.(asking.choice.move.to) ?? { agent: facts.agent, round: facts.round + 1 })
      : null;
  const sheetTitle = asking
    ? asking.choice.kind === 'sendback'
      ? lands?.agent
        ? t('phone.sb.title', { agent: lands.agent })
        : t('phone.sb.titleAny')
      : asking.choice.label
    : '';
  const sheetSays = asking
    ? lands
      ? tx('phone.sb.to', { step: <b>{word(asking.choice.move.to)}</b>, n: lands.round })
      : (() => {
          const s = moveSaysOf(asking.choice, {
            agent: facts.agent,
            round: facts.round,
            word,
            back: p.back,
          });
          return (
            <>
              {s.verb} <b>→ {s.state}</b> · {s.tail}
            </>
          );
        })()
    : null;

  const backLabel =
    app.route.view === 'toca'
      ? t('phone.toca')
      : app.route.view === 'triage'
        ? t('toca.triage')
        : t('sheet.back');
  const yours = item.turn === 'human';

  return (
    <div className={docked ? 'p-item docked' : 'p-item'}>
      <div className="p-ihead" data-c>
        <button type="button" className="p-back" onClick={p.onClose}>
          <svg className="ic" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
          {backLabel}
        </button>
        <span className="id">{item.id}</span>
        <StepPill
          {...(yours
            ? { tone: 'you' as const }
            : item.turn === 'none'
              ? { tone: 'none' as const }
              : {})}
        >
          {word(item.state)}
        </StepPill>
      </div>
      <h1 className="headline p-title" data-c>
        {item.title}
      </h1>
      <p className="standfirst" data-c>
        {p.stand}
      </p>
      {p.route}
      {p.checks}
      {leave && roundNotes.length ? (
        <section className="p-part p-notes" data-c>
          <Lab x={<span className="you">{`${noteWords.count} · ${noteWords.state}`}</span>}>
            {t('notes.title')}
          </Lab>
          <Thread notes={roundNotes} evidence={item.evidence} now={now} agent={leave.to} />
        </section>
      ) : null}
      {docked ? null : (
        <Acts
          item={item}
          type={p.type}
          facts={facts}
          look={p.look}
          plan={{ ...plan, close: [] }}
          mode={p.mode}
          word={word}
          notesOpen={null}
          onNotes={() => undefined}
          back={p.back}
        />
      )}

      {rounds.length > 1 ? (
        <fieldset className="p-rseg" aria-label={t('bi.rounds.title')} data-c>
          {rounds.map((r) => (
            <button
              key={r.n}
              type="button"
              aria-pressed={shown?.n === r.n}
              onClick={() => setPick(r.n)}
            >
              {t('bi.rounds.round', { n: r.n })}
              <small>{roundTagWord(r.tag)}</small>
            </button>
          ))}
          <button
            type="button"
            aria-pressed={pick === 'compare'}
            onClick={() => setPick('compare')}
          >
            {t('phone.r.compare')}
            <small>
              {before?.n} → {newest?.n}
            </small>
          </button>
        </fieldset>
      ) : null}
      {pick === 'compare' && newest && before ? (
        <CompareView older={before} newer={newest} />
      ) : shown ? (
        <RoundView
          r={shown}
          prior={rounds.find((r) => r.n === shown.n - 1)}
          newest={shown === newest}
          now={now}
          notes={leave ? undefined : p.notes}
          parts={parts}
          decide={shown === newest ? readerDecide : undefined}
          comment={shown === newest ? p.notes?.review?.sendOn : undefined}
          onSeen={markSeen}
          handed={shown === newest ? handed : undefined}
        />
      ) : null}

      <Fold
        label={t('phone.r.details')}
        summary={p.detailsSummary}
        open={details}
        onToggle={() => setDetails((v) => !v)}
      >
        {p.details}
      </Fold>
      {p.request ? (
        <Fold
          label={t('phone.r.request')}
          summary={p.requestSummary}
          open={request}
          onToggle={() => setRequest((v) => !v)}
        >
          {p.request}
        </Fold>
      ) : null}
      {p.links ? (
        <Fold
          label={t('bi.links.title')}
          summary={p.linksSummary ?? ''}
          open={linked}
          onToggle={() => setLinked((v) => !v)}
        >
          {p.links}
        </Fold>
      ) : null}

      {docked ? <div className="p-push" /> : null}
      {docked && leave ? (
        <section className="p-dock" aria-label={t('phone.r.dock')}>
          <div className="btns">
            <button
              ref={noteBtn}
              type="button"
              className="btn quiet nt-dock"
              aria-haspopup="dialog"
              aria-expanded={noting}
              onClick={openNote}
            >
              <Icon name="note" />
              {t('notes.leave')}
            </button>
          </div>
          <p className="hint">{tx('notes.phone.hint', { beat: <b>{t('notes.phone.beat')}</b> })}</p>
        </section>
      ) : docked ? (
        <section className="p-dock" aria-label={t('phone.r.dock')}>
          <div className={primary && sendback ? 'btns two' : 'btns'}>
            {sendback ? (
              <button
                ref={backBtn}
                type="button"
                className="btn quiet"
                aria-haspopup="dialog"
                aria-expanded={!!asking?.open && asking.choice === sendback}
                onClick={() => choose(sendback)}
              >
                {sendback.label}
              </button>
            ) : null}
            {primary ? (
              <button
                ref={primaryBtn}
                type="button"
                className="btn primary"
                onClick={() => choose(primary)}
              >
                {primary.label}
              </button>
            ) : null}
          </div>
          {primary && unseen.unopened > 0 && !refused ? (
            <p className="hint unseen">
              {t('phone.r.unopened', { n: unseen.unopened, total: unseen.total })}
            </p>
          ) : null}
          {refused ? (
            <p className="hint warn" role="alert">
              {refused}
            </p>
          ) : says ? (
            <p className="hint">
              {says.verb} <b>→ {says.state}</b> · {says.tail}
            </p>
          ) : null}
        </section>
      ) : null}

      {leave ? (
        <BottomSheet
          open={noting}
          label={leave.to ? t('notes.phone.title', { agent: leave.to }) : t('notes.phone.titleAny')}
          title={leave.to ? t('notes.phone.title', { agent: leave.to }) : t('notes.phone.titleAny')}
          className="p-sb nt-sheet"
          style={{ '--kb': `${inset}px` } as CSSProperties}
          from={() => noteBtn.current}
          onClose={() => setNoting(false)}
        >
          <p className={leave.warn ? 'p-sb-to warn' : 'p-sb-to'} data-i="">
            {t('notes.phone.says')} ·{' '}
            <b>
              {leave.step} · {t('toca.round', { n: leave.round })}
            </b>{' '}
            · {leave.says}
          </p>
          <textarea
            ref={noteArea}
            className="p-sb-area"
            data-i=""
            rows={4}
            aria-label={t('notes.form.aria', { agent: leave.to ?? t('notes.anyAgent') })}
            placeholder={t('notes.form.placeholder')}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          {leave.pieces.length ? (
            <div className="nt-pstrip" data-i="">
              <div className="nt-apick-l">
                <b>{t('notes.anchor.label')}</b>
                <span>{t('notes.anchor.gloss', { n: leave.round })}</span>
              </div>
              <AnchorPicker pieces={leave.pieces} picked={anchor} onPick={setAnchor} strip />
              {pickable ? (
                <Button size="sm" variant="quiet" className="nt-pick-in" onClick={pickInPiece}>
                  {pickable === 'node'
                    ? t('notes.pick.inNode')
                    : pickable === 'spot'
                      ? t('notes.pick.inSpot')
                      : t('notes.pick.inLine')}
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="p-sb-acts" data-i="">
            <Button variant="quiet" onClick={() => setNoting(false)}>
              {t('phone.sb.cancel')}
            </Button>
            <Button variant="primary" disabled={!noteText.trim()} onClick={sendNote}>
              {t('notes.phone.send')}
            </Button>
          </div>
        </BottomSheet>
      ) : null}
      {leave ? (
        <BottomSheet
          open={pickIn !== null}
          label={t('phone.r.reader')}
          title={t('phone.r.reader')}
          className="p-sb p-read"
          style={{ '--kb': `${inset}px` } as CSSProperties}
          from={() => noteBtn.current}
          onClose={() => setPickIn(null)}
        >
          {pickIn !== null ? (
            <div data-i="">
              <EvidenceReader
                evidence={leave.pieces}
                at={pickIn}
                onAt={setPickIn}
                phone
                draft={noteText}
                note={{
                  onSend: (text, on) =>
                    leave.sendOn(text, on).then((went) => {
                      if (went) setPickIn(null);
                      return went;
                    }),
                }}
              />
            </div>
          ) : null}
        </BottomSheet>
      ) : null}
      <BottomSheet
        open={!!asking?.open}
        label={sheetTitle}
        title={sheetTitle}
        className="p-sb"
        style={{ '--kb': `${inset}px` } as CSSProperties}
        from={() => (asking?.choice === primary ? primaryBtn.current : backBtn.current)}
        onClose={() => setAsking((a) => (a ? { ...a, open: false } : a))}
        onClosed={() => setAsking((a) => (a?.open ? a : null))}
      >
        <p className="p-sb-to" data-i="">
          {sheetSays}
        </p>
        <textarea
          ref={area}
          className="p-sb-area"
          data-i=""
          rows={4}
          aria-label={t('phone.sb.note')}
          placeholder={t('phone.sb.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="p-sb-acts" data-i="">
          <Button variant="quiet" onClick={() => setAsking((a) => (a ? { ...a, open: false } : a))}>
            {t('phone.sb.cancel')}
          </Button>
          <Button variant="primary" disabled={!text.trim()} onClick={send}>
            {t('phone.sb.send')}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
