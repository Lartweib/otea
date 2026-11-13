import { type ReactNode, useEffect, useRef, useState } from 'react';
import { isClosed, type Linked } from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  DONE,
  guardedBranch,
  motiveById,
  stepById,
  type Target,
} from '../../../../src/core/board/model.ts';
import { listOf, listOr, t, tx } from '../../i18n/i18n.ts';
import { Dialog } from '../../kit/pop/Dialog.tsx';
import { Swap } from '../../kit/Swap.tsx';
import type { Look } from '../../lanes/looks.ts';
import { NodeGlyph } from '../../lanes/NodeGlyph.tsx';
import { reduced } from '../../motion/reduced.ts';
import { Route } from '../../views/detail/Route.tsx';
import { targetName } from '../words.ts';
import type { PracticeDialogProps } from './dialogs.tsx';
import { Tick } from './ItemPreview.tsx';
import {
  act,
  addPart,
  approvePractice,
  childFor,
  createFilled,
  dropPractice,
  fillPart,
  focusOn,
  handOff,
  itemAt,
  type PracticeLog,
  type PracticeRun,
  type PracticeSaid,
  type PracticeState,
  pickWay,
  practiceView,
  quickAction,
  quickStep,
  reopenPart,
  restartRun,
  runParts,
  sampleBlocker,
  sampleParts,
  sendBackPractice,
  simulate,
  startRun,
  takeBack,
  tryGate,
  writeNote,
} from './practice.ts';
import { definitionRoute } from './route.ts';
import { plainToast } from './toasts.tsx';

// Probar: practice items through a copy of the draft. You play each part in turn (the agent that
// does a step, its reviewer, you), over the same step engine agents meet; the route shows where it
// stands, a send-back dips under your lane, and the log writes the history in sentences. A pair
// practises its parent's item and the parts you create on the child board, in one tree. Nothing
// is kept. Every refusal is in plain words: the CLI's flags belong to Lo que lee el agente.

// A quoted text without its final period, so a sentence never ends «….».
export const qt = (text: string, n = 60): string =>
  text
    .trim()
    .replace(/[.。…]+$/, '')
    .slice(0, n);

const lower = (text: string) => text.toLocaleLowerCase();

const linkedList = (open: readonly Linked[]) =>
  open.map(({ id, step }) => (step ? `${id} (${step})` : id)).join(', ');

// "sus 2 Tareas de repo siguen sin terminar" (W6): every part open, some of them, or the only one.
function notFinished(open: number, total: number, label: string, item: string): string {
  if (total === 1) return t('bs.preview.try.parts.oneOpen', { item: lower(item) });
  if (open === total) return t('bs.preview.try.parts.allOpen', { n: total, label });
  return t('bs.preview.try.parts.someOpen', { count: open, total, label });
}

