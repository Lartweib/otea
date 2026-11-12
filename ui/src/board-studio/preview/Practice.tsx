import { type ReactNode, useEffect, useRef, useState } from 'react';
import { DONE, stepById, type Target } from '../../../../src/core/board/model.ts';
import { listOf, t, tx } from '../../i18n/i18n.ts';
import { Dialog } from '../../kit/pop/Dialog.tsx';
import { Swap } from '../../kit/Swap.tsx';
import type { Look } from '../../lanes/looks.ts';
import { reduced } from '../../motion/reduced.ts';
import { Route } from '../../views/detail/Route.tsx';
import { targetName } from '../words.ts';
import type { PracticeDialogProps } from './dialogs.tsx';
import { Tick } from './ItemPreview.tsx';
import {
  approvePractice,
  fillPart,
  handOff,
  type PracticeLog,
  type PracticeState,
  pickWay,
  practiceView,
  restartPractice,
  sendBackPractice,
  startPractice,
} from './practice.ts';
import { definitionRoute } from './route.ts';
import { plainToast } from './toasts.tsx';

// Probar: a practice item through a copy of the draft. You play each part in turn (the agent that
// does a step, its reviewer, you), over the same step engine agents meet; the route shows where it
// stands, a send-back dips under your lane, and the log writes the history in sentences. Nothing
// is kept.

function logLine(state: PracticeState, entry: PracticeLog): ReactNode {
  const agent = (who: string | null) => who ?? t('bs.preview.anAgentCap');
  switch (entry.kind) {
    case 'created':
      return t(entry.again ? 'bs.preview.try.log.again' : 'bs.preview.try.log.created', {
        id: entry.id,
        step: entry.step,
      });
    case 'refused':
      return entry.by === 'you'
        ? t('bs.preview.try.log.refusedYou', { parts: listOf(entry.missing) })
        : t('bs.preview.try.log.refused', {
            who: entry.who ?? t('bs.preview.anAgent'),
            parts: listOf(entry.missing),
          });
    case 'handed':
      return entry.by === 'you'
        ? t('bs.preview.try.log.handedYou', { step: entry.step, n: entry.round })
        : t('bs.preview.try.log.handed', {
            who: agent(entry.who),
            step: entry.step,
            n: entry.round,
          });
    case 'approved':
      return entry.by === 'you'
        ? t('bs.preview.try.log.approvedYou', {
            step: entry.step,
            to: targetName(state.def, entry.to),
          })
        : t('bs.preview.try.log.approved', {
            who: agent(entry.who),
            step: entry.step,
            to: targetName(state.def, entry.to),
          });
    case 'sentBack':
      return t('bs.preview.try.log.sentBack', { step: entry.step, note: entry.note.slice(0, 60) });
    case 'again':
      return t('bs.preview.try.log.otherRound', { who: entry.who, step: entry.step });
    case 'done':
      return t('bs.preview.try.log.done', { id: entry.id });
  }
}

const isYou = (entry: PracticeLog) =>
  entry.kind === 'created' ||
  entry.kind === 'sentBack' ||
  (('by' in entry && entry.by === 'you') as boolean);

