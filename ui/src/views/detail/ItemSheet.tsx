import { useMemo, useRef, useState } from 'react';
import { waitsOf } from '../../actions.ts';
import { typeOfItem, useApp } from '../../app/context.tsx';
import { t, tx } from '../../i18n/i18n.ts';
import { TypeIcon } from '../../icons/TypeIcon.tsx';
import { GhostButton, Icon, StepPill, Swap } from '../../kit/index.ts';
import { laneOf } from '../../lanes/geometry.ts';
import { lookOf } from '../../lanes/looks.ts';
import { NodeGlyph } from '../../lanes/NodeGlyph.tsx';
import { ItemTypeScope, stateWord, typeWord } from '../../preset-words.ts';
import type { ItemView } from '../../types.ts';
import { Acts, actsModeOf } from './Acts.tsx';
import { Body, bodySections } from './Body.tsx';
import { Details, detailCells } from './Details.tsx';
import { factsOf, standOf } from './facts.ts';
import { toastOf } from './frame.ts';
import { History } from './History.tsx';
import { historyOf } from './history.ts';
import { type MoveChoice, planMoves } from './moves.ts';
import { NotesForm } from './NotesForm.tsx';
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
  const type = typeOfItem(item, app.collectionOf);
  const word = (s: string) => stateWord(type, s);
  const now = app.now;
  const look = lookOf(item, now);
  const lane = laneOf(item.turn);
  const facts = useMemo(() => factsOf(item, type, now), [item, type, now]);
  const plan = planMoves(item.transitions, { own: facts.own, word, waits: waitsOf(item) });
  const mode = actsModeOf({ look, canWrite: app.session.canWrite, question: facts.question, plan });
  const steps = type ? routeSteps(type) : [];
  const ci = type ? routeIndex(type, item.state, facts.visited) : 0;
  const stand = standOf({
    look,
    agent: facts.left ? facts.agent : (facts.handed?.agent ?? facts.agent),
    round: facts.round,
    question: facts.question,
    own: facts.own,
    quiet: look === 'stuck' ? quietFor(item.expiredLease?.expiresAt, now) : null,
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
  const dips = facts.sentBack.map((r) => ({
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
  const send = (text: string) => {
    if (!notes) return;
    const c = notes.choice;
    const kind = c.move.closes === 'done' ? 'close' : c.kind;
    setNotes({ ...notes, open: false });
    void app.move(item.id, c.move.to, text, toastOf(kind, item.title, word(c.move.to)));
  };

  const cells = detailCells({ item, type, facts, own: facts.own && look === 'yours', now });
  const sections = bodySections({ item, type, facts, canWrite: app.session.canWrite, now });
  const lines = historyOf(item.events, type, word, now);
  const stateShown = word(item.state);
  const yours = item.turn === 'human';

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
            {app.session.canConfigure && !app.phone ? (
              <a className="ghost-btn cz" href={`#/customize/${encodeURIComponent(item.id)}`}>
                <Icon name="sliders" />
                <span className="wl">{t('sheet.customize')}</span>
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
          {steps.length > 0 ? (
            <Route
              id={item.id}
              steps={steps}
              words={steps.map((s) => word(s.name))}
              ci={ci}
              lane={lane}
              look={look}
              dips={dips}
              phone={app.phone}
            />
          ) : null}
          <Acts
            item={item}
            type={type}
            facts={facts}
            look={look}
            plan={plan}
            mode={mode}
            word={word}
            notesOpen={notes?.open ? notes.choice : null}
            onNotes={openNotes}
          />
          <div className="notes-slot">
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
        </div>
        <Details cells={cells} k={`${item.state}:${item.updatedAt}`} />
        <div className="d-line" />
        <Body id={item.id} sections={sections} />
        <History id={item.id} lines={lines} />
      </div>
    </ItemTypeScope>
  );
}