function logLine(run: PracticeRun, id: string, entry: PracticeLog): ReactNode {
  const item = run.items.find((state) => state.id === id) ?? run.items[0];
  const def = item?.def;
  const agent = (who: string | null) => who ?? t('bs.preview.anAgentCap');
  switch (entry.kind) {
    case 'created':
      if (entry.filled)
        return entry.parent
          ? t('bs.preview.try.log.createdFilledPart', { id: entry.id, parent: entry.parent })
          : t('bs.preview.try.log.createdFilled', { id: entry.id });
      if (entry.parent)
        return t('bs.preview.try.log.createdPart', {
          id: entry.id,
          step: entry.step,
          parent: entry.parent,
        });
      return t(entry.again ? 'bs.preview.try.log.again' : 'bs.preview.try.log.created', {
        id: entry.id,
        step: entry.step,
      });
    case 'skipped':
      return t('bs.preview.try.log.skipped', {
        id: entry.id,
        step: entry.step,
        first: entry.first,
      });
    case 'refused': {
      const parts = listOf([...entry.missing, ...(entry.note ? [t('bs.preview.try.aNote')] : [])]);
      return entry.by === 'you'
        ? t('bs.preview.try.log.refusedYou', { parts })
        : t('bs.preview.try.log.refused', { who: entry.who ?? t('bs.preview.anAgent'), parts });
    }
    case 'waited':
      if (entry.wait === 'blockers')
        return t('bs.preview.try.log.blocked', { id: entry.open[0]?.id ?? '' });
      return t('bs.preview.try.log.waited', {
        why: notFinished(
          entry.open.length,
          entry.total,
          entry.label,
          run.child?.item ?? def?.item ?? '',
        ),
      });
    case 'handed': {
      const note = entry.note ? t('bs.preview.try.log.withNote', { note: qt(entry.note) }) : '';
      if (entry.quick && entry.id)
        return entry.by === 'you'
          ? t(
              entry.filled
                ? 'bs.preview.try.log.quickHandedYouAll'
                : 'bs.preview.try.log.quickHandedYou',
              {
                step: entry.step,
                id: entry.id,
              },
            )
          : t(
              entry.filled ? 'bs.preview.try.log.quickHandedAll' : 'bs.preview.try.log.quickHanded',
              {
                who: agent(entry.who),
                step: entry.step,
                id: entry.id,
              },
            );
      return `${
        entry.by === 'you'
          ? t('bs.preview.try.log.handedYou', { step: entry.step, n: entry.round })
          : t('bs.preview.try.log.handed', {
              who: agent(entry.who),
              step: entry.step,
              n: entry.round,
            })
      }${note}.`;
    }
    case 'approved': {
      const to = def ? targetName(def, entry.to) : entry.to;
      if (entry.id)
        return entry.by === 'you'
          ? t('bs.preview.try.log.quickApprovedYou', { step: entry.step, id: entry.id, to })
          : t('bs.preview.try.log.quickApproved', {
              who: agent(entry.who),
              step: entry.step,
              id: entry.id,
              to,
            });
      return entry.by === 'you'
        ? t('bs.preview.try.log.approvedYou', { step: entry.step, to })
        : t('bs.preview.try.log.approved', { who: agent(entry.who), step: entry.step, to });
    }
    case 'approvalRefused':
      return t('bs.preview.try.log.approvalRefused', { id: entry.open[0]?.id ?? '' });
    case 'sentBack':
      return t('bs.preview.try.log.sentBack', { step: entry.step, note: qt(entry.note) });
    case 'again':
      return t('bs.preview.try.log.otherRound', { who: agent(entry.who), step: entry.step });
    case 'tookBack':
      return entry.by === 'you'
        ? t('bs.preview.try.log.tookBackYou', {
            id: entry.id,
            to: entry.to,
            reason: qt(entry.reason),
          })
        : t('bs.preview.try.log.tookBack', {
            who: agent(entry.who),
            id: entry.id,
            to: entry.to,
            reason: qt(entry.reason),
          });
    case 'dropped': {
      const as = entry.motive ? t('bs.preview.try.log.as', { motive: entry.motive }) : '';
      return entry.by === 'you'
        ? t('bs.preview.try.log.droppedYou', { id: entry.id, as, reason: qt(entry.reason) })
        : t('bs.preview.try.log.dropped', {
            who: agent(entry.who),
            id: entry.id,
            as,
            reason: qt(entry.reason),
          });
    }
    case 'gate':
      return t(
        entry.allowed ? 'bs.preview.try.log.gateAllowed' : 'bs.preview.try.log.gateRefused',
        {
          what: t(entry.action === 'push' ? 'bs.preview.try.git.push' : 'bs.preview.try.git.merge'),
        },
      );
    case 'simulated':
      if (entry.what === 'parts') return t('bs.preview.try.log.simParts', { label: entry.label });
      if (entry.what === 'blocker')
        return t('bs.preview.try.log.simBlocker', { id: entry.id ?? '' });
      return t('bs.preview.try.log.simReopen', { id: entry.id ?? '', step: entry.step ?? '' });
    case 'done':
      return t('bs.preview.try.log.done', { id: entry.id });
  }
}

const isYou = (entry: PracticeLog) =>
  entry.kind === 'created' ||
  entry.kind === 'sentBack' ||
  (('by' in entry && entry.by === 'you') as boolean);

