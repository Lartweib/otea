import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
import { evidenceFileUrl } from '../../api.ts';
import { useApp } from '../../app/context.tsx';
import { t, tx } from '../../i18n/i18n.ts';
import { AgentMark, Button, Icon, StepPill } from '../../kit/index.ts';
import type { Look } from '../../lanes/looks.ts';
import { BottomSheet } from '../../phone/BottomSheet.tsx';
import { useKeyboardInset } from '../../phone/CaptureSheet.tsx';
import { roundsOf } from '../../rounds.ts';
import type { Evidence, ItemView, TypeView } from '../../types.ts';
import { evidenceWords } from '../toca/phone.ts';
import { spanText } from '../toca/words.ts';
import { Acts, type ActsMode } from './Acts.tsx';
import type { Facts } from './facts.ts';
import { toastOf } from './frame.ts';
import { type MoveChoice, type MovePlan, moveSaysOf } from './moves.ts';
import {
  compareFiles,
  type PhoneRound,
  phoneRounds,
  roundTagWord,
  splitEvidence,
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
  refuse?: ((choice: MoveChoice) => string | null) | undefined;
  back?: ((state: string) => { agent: string | null; round: number }) | undefined;
  onClose: () => void;
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

function Files({ evidence }: { evidence: readonly Evidence[] }) {
  const { images, files } = splitEvidence(evidence);
  return (
    <>
      {images.length ? (
        <div className="p-ev">
          {images.map((e) => (
            <a
              key={e.id}
              className="p-shot"
              href={evidenceFileUrl(e.id)}
              target="_blank"
              rel="noreferrer"
            >
              <img src={evidenceFileUrl(e.id)} alt={e.caption ?? e.filename} loading="lazy" />
              <span className="cap">{e.filename}</span>
            </a>
          ))}
        </div>
      ) : null}
      {files.length ? (
        <div className="p-files">
          {files.map((e) => (
            <a
              key={e.id}
              className="p-file"
              href={evidenceFileUrl(e.id)}
              target="_blank"
              rel="noreferrer"
            >
              <span className="fn">{e.filename}</span>
            </a>
          ))}
        </div>
      ) : null}
      {images.length + files.length === 0 ? (
        <p className="p-none">{t('phone.r.noEvidence')}</p>
      ) : null}
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

function RoundView({ r, newest, now }: { r: PhoneRound; newest: boolean; now: number }) {
  const { images, files } = splitEvidence(r.evidence);
  return (
    <>
      <section className="p-part" data-c>
        <Lab x={newest && r.n > 1 ? t('phone.r.newIn', { n: r.n }) : t('toca.round', { n: r.n })}>
          {t('phone.r.delivered')}
        </Lab>
        {r.note ? (
          <p className="p-text">{r.note}</p>
        ) : (
          <p className="p-text none">{t('phone.r.noNote')}</p>
        )}
        <div className="p-by">
          <AgentMark name={r.by} decorative />
          {r.by} · {t('sheet.ago', { time: spanText(now - Date.parse(r.at)) })}
        </div>
      </section>
      <section className="p-part" data-c>
        <Lab x={evidenceWords(images.length, files.length) || '—'}>{t('sheet.evidence')}</Lab>
        <Files evidence={r.evidence} />
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
      <p className="p-text">{r.note}</p>
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
  const [pick, setPick] = useState<number | 'compare' | null>(null);
  const shown = pick === 'compare' ? null : (rounds.find((r) => r.n === pick) ?? rounds[0] ?? null);
  const newest = rounds[0];
  const before = rounds[1];

  const [details, setDetails] = useState(false);
  const [request, setRequest] = useState(rounds.length === 0);

  // ---- the moves: Aprobar and Devolver docked; a note asked for in a sheet from below ----
  const dock = p.mode === 'moves' && app.session.canWrite;
  const sendback = plan.quiet.find((c) => c.kind === 'sendback' && !c.blocked);
  const primary = plan.primary && !plan.primary.blocked ? plan.primary : null;
  const docked = dock && (primary || sendback);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [refused, setRefused] = useState('');
  const [text, setText] = useState('');
  const backBtn = useRef<HTMLButtonElement>(null);
  const primaryBtn = useRef<HTMLButtonElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const inset = useKeyboardInset(!!asking?.open);

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
        <RoundView r={shown} newest={shown === newest} now={now} />
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

      {docked ? <div className="p-push" /> : null}
      {docked ? (
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
