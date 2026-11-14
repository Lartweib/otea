import { useMemo, useRef, useState } from 'react';
import { isClosed, NOTE_REF, positionOf } from '../../../../src/core/board/engine.ts';
import { SAME, stepById } from '../../../../src/core/board/model.ts';
import { waitsOf } from '../../actions.ts';
import { typeOfItem, useApp } from '../../app/context.tsx';
import { boardOfCollection, boardsOf, useBoards } from '../../board-studio/home/boards-store.ts';
import { noteAnchor } from '../../components/evidence/video-moment.ts';
import { t, tx } from '../../i18n/i18n.ts';
import { TypeIcon } from '../../icons/TypeIcon.tsx';
import { GhostButton, Icon, StepPill, Swap, toast } from '../../kit/index.ts';
import { laneOf } from '../../lanes/geometry.ts';
import { lookOf } from '../../lanes/looks.ts';
import { NodeGlyph } from '../../lanes/NodeGlyph.tsx';
import { ItemTypeScope, stateWord, stateWordIn, typeWord } from '../../preset-words.ts';
import { studioHash } from '../../selection.ts';
import type { ItemView, RelatedItem } from '../../types.ts';
import { useStudioBoard } from '../board/studio-board.tsx';
import { Acts, actsModeOf } from './Acts.tsx';
import {
  BranchLine,
  DraftRequestLine,
  type DropChoice,
  DropDialog,
  HandChecklist,
  LinksSection,
  PartOfLine,
  PartsSection,
  RoundNotes,
  WaitChecklist,
} from './BoardSections.tsx';
import { Body, bodySections } from './Body.tsx';
import {
  approvalRefusal,
  backOf,
  boardItemOf,
  branchStrip,
  handRefusal,
  handRows,
  type ItemBoardBlock,
  linksOf,
  ownStepOf,
  railStep,
  roundStartOf,
  selectOnFold,
  sheetLook,
  stepRounds,
  waitRows,
} from './board-item.ts';
import { Details, detailCells } from './Details.tsx';
import { boardFactsOf, factsOf, standAgentOf, standOf } from './facts.ts';
import { toastOf } from './frame.ts';
import { History } from './History.tsx';
import { historyOf } from './history.ts';
import { type MoveChoice, planMoves } from './moves.ts';
import { NotesForm } from './NotesForm.tsx';
import { AnchorPicker, NotesSection, RoundNotesLine } from './NotesThread.tsx';
import {
  anchorPieces,
  notedOn,
  notesCount,
  quietMinutes,
  roundNotesOf,
  threadOf,
} from './notes.ts';
import { PhoneItem } from './PhoneItem.tsx';
import { Route } from './Route.tsx';
import { routeIndex, routeSteps } from './route.ts';

// The item's sheet content (SPEC §10.3): the bar, the headline and standfirst, the route, the moves,
// Details, the body and History, laid out stacked or, from a 1240 px sheet, in two columns.

export type SheetNav = { prev: boolean; next: boolean };

type ItemSheetProps = {
  item: ItemView;
  full: boolean;
  nav: SheetNav;
  onNav: (dir: -1 | 1) => void;
  onFull: () => void;
  onClose: () => void;
};

const quietFor = (iso: string | undefined, now: number): string | null => {
  if (!iso) return null;
  const m = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000));
  return m < 60
    ? t('when.minutes', { minutes: m })
    : t('when.hours', { hours: Math.round(m / 60) });
};

const dipWhen = (iso: string, now: number): string => {
  const day = (ms: number) => new Date(ms).toDateString();
  if (day(Date.parse(iso)) === day(now)) return t('sheet.when.today');
  if (day(Date.parse(iso)) === day(now - 86_400_000)) return t('sheet.when.yesterday');
  const lang = document.documentElement.lang || undefined;
  const within = now - Date.parse(iso) < 6 * 86_400_000;
  const fmt = new Intl.DateTimeFormat(
    lang,
    within ? { weekday: 'long' } : { day: 'numeric', month: 'short' },
  );
  return t('sheet.when.on', { day: fmt.format(Date.parse(iso)) });
};