// What Otea answered, in plain words.
function saidText(state: PracticeState, said: PracticeSaid | null): string {
  if (!said) return '';
  const id = state.id;
  switch (said.kind) {
    case 'refused':
      return t('bs.preview.try.said.refused', {
        id,
        parts: listOf([...said.missing, ...(said.note ? [t('bs.preview.try.aNote')] : [])]),
      });
    case 'waited':
      if (said.wait === 'blockers') {
        const by = said.open[0];
        return t('bs.preview.try.said.blocked', {
          id,
          by: by?.id ?? '',
          board: by?.board ?? '',
          step: by?.step ?? '',
        });
      }
      return t('bs.preview.try.said.waited', {
        id,
        why: notFinished(said.open.length, said.total, said.label, said.item),
        open: linkedList(said.open),
      });
    case 'approvalRefused':
      return t('bs.preview.try.said.approvalRefused', { id, open: linkedList(said.open) });
    case 'note':
      return t('bs.preview.try.said.note');
    case 'back':
      return `${t('bs.preview.try.said.back', { step: said.step, n: said.round })}${said.fresh ? ` ${t('bs.preview.try.said.fresh')}` : ''}${said.noted ? ` ${t('bs.preview.try.said.noteToo')}` : ''}`;
    case 'reason':
      return said.you
        ? t('bs.preview.try.said.reasonYou')
        : t('bs.preview.try.said.reason', { id });
    case 'tookBack':
      return said.you
        ? t('bs.preview.try.said.tookBackYou', { step: said.step, n: said.round })
        : t('bs.preview.try.said.tookBack', { id, step: said.step, n: said.round });
    case 'skipped':
      return t('bs.preview.try.said.skipped', { id, step: said.step, first: said.first });
    case 'dropRefused':
      if (said.why === 'motive')
        return said.agent
          ? t('bs.preview.try.said.dropMotive', { id, motives: listOr(said.motives) })
          : t('bs.preview.try.said.dropMotiveYou', { motives: listOr(said.motives) });
      return said.agent
        ? t('bs.preview.try.said.dropReason', { id })
        : t('bs.preview.try.said.dropReasonYou');
  }
}

// Subir cambios / Fusionar, answered in a sentence where the item stands (F2).
function gateSentence(state: PracticeState, round: number): string {
  const gate = state.gate;
  if (!gate) return '';
  const { def, id, position } = state;
  const what = t(gate.action === 'push' ? 'bs.preview.try.git.push' : 'bs.preview.try.git.merge');
  const verdict = t(
    gate.answer.allowed ? 'bs.preview.try.git.allowed' : 'bs.preview.try.git.refused',
    {
      what,
    },
  );
  const step = isClosed(position) ? undefined : stepById(def, position.step);
  const pushSteps = listOr(
    (guardedBranch(def)?.guard.push ?? []).map((ref) => stepById(def, ref)?.name ?? ref),
  );
  let why = '';
  switch (gate.answer.why) {
    case 'doing':
      why = t('bs.preview.try.git.doing', { id, step: step?.name ?? '' });
      break;
    case 'done':
      why = t('bs.preview.try.git.done', { id });
      break;
    case 'closed':
      why = t('bs.preview.try.git.closed', { id });
      break;
    case 'review': {
      why =
        step?.reviewer === 'any'
          ? t('bs.preview.try.git.reviewAgent', {
              id,
              who: t('bs.preview.anotherAgent'),
              step: step.name,
            })
          : t('bs.preview.try.git.reviewYou', { id, step: step?.name ?? '' });
      break;
    }
    case 'not_push_step':
      why = t('bs.preview.try.git.notPushStep', { id, step: step?.name ?? '', steps: pushSteps });
      break;
    case 'not_done':
      why = step
        ? t('bs.preview.try.git.notDone', { id, step: step.name, n: round })
        : t('bs.preview.try.git.notDoneDropped', { id });
      break;
    case 'unguarded':
      why = '';
  }
  return `${verdict}${why ? ` ${why}` : ''}`;
}

// Where an item of the practice stands, for the tree: its step and whose turn, or how it ended.
function whereText(item: PracticeState): string {
  const { def, position } = item;
  if (isClosed(position)) return position.closed === DONE ? t('bs.done') : t('bs.preview.dropped');
  const step = stepById(def, position.step);
  const quick = quickAction(item);
  const name = step?.name ?? '';
  const agent = quick?.agent ?? t('bs.preview.anAgent');
  if (position.phase === 'doing')
    return quick?.you
      ? t('bs.preview.try.tree.yourStep', { step: name })
      : t('bs.preview.try.tree.doing', { step: name, agent });
  return quick?.you
    ? t('bs.preview.try.tree.yourReview', { step: name })
    : t('bs.preview.try.tree.reviewing', { step: name, agent });
}

function lookOf(item: PracticeState): Look {
  const { position } = item;
  if (isClosed(position)) return position.closed === DONE ? 'done' : 'dropped';
  const quick = quickAction(item);
  if (quick?.you) return 'yours';
  return position.phase === 'doing' ? 'working' : 'queued';
}