export function PracticeDialog({ draft, open, onClose }: PracticeDialogProps) {
  const [state, setState] = useState<PracticeState | null>(null);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLUListElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new practice each time it opens
  useEffect(() => {
    if (!open) return;
    const started = startPractice(draft.def);
    if (!started) {
      plainToast(t('bs.preview.try.noSteps'));
      onClose();
      return;
    }
    setState(started);
    setNoting(false);
    setNote('');
  }, [open]);

  const logLength = state?.log.length ?? 0;
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
    if (noting) noteRef.current?.focus();
  }, [noting]);

  if (!state) return null;
  const view = practiceView(state);
  const { def } = state;
  const step = view.closed ? undefined : stepById(def, view.step);
  const look: Look = view.closed
    ? 'done'
    : view.actor === 'you'
      ? 'yours'
      : view.phase === 'doing'
        ? 'working'
        : 'queued';
  const route = definitionRoute(
    def,
    view.closed ? DONE : { step: view.step, phase: view.phase },
    view.dips,
    { done: t('bs.done'), dip: (n) => t('bs.preview.dip', { n }) },
  );
  const act = (next: PracticeState) => setState(next);
  const agentName = view.agent ?? t('bs.preview.anAgent');
  const wayChips =
    view.ways.length > 1 ? (
      <div className="bsp-radios">
        {view.ways.map((way: Target) => (
          <button
            type="button"
            key={way}
            className={way === view.way ? 'chipb on' : 'chipb'}
            aria-pressed={way === view.way}
            onClick={() => act(pickWay(state, way))}
          >
            → {targetName(def, way)}
          </button>
        ))}
      </div>
    ) : null;

  let body: ReactNode;
  if (view.closed)
    body = (
      <>
        <p className="who">
          {tx('bs.preview.try.done', { id: <b>{state.id}</b>, item: def.item.toLocaleLowerCase() })}
        </p>
        <div className="bsp-pacts">
          <button type="button" className="btn primary" onClick={() => act(restartPractice(state))}>
            {t('bs.preview.try.again')}
          </button>
          <button type="button" className="btn quiet" onClick={onClose}>
            {t('bs.preview.try.close')}
          </button>
        </div>
      </>
    );
  else if (view.phase === 'doing' && step)
    body = (
      <>
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
          {view.checklist.length === 0 ? (
            <p className="bsp-fhint">{t('bs.preview.try.nothingAsked')}</p>
          ) : (
            view.checklist.map((row) => (
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
                    onClick={() => act(fillPart(state, row.ref))}
                  >
                    {t(row.evidence ? 'bs.preview.try.attach' : 'bs.preview.try.fill')}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        {step.reviewer === 'none' ? wayChips : null}
        <div className="bsp-pacts">
          <button type="button" className="btn primary" onClick={() => act(handOff(state))}>
            {step.reviewer === 'none'
              ? t('bs.preview.try.handOffTo', { to: targetName(def, view.way) })
              : t('bs.preview.try.handOff')}
          </button>
        </div>
      </>
    );
  else if (step && view.actor === 'you')
    body = (
      <>
        <p className="who">
          {tx('bs.preview.try.who.yourReview', { step: <b>{step.name}</b>, n: view.round })}
        </p>
        {wayChips}
        {noting ? (
          <>
            <textarea
              ref={noteRef}
              className="bsp-note-in"
              rows={2}
              value={note}
              placeholder={t('bs.preview.try.notePlaceholder')}
              aria-label={t('bs.preview.try.noteLabel')}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="bsp-pacts">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  const next = sendBackPractice(state, note);
                  act(next);
                  if (next.said?.kind !== 'note') {
                    setNoting(false);
                    setNote('');
                  } else noteRef.current?.focus();
                }}
              >
                {t('bs.preview.try.sendBack')}
              </button>
              <button type="button" className="btn quiet" onClick={() => setNoting(false)}>
                {t('bs.preview.try.cancel')}
              </button>
            </div>
          </>
        ) : (
          <div className="bsp-pacts">
            <button
              type="button"
              className="btn primary"
              onClick={() => act(approvePractice(state))}
            >
              {t('bs.preview.approve', { to: targetName(def, view.way) })}
            </button>
            <button type="button" className="btn quiet" onClick={() => setNoting(true)}>
              {t('bs.preview.sendBack')}
            </button>
          </div>
        )}
      </>
    );
  else if (step)
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
          <button type="button" className="btn primary" onClick={() => act(approvePractice(state))}>
            {t('bs.preview.approve', { to: targetName(def, view.way) })}
          </button>
          <button
            type="button"
            className="btn quiet"
            onClick={() => act(sendBackPractice(state, ''))}
          >
            {t('bs.preview.try.otherRound')}
          </button>
        </div>
      </>
    );

  const said = state.said;
  const saidText =
    said?.kind === 'refused'
      ? t('bs.preview.try.said.refused', { id: state.id, parts: listOf(said.missing) })
      : said?.kind === 'note'
        ? t('bs.preview.try.said.note')
        : said?.kind === 'back'
          ? `${t('bs.preview.try.said.back', { step: said.step, n: said.round })}${said.fresh ? ` ${t('bs.preview.try.said.fresh')}` : ''}`
          : '';
  const bodyKey = `${view.step}:${view.phase}:${view.round}:${view.closed}:${noting}:${view.way}:${view.checklist.map((r) => r.ok).join()}`;

  return (
    <Dialog
      open={open}
      label={t('bs.preview.try.label')}
      onClose={onClose}
      className="bsp-dialog xwide"
    >
      <div className="bsp-prac">
        <div className="banner" data-i="">
          <i />
          {t('bs.preview.try.banner')}
        </div>
        <h4 data-i="">
          {state.title} <span className="id">{state.id}</span>
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
        <div
          className={said?.kind === 'back' ? 'said' : said ? 'said warn' : 'said'}
          aria-live="polite"
        >
          <Swap k={saidText} as="p" dy={3}>
            {saidText}
          </Swap>
        </div>
        <ul className="log" data-i="" ref={logRef}>
          {state.log.map((entry, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the log only grows, in order
            <li key={i} className={isYou(entry) ? 'you' : undefined}>
              <i />
              <span>{logLine(state, entry)}</span>
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