export function ItemSheet({ item, full, nav, onNav, onFull, onClose }: ItemSheetProps) {
  const app = useApp();
  // The board this item is on, when Studio shapes it: Editar tablero opens its editor.
  const summaries = boardsOf(useBoards(app.version));
  const board = boardOfCollection(summaries, item.collection);
  const type = typeOfItem(item, app.collectionOf);
  const word = (s: string) => stateWord(type, s);
  const now = app.now;
  // On a published board the step engine says whose turn it is, the step's round and the route.
  const live = useStudioBoard(item.collection)?.live;
  const look = sheetLook(lookOf(item, now), live !== undefined);
  const onBoard = useMemo(
    () =>
      live
        ? boardItemOf(live, item, {
            done: t('bs.done'),
            dip: (n, at) => t('sheet.dip', { n, when: at ? dipWhen(at, now) : '' }),
          })
        : null,
    [live, item, now],
  );
  // Your own step (Propuesta, Triar): yours to fill and hand off, not a review.
  const ownStep = live ? ownStepOf(live, item) : undefined;
  const facts = useMemo(() => {
    const read = factsOf(item, type, now);
    return onBoard ? boardFactsOf(read, item, onBoard, ownStep !== undefined) : read;
  }, [item, type, now, onBoard, ownStep]);
  const lane = onBoard?.route.lane ?? laneOf(item.turn);
  const planned = planMoves(item.transitions, { own: facts.own, word, waits: waitsOf(item) });

  // ---- what a Studio board adds: parts, links, waits, branch, rounds, motives (board-item.ts) ----
  const block = (item as ItemView & { board?: ItemBoardBlock }).board;
  const nameOf = (r: RelatedItem) => {
    const types = app.collectionOf(r.collection)?.types ?? [];
    const step = r.closes === 'done' ? t('bs.done') : stateWordIn(types, r.state);
    return { board: r.collection, step };
  };
  const links = live ? linksOf({ relations: item.relations, board: block }, nameOf) : null;
  const position = positionOf(item.state);
  const stepId = isClosed(position) ? null : position.step;
  const waits = live && links && stepId ? waitRows(live, stepId, links) : [];
  const strip = live ? branchStrip(live, item.state, item.fields) : null;
  const split = live?.split;
  const childSummary =
    split && split.board !== SAME ? summaries.find((b) => b.id === split.board) : undefined;
  const childCollection = split
    ? split.board === SAME
      ? item.collection
      : (childSummary?.collection ?? null)
    : null;
  const childItem = split
    ? split.board === SAME
      ? (live?.item ?? '')
      : (childSummary?.item ?? '')
    : '';
  const partsName =
    split && split.board !== SAME
      ? (links?.partsBoard ?? childSummary?.name ?? t('bi.parts.title'))
      : t('bi.parts.title');
  const roundsStep = live && stepId ? stepById(live, stepId) : undefined;
  // Every step it went through with its rounds, the step it is on last.
  const journey = live ? stepRounds(live, item.state, item.events) : [];
  // The step whose rounds the compare rail under Rondas shows: the one unfolded last there, else
  // the step it is on; named in the rail's title when the item went through several.
  const [chosen, setChosen] = useState<{ item: string; step?: string }>({ item: item.id });
  const chosenStep = chosen.item === item.id ? chosen.step : undefined;
  const rail = railStep(journey, chosenStep);
  const railName = journey.length > 1 ? journey.find(({ step }) => step === rail)?.name : undefined;
  const onFold = (step: string, opening: boolean) => {
    const next = selectOnFold(chosenStep, step, opening);
    setChosen(next === undefined ? { item: item.id } : { item: item.id, step: next });
  };
  const block0 = (item as ItemView & { board?: ItemBoardBlock }).board;
  const missing = block0?.missing ?? [];
  // On your own step the primary hands it off ("Entregar"), asking for the note when the step does.
  const deliver =
    ownStep && planned.primary
      ? {
          ...planned.primary,
          label: t('bi.move.deliver'),
          deliver: true,
          move: {
            ...planned.primary.move,
            reasonRequired:
              planned.primary.move.reasonRequired || missing.some(({ ref }) => ref === 'note'),
          },
        }
      : planned.primary;
  const plan = live
    ? {
        ...planned,
        primary: deliver,
        quiet: planned.quiet.map((c) => {
          const to = positionOf(c.move.to);
          if (c.kind !== 'sendback' || isClosed(to) || to.step === stepId) return c;
          return {
            ...c,
            label: t('bi.backTo', { step: stepById(live, to.step)?.name ?? to.step }),
          };
        }),
      }
    : planned;
  const motives = plan.close.some((c) => c.move.to.startsWith('dropped__'));
  const dropChoices: DropChoice[] = plan.close
    .filter((c) => !motives || c.move.to !== 'dropped')
    .map((c) => ({ to: c.move.to, name: word(c.move.to) }));
  const [dropping, setDropping] = useState(false);
  const drop = (choice: DropChoice, reason: string) => {
    setDropping(false);
    void app
      .move(
        item.id,
        choice.to,
        reason,
        t('bi.drop.done', { title: item.title, motive: choice.name }),
      )
      .catch(() => undefined);
  };
  const refuse = (c: MoveChoice) =>
    c.kind === 'approve'
      ? approvalRefusal(item.id, waits)
      : c.kind === 'own' && ownStep
        ? handRefusal(item.id, missing)
        : null;
  const hand = live && ownStep ? handRows(live, ownStep, missing) : [];

  // ---- notes to the agent while it does its step (the notes mock) ----
  const thread = useMemo(() => threadOf(block, item.events), [block, item.events]);
  const agentStep =
    live && roundsStep && !ownStep && !isClosed(position) && position.phase === 'doing'
      ? roundsStep
      : undefined;
  const round = onBoard?.round ?? 0;
  const roundNotes = agentStep ? roundNotesOf(thread, agentStep.id, round) : [];
  const { unanswered } = notesCount(roundNotes);
  const worker = block?.worker;
  const noteTo = worker?.name ?? facts.agent;
  // What the agent has to hand, read only: its parts, then the wait for your notes' answers.
  const agentHand = live && agentStep ? handRows(live, agentStep, missing) : [];
  const deliverable = agentHand.filter((r) => r.required && r.ref !== NOTE_REF);
  const had = { done: deliverable.filter((r) => r.ok).length, of: deliverable.length };
  const pieces = useMemo(
    () => (live && agentStep ? anchorPieces(item.evidence, roundStartOf(live, item)) : []),
    [live, agentStep, item],
  );
  const noted = useMemo(() => notedOn(thread), [thread]);
  // While the agent's question waits for you, you answer it rather than leave a note.
  const canNote = !!agentStep && app.session.canWrite && !item.asks;
  const mode = actsModeOf({
    look,
    canWrite: app.session.canWrite,
    question: facts.question,
    plan,
    asks: !!item.asks,
  });
  const steps = onBoard ? onBoard.route.steps : type ? routeSteps(type) : [];
  const ci = onBoard ? onBoard.route.ci : type ? routeIndex(type, item.state, facts.visited) : 0;
  const stand = standOf({
    look,
    agent: standAgentOf(facts, onBoard !== null && item.turn === 'agent'),
    round: facts.round,
    question: facts.question,
    own: facts.own,
    quiet: look === 'stuck' ? quietFor(item.expiredLease?.expiresAt, now) : null,
    left: facts.left,
  });
  const standText = tx(
    stand.key as 'sheet.stand.handedRound',
    {
      agent: <b>{stand.agent}</b>,
      round: stand.round ?? 0,
      ...(stand.time ? { time: stand.time } : {}),
    } as never,
  );
  const pathIndex = (state: string) => (type ? routeIndex(type, state, facts.visited) : -1);
  const presetDips = facts.sentBack.map((r) => ({
    at: pathIndex(r.state),
    label: t('sheet.dip', { n: r.n, when: dipWhen(r.at, now) }),
  }));

  // The notes form, drawn from the button that asked for it.
  const [notes, setNotes] = useState<{
    choice: MoveChoice;
    button: HTMLButtonElement;
    open: boolean;
    below: number | null;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const openNotes = (choice: MoveChoice, button: HTMLButtonElement) => {
    if (notes?.open && notes.choice.move.to === choice.move.to) {
      setNotes({ ...notes, open: false });
      return;
    }
    const below = root.current?.querySelector('.d-details')?.getBoundingClientRect().top ?? null;
    setNotes({ choice, button, open: true, below: notes ? null : below });
  };
  // The note to the agent at work, drawn from «Dejar una nota» as the notes form is.
  const [noting, setNoting] = useState<{
    button: HTMLButtonElement;
    open: boolean;
    below: number | null;
  } | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const toggleNote = (button: HTMLButtonElement) => {
    if (noting?.open) {
      setNoting({ ...noting, open: false });
      return;
    }
    const below = root.current?.querySelector('.d-details')?.getBoundingClientRect().top ?? null;
    setAnchor(null);
    setNoting({ button, open: true, below: noting ? null : below });
  };
  const postNote = (text: string, on?: { evidence: number; seconds?: number }) =>
    app.note(item.id, text, on).then(
      () => toast({ msg: t('notes.sent', { agent: who, title: item.title }), id: item.id }),
      () => toast({ msg: t('notes.failed'), id: item.id }),
    );
  const sendNote = (text: string) => {
    if (!noting) return;
    setNoting({ ...noting, open: false });
    // On a recording, the moment its player is at goes with the note.
    void postNote(text, noteAnchor(anchor));
  };
  const quiet = canNote ? quietMinutes(worker, now) : null;
  const who = noteTo ?? t('notes.anyAgent');
  // After the note: the agent has gone quiet, or how many deliverables were in and when it reads.
  const noteSays =
    quiet !== null
      ? t('notes.quiet', { agent: who, minutes: quiet })
      : [had.of > 0 ? t('notes.had', { done: had.done, count: had.of }) : null, t('notes.nextBeat')]
          .filter(Boolean)
          .join(' · ');
  const leave = canNote
    ? {
        open: !!noting?.open,
        says: tx('notes.leaveSays', { agent: <b>{who}</b> }),
        onToggle: toggleNote,
      }
    : undefined;
  const send = (text: string) => {
    if (!notes) return;
    const c = notes.choice;
    const kind = c.deliver ? 'deliver' : c.move.closes === 'done' ? 'close' : c.kind;
    setNotes({ ...notes, open: false });
    app
      .move(item.id, c.move.to, text, toastOf(kind, item.title, word(c.move.to)))
      .catch(() => toast({ msg: t('sheet.refused'), id: item.id }));
  };

  const cells = detailCells({
    item,
    type,
    facts,
    own: facts.own && look === 'yours',
    now,
    board: live ? { reviewer: roundsStep ? roundsStep.reviewer : 'none' } : undefined,
    agents: app.agents,
  });
  const canWrite = app.session.canWrite;
  const boardSections =
    live && links
      ? [
          ...(split && childCollection
            ? [
                {
                  key: 'bi:parts',
                  node: (
                    <PartsSection
                      item={item}
                      links={links}
                      boardName={partsName}
                      childItem={childItem}
                      childCollection={childCollection}
                      canWrite={canWrite}
                      now={now}
                    />
                  ),
                },
              ]
            : []),
          {
            key: 'bi:links',
            node: (
              <LinksSection
                item={item}
                links={links}
                canWrite={canWrite}
                now={now}
                boardOf={(x) => x.collection}
              />
            ),
          },
        ]
      : [];
  const only = journey.length === 1 ? journey[0]?.rounds : undefined;
  const hasNotes =
    journey.length > 1 ||
    thread.length > 0 ||
    (!!only && (only.length > 1 || (only[0]?.notes.length ?? 0) > 0));
  const sections = bodySections({
    item,
    type,
    facts,
    canWrite,
    now,
    board: live
      ? {
          options: new Set(
            Object.values(live.parts)
              .filter((p) => p.show === 'options')
              .map((p) => p.id),
          ),
          rounds: journey.length ? (
            <RoundNotes
              steps={journey}
              rail={rail}
              onFold={onFold}
              notes={(step, r) => (
                <RoundNotesLine
                  notes={roundNotesOf(thread, step, r)}
                  live={!!agentStep && step === agentStep.id && r === round}
                  evidence={item.evidence}
                  now={now}
                />
              )}
            />
          ) : null,
          // Where the board's layout places no Rondas, they come after the fields only when
          // there is something to say or a review to say it to.
          roundsAfter: hasNotes || (!!roundsStep && roundsStep.reviewer !== 'none'),
          sections: boardSections,
          steps: rail ? { def: live, step: rail } : { def: live },
          railName,
          noted,
        }
      : undefined,
  });
  // While the agent works, the round's thread comes first: it is all you can do there.
  if (agentStep && roundNotes.length)
    sections.unshift({
      key: 'notes',
      node: <NotesSection notes={roundNotes} evidence={item.evidence} now={now} agent={noteTo} />,
    });
  const lines = historyOf(item.events, type, word, now, live);
  const stateShown = word(item.state);
  const yours = item.turn === 'human';
  const route =
    steps.length > 0 ? (
      <Route
        id={item.id}
        steps={steps}
        words={onBoard ? onBoard.route.words : steps.map((s) => word(s.name))}
        ci={ci}
        lane={lane}
        look={look}
        dips={onBoard ? onBoard.route.dips : presetDips}
        phone={app.phone}
      />
    ) : null;

  if (app.phone) {
    // On the phone: what was delivered first, the rounds as one segment, the moves docked. What
    // was asked is the item's fields; the rounds, the evidence and the board's sections are
    // drawn by the delivery, and links and parts stay on the computer.
    const request = sections.filter(({ key }) => key.startsWith('f:'));
    const firstField = request[0]?.key.slice(2);
    return (
      <ItemTypeScope type={type}>
        <PhoneItem
          item={item}
          type={type}
          board={live ? { def: live, step: stepId } : undefined}
          look={look}
          facts={facts}
          plan={plan}
          mode={mode}
          word={word}
          stand={standText}
          route={route}
          checks={
            <>
              {hand.length ? (
                <HandChecklist item={item} rows={hand} canWrite={app.session.canWrite} />
              ) : null}
              {agentStep ? (
                <HandChecklist
                  item={item}
                  rows={agentHand}
                  canWrite={false}
                  notes={roundNotes.length ? { unanswered } : undefined}
                />
              ) : null}
              {live ? <WaitChecklist rows={waits} child={partsName} now={now} /> : null}
            </>
          }
          details={<Details cells={cells} k={`${item.state}:${item.updatedAt}`} />}
          detailsSummary={[facts.agent, typeWord(type, item.type), item.collection]
            .filter(Boolean)
            .join(' · ')}
          request={request.length ? <Body id={item.id} sections={request} /> : null}
          requestSummary={
            (firstField ? (item.fields[firstField] ?? '') : '').trim().split(/\n/)[0] ?? ''
          }
          refuse={live ? refuse : undefined}
          back={live ? (to: string) => backOf(live, item, to) : undefined}
          onClose={onClose}
          notes={
            live
              ? {
                  of: (n) => roundNotesOf(thread, stepId, n),
                  noted,
                  ...(canNote && agentStep
                    ? {
                        leave: {
                          round,
                          to: noteTo,
                          step: agentStep.name,
                          pieces,
                          says:
                            quiet !== null || had.of === 0
                              ? noteSays
                              : t('notes.had', { done: had.done, count: had.of }),
                          warn: quiet !== null,
                          send: (text: string, on: number | null) => postNote(text, noteAnchor(on)),
                        },
                      }
                    : {}),
                }
              : undefined
          }
        />
      </ItemTypeScope>
    );
  }

  return (
    <ItemTypeScope type={type}>
      <div className="d-grid" ref={root}>
        <div className="sheet-bar" data-c>
          <Swap k={`${item.state}:${item.turn}:${look}`} as="div" className="crumb" dy={3}>
            <NodeGlyph look={look} size={14} />
            <span className="id">{item.id}</span>
            <StepPill
              {...(yours
                ? { tone: 'you' as const }
                : item.turn === 'none'
                  ? { tone: 'none' as const }
                  : {})}
            >
              {stateShown}
            </StepPill>
            {yours ? <span className="turn">{t('sheet.yourTurn')}</span> : null}
            <span className="ttag">
              <TypeIcon name={type?.icon} size={13} />
              {t('sheet.typeBoard', { type: typeWord(type, item.type), board: item.collection })}
            </span>
          </Swap>
          <div className="bar-r">
            {app.session.canConfigure && !app.phone && board ? (
              <a className="ghost-btn cz" href={studioHash({ kind: 'board', board: board.id })}>
                <Icon name="sliders" />
                <span className="wl">{t('bs.home.editBoard')}</span>
              </a>
            ) : null}
            <GhostButton
              data-nav="-1"
              aria-label={t('sheet.prev')}
              disabled={!nav.prev}
              onClick={() => onNav(-1)}
            >
              ‹<span className="wl"> {t('sheet.prev')}</span>
            </GhostButton>
            <GhostButton
              data-nav="1"
              aria-label={t('sheet.next')}
              disabled={!nav.next}
              onClick={() => onNav(1)}
            >
              <span className="wl">{t('sheet.next')} </span>›
            </GhostButton>
            <i className="vr" />
            <GhostButton className="ampliar" onClick={onFull} aria-pressed={full}>
              <Swap k={full ? 'r' : 'a'} className="swp" dy={3} outT={200} inT={300}>
                <span className="wl">{full ? t('sheet.reduce') : t('sheet.expand')}</span>
              </Swap>
              <Icon name={full ? 'red' : 'amp'} />
            </GhostButton>
            <GhostButton className="closeb" onClick={onClose}>
              {app.phone ? t('sheet.back') : t('sheet.close')}
            </GhostButton>
          </div>
        </div>
        <div className="d-head">
          <h1 className="headline" data-c>
            {item.title}
          </h1>
          {links ? <PartOfLine parent={links.parent} /> : null}
          <div data-c>
            <Swap
              k={`${stand.key}:${stand.agent ?? ''}:${stand.round ?? ''}:${stand.time ?? ''}`}
              as="p"
              className="standfirst"
              dy={4}
            >
              {standText}
            </Swap>
          </div>
          {route}
          {hand.length ? (
            <HandChecklist item={item} rows={hand} canWrite={app.session.canWrite} />
          ) : null}
          {agentStep ? (
            <HandChecklist
              item={item}
              rows={agentHand}
              canWrite={false}
              notes={roundNotes.length ? { unanswered } : undefined}
            />
          ) : null}
          {live ? <WaitChecklist rows={waits} child={partsName} now={now} /> : null}
          <Acts
            onDrop={live && dropChoices.length ? () => setDropping(true) : undefined}
            refuse={live ? refuse : undefined}
            back={live ? (to: string) => backOf(live, item, to) : undefined}
            item={item}
            type={type}
            facts={facts}
            look={look}
            plan={plan}
            mode={mode}
            word={word}
            notesOpen={notes?.open ? notes.choice : null}
            onNotes={openNotes}
            note={leave}
          />
          <div className="notes-slot">
            {noting ? (
              <NotesForm
                key="note"
                open={noting.open}
                agent={noteTo}
                why={null}
                button={noting.button}
                belowTop={noting.below}
                words={{
                  title: t('notes.form.title'),
                  aside: t('notes.form.for', { agent: who }),
                  placeholder: t('notes.form.placeholder'),
                  aria: t('notes.form.aria', { agent: who }),
                  send: t('notes.form.send'),
                }}
                extra={
                  pieces.length ? (
                    <div className="nt-anchor" data-i>
                      <div className="nt-apick-l">
                        <b>{t('notes.anchor.label')}</b>
                        <span>{t('notes.anchor.gloss', { n: round })}</span>
                      </div>
                      <AnchorPicker pieces={pieces} picked={anchor} onPick={setAnchor} />
                    </div>
                  ) : null
                }
                says={quiet !== null ? <span className="nt-quiet">{noteSays}</span> : noteSays}
                onSend={sendNote}
                onCancel={() => setNoting({ ...noting, open: false })}
                onGone={() => setNoting((n) => (n && !n.open ? null : n))}
              />
            ) : null}
            {notes ? (
              <NotesForm
                key={notes.choice.move.to}
                open={notes.open}
                agent={facts.agent}
                why={notes.choice.kind === 'sendback' ? null : word(notes.choice.move.to)}
                button={notes.button}
                belowTop={notes.below}
                onSend={send}
                onCancel={() => setNotes({ ...notes, open: false })}
                onGone={() => setNotes((n) => (n && !n.open ? null : n))}
              />
            ) : null}
          </div>
          <BranchLine strip={strip} />
          {block?.request ? (
            <DraftRequestLine
              request={block.request}
              canConfigure={!!app.session.canConfigure && !app.phone}
            />
          ) : null}
        </div>
        {live ? (
          <DropDialog
            open={dropping}
            item={item}
            choices={dropChoices}
            onClose={() => setDropping(false)}
            onDrop={drop}
          />
        ) : null}
        <Details cells={cells} k={`${item.state}:${item.updatedAt}`} />
        <div className="d-line" />
        <Body id={item.id} sections={sections} />
        <History id={item.id} lines={lines} />
      </div>
    </ItemTypeScope>
  );
}