function quickLabel(item: PracticeState): string {
  const quick = quickAction(item);
  if (!quick) return '';
  const agent = quick.agent ?? t('bs.preview.anAgent');
  if (quick.kind === 'handOff')
    return quick.you ? t('bs.preview.try.handOff') : t('bs.preview.try.quick.hands', { agent });
  return quick.you
    ? t('bs.preview.try.quick.approve')
    : t('bs.preview.try.quick.approves', { agent });
}

type Box = 'none' | 'note' | 'back' | 'drop';

export function PracticeDialog({ draft, pair, open, onClose }: PracticeDialogProps) {
  const [run, setRun] = useState<PracticeRun | null>(null);
  // What the body asks for now: a send-back note, a way back's reason, a discard.
  const [box, setBox] = useState<Box>('none');
  const [text, setText] = useState('');
  const [back, setBack] = useState<string | null>(null);
  const [motive, setMotive] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLUListElement>(null);
  const parentDef: BoardDefinition = pair ? pair.parent.def : draft.def;
  const childDef: BoardDefinition | null = pair ? pair.child.def : null;
  const onChild = pair !== undefined && pair.active === 'child';

  const reset = () => {
    setBox('none');
    setText('');
    setBack(null);
    setMotive(null);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new practice each time it opens
  useEffect(() => {
    if (!open) return;
    const started = startRun(parentDef, childDef, onChild);
    if (!started) {
      const empty = childDef && childDef.steps.length === 0 ? childDef : parentDef;
      plainToast(
        pair ? t('bs.preview.try.noStepsOn', { board: empty.name }) : t('bs.preview.try.noSteps'),
      );
      onClose();
      return;
    }
    setRun(started);
    reset();
  }, [open]);

  const logLength = run?.log.length ?? 0;
  useEffect(() => {
    const list = logRef.current;
    if (!list || logLength === 0) return;
    list.scrollTop = list.scrollHeight;
    if (!reduced())
      list.lastElementChild?.animate(
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 360, easing: 'ease-out' },
      );
  }, [logLength]);

  useEffect(() => {
    if (box === 'note' || box === 'back' || box === 'drop') boxRef.current?.focus();
  }, [box]);

  const state = run ? itemAt(run) : undefined;
  if (!run || !state) return null;
  const child = childFor(run);
  const view = practiceView(state, child);
  const { def } = state;
  const step = view.closed ? undefined : stepById(def, view.step);
  const look = lookOf(state);
  const route = definitionRoute(
    def,
    view.closed ? DONE : { step: view.step, phase: view.phase },
    view.dips,
    { done: t('bs.done'), dip: (n) => t('bs.preview.dip', { n }) },
  );
  const play = (change: (s: PracticeState, c: BoardDefinition | undefined) => PracticeState) => {
    setRun(act(run, change));
  };
  const agentName = view.agent ?? t('bs.preview.anAgent');
  const kids = run.items.slice(1);
  const parentItem = run.items[0];
  const isPart = state.parent !== null;

  const wayChips =
    view.ways.length > 1 ? (
      <div className="bsp-radios">
        {view.ways.map((way: Target) => (
          <button
            type="button"
            key={way}
            className={way === view.way ? 'chipb on' : 'chipb'}
            aria-pressed={way === view.way}
            onClick={() => play((s) => pickWay(s, way))}
          >
            → {targetName(def, way)}
          </button>
        ))}
      </div>
    ) : null;

  const dropButton = (
    <button
      type="button"
      className="btn text"
      onClick={() => {
        reset();
        setBox('drop');
      }}
    >
      {view.dropsAs === 'agent'
        ? t('bs.preview.try.dropAs', { agent: agentName })
        : t('bs.preview.try.drop')}
    </button>
  );

  const gitLine = view.guarded ? (
    <div className="gitln">
      <span className="pvtag">{t('bs.preview.try.git.try')}</span>
      <button type="button" className="chipb" onClick={() => play((s) => tryGate(s, 'push'))}>
        {t('bs.preview.try.git.push')}
      </button>
      <button type="button" className="chipb" onClick={() => play((s) => tryGate(s, 'merge'))}>
        {t('bs.preview.try.git.merge')}
      </button>
      {state.gate ? (
        <span className={state.gate.answer.allowed ? 'gitans ok' : 'gitans'}>
          {gateSentence(state, view.round)}
        </span>
      ) : null}
    </div>
  ) : null;

  const partsRow = (row: Extract<(typeof view.waits)[number], { wait: 'parts' }>) => {
    const label = row.label ?? t('bs.preview.try.parts.its');
    const n = row.open.length;
    const first = row.open[0];
    let small: string;
    if (row.total === 0) small = t('bs.preview.try.parts.none');
    else if (n > 0)
      small = row.simulated
        ? t('bs.preview.try.parts.openSim', { n, total: row.total })
        : t('bs.preview.try.parts.open', {
            n,
            total: row.total,
            list: row.open
              .map(({ id, step: at }) => t('bs.preview.try.parts.at', { id, step: at ?? '' }))
              .join(', '),
          });
    else if (row.simulated) small = t('bs.preview.try.parts.nothingOpen');
    else
      small =
        row.total === 1
          ? t('bs.preview.try.parts.onlyDone')
          : t('bs.preview.try.parts.allDone', { n: row.total });
    let action: ReactNode = null;
    if (row.simulated && n > 0)
      action = (
        <button
          type="button"
          className="btn text sm"
          onClick={() => play((s) => simulate(s, 'parts', child))}
        >
          {t('bs.preview.try.parts.simulate', { label })}
        </button>
      );
    else if (!row.simulated && n > 0 && first) {
      const k = run.items.findIndex(({ id }) => id === first.id);
      action = (
        <button type="button" className="btn text sm" onClick={() => switchTo(k)}>
          {t('bs.preview.try.parts.play', { id: first.id })}
        </button>
      );
    } else if (!row.simulated && row.total === 0)
      action = (
        <button type="button" className="btn text sm" onClick={() => setRun(addPart(run))}>
          {t('bs.preview.try.parts.createOne')}
        </button>
      );
    return (
      <div key="wait:parts" className={n === 0 ? 'tk ok' : 'tk'}>
        <span className="bx">{n === 0 ? <Tick /> : null}</span>
        <span className="tn">
          {t('bs.preview.try.parts.name', { label })}
          <small>{small}</small>
        </span>
        {action}
      </div>
    );
  };

  const switchTo = (k: number) => {
    if (k < 0 || k === run.focus) return;
    reset();
    setRun(focusOn(run, k));
  };

  let body: ReactNode;
  if (view.closed) {
    const position = state.position;
    const motive =
      isClosed(position) && 'motive' in position && position.motive
        ? motiveById(def, position.motive)?.name
        : undefined;
    const { total } = runParts(run);
    const partsToo =
      !isPart && child && total > 0
        ? total === 1
          ? t('bs.preview.try.doneOnePart', { item: lower(child.item) })
          : t('bs.preview.try.doneParts', { n: total, board: child.name })
        : '';
    body = (
      <>
        <p className="who">
          {isClosed(position) && position.closed !== DONE
            ? tx('bs.preview.try.dropped', {
                motive: motive ? ` (${motive})` : '',
                id: <b>{state.id}</b>,
              })
            : tx('bs.preview.try.done', {
                id: <b>{state.id}</b>,
                parts: partsToo,
                item: lower(def.item),
              })}
        </p>
        {gitLine}
        <div className="bsp-pacts">
          {run.focus !== 0 && parentItem ? (
            <button type="button" className="btn primary" onClick={() => switchTo(0)}>
              {t('bs.preview.try.backTo', { id: parentItem.id })}
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                reset();
                setRun(restartRun(run, onChild));
              }}
            >
              {t('bs.preview.try.again')}
            </button>
          )}
          <button type="button" className="btn quiet" onClick={onClose}>
            {t('bs.preview.try.close')}
          </button>
        </div>
      </>
    );
  } else if (box === 'drop' && step) {
    const motives = def.drop.motives;
    body = (
      <div className="dropbox">
        <p className="who">
          {view.dropsAs === 'agent'
            ? tx('bs.preview.try.dropWho', { agent: <b>{agentName}</b> })
            : tx('bs.preview.try.dropWhoYou', { you: <b>{t('bs.preview.try.dropYou')}</b> })}
        </p>
        {motives.length ? (
          <div className="bsp-radios">
            {motives.map((choice) => (
              <button
                type="button"
                key={choice.id}
                className={motive === choice.id ? 'chipb on' : 'chipb'}
                aria-pressed={motive === choice.id}
                onClick={() => setMotive(choice.id)}
              >
                {choice.name}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={boxRef}
          className="bsp-note-in"
          rows={2}
          value={text}
          placeholder={t('bs.preview.try.dropPlaceholder')}
          aria-label={t('bs.preview.try.dropLabel')}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="bsp-pacts">
          <button
            type="button"
            className="btn quiet warn"
            onClick={() => {
              const next = act(run, (s) => dropPractice(s, motive, text));
              setRun(next);
              if (itemAt(next)?.said?.kind !== 'dropRefused') reset();
            }}
          >
            {t('bs.preview.try.dropGo')}
          </button>
          <button type="button" className="btn text" onClick={reset}>
            {t('bs.preview.try.cancel')}
          </button>
        </div>
      </div>
    );
  } else if (view.phase === 'doing' && step) {
    const next = def.steps[1];
    body = (
      <>
        {view.canSkip && next ? (
          <div className="skipln">
            <button
              type="button"
              className="btn quiet sm"
              onClick={() => play((s) => createFilled(s))}
            >
              {t('bs.preview.try.createFilled')}
            </button>
            <span className="pvtag">{t('bs.preview.try.startsAt', { step: next.name })}</span>
          </div>
        ) : null}
        <p className="who">
          {view.actor === 'you'
            ? tx('bs.preview.try.who.yourStep', { step: <b>{step.name}</b>, n: view.round })
            : view.agent === null
              ? tx('bs.preview.try.who.anyAgent', { step: <b>{step.name}</b>, n: view.round })
              : tx('bs.preview.try.who.agent', {
                  agent: <b>{agentName}</b>,
                  step: <b>{step.name}</b>,
                  n: view.round,
                })}
        </p>
        <div className="bsp-tasks">
          {view.note ? (
            <div className={state.note.trim() ? 'tk ok' : 'tk'}>
              <span className="bx">{state.note.trim() ? <Tick /> : null}</span>
              <span className="tn">
                {t('bs.preview.try.note')}
                <small>
                  {t(
                    view.note.req === 'always'
                      ? 'bs.preview.try.noteAlways'
                      : 'bs.preview.try.req.no',
                  )}
                </small>
                <input
                  className="tx pnote"
                  value={state.note}
                  aria-label={t('bs.preview.try.note')}
                  placeholder={view.note.hint || t('bs.preview.try.noteHint')}
                  onChange={(e) => play((s) => writeNote(s, e.target.value))}
                />
              </span>
              <span />
            </div>
          ) : null}
          {view.checklist.map((row) => (
            <div key={row.ref} className={row.ok ? 'tk ok' : 'tk'}>
              <span className="bx">{row.ok ? <Tick /> : null}</span>
              <span className="tn">
                {row.name}
                <small>
                  {t(
                    row.req === 'always'
                      ? row.fresh
                        ? 'bs.preview.try.req.fresh'
                        : 'bs.preview.try.req.always'
                      : row.req === 'when'
                        ? 'bs.preview.try.req.when'
                        : 'bs.preview.try.req.no',
                  )}
                </small>
              </span>
              {row.ok ? null : (
                <button
                  type="button"
                  className="btn text sm"
                  onClick={() => play((s) => fillPart(s, row.ref))}
                >
                  {t(row.evidence ? 'bs.preview.try.attach' : 'bs.preview.try.fill')}
                </button>
              )}
            </div>
          ))}
          {view.waits.map((row) => {
            if (row.wait === 'parts') return partsRow(row);
            const blocker = row.open[0];
            const sample = sampleBlocker(def);
            return (
              <div key="wait:blockers" className={blocker ? 'tk' : 'tk ok'}>
                <span className="bx">{blocker ? null : <Tick />}</span>
                <span className="tn">
                  {t('bs.preview.try.blockers.name')}
                  <small>
                    {blocker
                      ? t('bs.preview.try.blockers.open', {
                          id: blocker.id,
                          board: blocker.board,
                          step: blocker.step ?? '',
                        })
                      : t('bs.preview.check.ready')}
                  </small>
                </span>
                {blocker ? (
                  <button
                    type="button"
                    className="btn text sm"
                    onClick={() => play((s) => simulate(s, 'blocker'))}
                  >
                    {t('bs.preview.try.blockers.simulate', { id: sample.id })}
                  </button>
                ) : null}
              </div>
            );
          })}
          {view.checklist.length === 0 && !view.note && view.waits.length === 0 ? (
            <p className="bsp-fhint">{t('bs.preview.try.nothingAsked')}</p>
          ) : null}
        </div>
        {step.reviewer === 'none' ? wayChips : null}
        {box === 'back' && back ? (
          <>
            <textarea
              ref={boxRef}
              className="bsp-note-in"
              rows={2}
              value={text}
              placeholder={t(
                view.actor === 'you'
                  ? 'bs.preview.try.backPlaceholderYou'
                  : 'bs.preview.try.backPlaceholder',
              )}
              aria-label={t('bs.preview.try.backLabel')}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="bsp-pacts">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  const moved = act(run, (s) => takeBack(s, back, text));
                  setRun(moved);
                  if (itemAt(moved)?.said?.kind === 'reason') boxRef.current?.focus();
                  else reset();
                }}
              >
                {t(
                  view.actor === 'you' ? 'bs.preview.try.giveBackTo' : 'bs.preview.try.takeBackTo',
                  {
                    step: targetName(def, back),
                  },
                )}
              </button>
              <button type="button" className="btn quiet" onClick={reset}>
                {t('bs.preview.try.cancel')}
              </button>
            </div>
          </>
        ) : (
          <div className="bsp-pacts">
            <button
              type="button"
              className="btn primary"
              onClick={() => play((s, c) => handOff(s, c ? { child: c } : {}))}
            >
              {step.reviewer === 'none'
                ? t('bs.preview.try.handOffTo', { to: targetName(def, view.way) })
                : t('bs.preview.try.handOff')}
            </button>
            {view.backs.map((to) => (
              <button
                type="button"
                key={to}
                className="btn quiet"
                onClick={() => {
                  reset();
                  setBack(to);
                  setBox('back');
                }}
              >
                {t(
                  view.actor === 'you' ? 'bs.preview.try.giveBackTo' : 'bs.preview.try.takeBackTo',
                  {
                    step: targetName(def, to),
                  },
                )}
              </button>
            ))}
            {dropButton}
          </div>
        )}
        {gitLine}
      </>
    );
  } else if (step && view.actor === 'you') {
    const parts = view.waits.find((row) => row.wait === 'parts');
    const reopenable = !child
      ? null
      : kids.findIndex((kid) => isClosed(kid.position) && kid.position.closed === DONE);
    const samplePart = sampleParts(def, child)[0];
    body = (
      <>
        <p className="who">
          {tx('bs.preview.try.who.yourReview', { step: <b>{step.name}</b>, n: view.round })}
          {state.lastNote
            ? ` ${t('bs.preview.try.who.noteSays', { note: qt(state.lastNote, 200) })}`
            : ''}
        </p>
        {wayChips}
        {parts && child && reopenable !== null && reopenable >= 0 ? (
          <p className="mockline">
            {t('bs.preview.try.reopenAsk')}{' '}
            <button
              type="button"
              className="btn text sm"
              onClick={() => setRun(reopenPart(run, reopenable + 1))}
            >
              {t('bs.preview.try.reopen', { id: kids[reopenable]?.id ?? '' })}
            </button>
          </p>
        ) : parts && !child && parts.simulated && parts.open.length === 0 && samplePart ? (
          <p className="mockline">
            {t('bs.preview.try.reopenAsk')}{' '}
            <button
              type="button"
              className="btn text sm"
              onClick={() => play((s) => simulate(s, 'reopen'))}
            >
              {t('bs.preview.try.reopen', { id: samplePart.id })}
            </button>
          </p>
        ) : null}
        {box === 'note' ? (
          <>
            <textarea
              ref={boxRef}
              className="bsp-note-in"
              rows={2}
              value={text}
              placeholder={t('bs.preview.try.notePlaceholder')}
              aria-label={t('bs.preview.try.noteLabel')}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="bsp-pacts">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  const next = act(run, (s) => sendBackPractice(s, text));
                  setRun(next);
                  if (itemAt(next)?.said?.kind !== 'note') reset();
                  else boxRef.current?.focus();
                }}
              >
                {t('bs.preview.try.sendBack')}
              </button>
              <button type="button" className="btn quiet" onClick={reset}>
                {t('bs.preview.try.cancel')}
              </button>
            </div>
          </>
        ) : (
          <div className="bsp-pacts">
            <button
              type="button"
              className="btn primary"
              onClick={() => play((s, c) => approvePractice(s, c ? { child: c } : {}))}
            >
              {t('bs.preview.approve', { to: targetName(def, view.way) })}
            </button>
            <button
              type="button"
              className="btn quiet"
              onClick={() => {
                reset();
                setBox('note');
              }}
            >
              {t('bs.preview.sendBack')}
            </button>
            {dropButton}
          </div>
        )}
        {gitLine}
      </>
    );
  } else if (step)
    body = (
      <>
        <p className="who">
          {tx('bs.preview.try.who.reviewer', {
            agent: <b>{agentName}</b>,
            step: <b>{step.name}</b>,
            n: view.round,
          })}
        </p>
        {wayChips}
        <div className="bsp-pacts">
          <button
            type="button"
            className="btn primary"
            onClick={() => play((s, c) => approvePractice(s, c ? { child: c } : {}))}
          >
            {t('bs.preview.approve', { to: targetName(def, view.way) })}
          </button>
          <button
            type="button"
            className="btn quiet"
            onClick={() => play((s) => sendBackPractice(s, ''))}
          >
            {t('bs.preview.try.otherRound')}
          </button>
        </div>
        {gitLine}
      </>
    );

  const said = state.said;
  const words = saidText(state, said);
  const calm = said?.kind === 'back' || said?.kind === 'tookBack' || said?.kind === 'skipped';
  const bodyKey = `${state.id}:${view.step}:${view.phase}:${view.round}:${view.closed}:${box}:${back}:${view.way}:${view.checklist.map((r) => r.ok).join()}:${view.waits.map((w) => w.open.length).join()}:${view.canSkip}`;

  const tree =
    pair && childDef && parentItem ? (
      <div className="pkids" data-i="">
        <div className="pkh">
          <span className="margin-label">{t('bs.preview.try.tree.label')}</span>
          <span className="gloss">{t('bs.preview.try.tree.gloss')}</span>
        </div>
        <div className="pks">
          {run.items.map((item, k) => (
            <div
              key={item.id}
              className={`pk${k === run.focus ? ' on' : ''}${k > 0 ? ' kid' : ''}`}
            >
              <button
                type="button"
                className="pkm"
                aria-pressed={k === run.focus}
                onClick={() => switchTo(k)}
              >
                <NodeGlyph look={lookOf(item)} size={16} />
                <span className="pid">{item.id}</span>
                <span className="pt2">{item.title}</span>
                <span className="pst">{whereText(item)}</span>
              </button>
              {k > 0 && !isClosed(item.position) ? (
                <button
                  type="button"
                  className="btn text sm"
                  onClick={() => setRun(quickStep(run, k))}
                >
                  {quickLabel(item)}
                </button>
              ) : null}
            </div>
          ))}
          <div className="pk kid add">
            <button type="button" className="addbtn" onClick={() => setRun(addPart(run))}>
              <svg viewBox="0 0 16 16" aria-hidden="true" className="ic">
                <path
                  d="M8 3.5v9M3.5 8h9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              {t('bs.preview.try.tree.add', { item: childDef.item, parent: parentItem.id })}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <Dialog
      open={open}
      label={t(pair ? 'bs.preview.try.labelPair' : 'bs.preview.try.label')}
      onClose={onClose}
      size="lg"
      className="bsp-dialog"
    >
      <div className="bsp-prac">
        <div className="banner" data-i="">
          <i />
          {pair
            ? t('bs.preview.try.bannerPair', {
                parent: parentDef.name,
                child: childDef?.name ?? '',
              })
            : t('bs.preview.try.banner')}
        </div>
        <h4 data-i="">
          <Swap k={state.id} as="span" dy={3}>
            {state.title} <span className="id">{state.id}</span>
            {pair ? (
              <span className="pvtag hpart">
                {state.parent
                  ? t('bs.preview.try.partOf', {
                      parent: state.parent,
                      board: childDef?.name ?? '',
                    })
                  : parentDef.name}
              </span>
            ) : null}
          </Swap>
        </h4>
        <div className="bsp-route" data-i="">
          <Route
            id="practice"
            steps={route.steps}
            words={route.words}
            ci={route.ci}
            lane={route.lane}
            look={look}
            dips={route.dips}
            phone
          />
        </div>
        <div data-i="">
          <Swap k={bodyKey} as="div" dy={4}>
            {body}
          </Swap>
        </div>
        <div className={!said || calm ? 'said' : 'said warn'} aria-live="polite">
          <Swap k={words} as="p" dy={3}>
            {words}
          </Swap>
        </div>
        {tree}
        <ul className="log" data-i="" ref={logRef}>
          {run.log.map(({ id, entry }, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the log only grows, in order
            <li key={i} className={isYou(entry) ? 'you' : undefined}>
              <i />
              <span>{logLine(run, id, entry)}</span>
            </li>
          ))}
        </ul>
        <div className="dbtns" data-i="">
          <button type="button" className="btn text" onClick={onClose}>
            {t('bs.preview.try.closeShort')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
