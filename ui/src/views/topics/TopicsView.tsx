import { useCallback, useEffect, useRef, useState } from 'react';
import {
  closeTopicNow,
  convertTopicTo,
  createItem,
  fetchTopics,
  noteOnTopic,
  switchTopics,
} from '../../api.ts';
import { useApp } from '../../app/context.tsx';
import { currentProjectId, projectPage } from '../../base.ts';
import { FieldControl } from '../../components/FieldControl.tsx';
import { NoteText } from '../../components/NoteText.tsx';
import { useRemote } from '../../hooks.ts';
import { t } from '../../i18n/i18n.ts';
import { type FormValues, payloadOf } from '../../intake.ts';
import { intakeTypes } from '../../item-types.ts';
import { AgentMark, Button, GhostButton, toast } from '../../kit/index.ts';
import { fieldWord, valueWord } from '../../preset-words.ts';
import { hashFor, topicsHash } from '../../selection.ts';
import {
  conclusionOf,
  convertBoard,
  convertDraft,
  convertFields,
  convertReady,
  elsewhere,
  type FoundItem,
  type FoundTopic,
  followUpsOf,
  type ItemSaid,
  type ProjectRef,
  saidWho,
  type Topic,
  type TopicTurn,
  topicGroups,
  topicOfRoute,
} from '../../topics.ts';
import type { TypeView } from '../../types.ts';
import { noteTime } from '../detail/notes.ts';

// Temas (#/topics): the side questions you asked an agent off the work, each a short conversation.
// The list on the left, what was left hanging first; the topic open on the right as a thread in
// the notes' grammar: your question and notes on the right in your blue, the agent's answers on
// the left, each a summary with the full answer folded below it and where that text came from. On
// the phone the list and the topic are one page each.

function turnLabel(topic: Topic): string {
  if (topic.turn === 'human') return t('topics.turn.human');
  if (topic.turn === 'agent')
    return topic.agent ? t('topics.turn.agent', { agent: topic.agent }) : t('topics.turn.anyAgent');
  return t(`topics.state.${topic.state}`);
}

// A topic or item of another project (a search over every project) opens on that project's page,
// and says which project it is.
const keyOf = (found: { id: string; project?: ProjectRef }) =>
  `${found.project?.id ?? ''}:${found.id}`;

function ProjectMark({ project }: { project: ProjectRef | undefined }) {
  return project ? <span className="tp-proj">{project.name}</span> : null;
}

function Row({ topic, open }: { topic: FoundTopic; open: boolean }) {
  const answer = conclusionOf(topic);
  const more = followUpsOf(topic);
  const other = elsewhere(topic, currentProjectId());
  return (
    <li>
      <a
        className="tp-row"
        href={other ? projectPage(other.id, topicsHash(topic.id)) : topicsHash(topic.id)}
        aria-current={open ? 'true' : undefined}
        data-state={topic.state}
      >
        <span className="tp-id">{topic.id}</span>
        <span className="tp-title">{topic.title}</span>
        {answer || more > 0 ? (
          <span className="tp-sum">
            {answer?.text ?? ''}
            {more > 0 ? (
              <span className="tp-fu">
                {answer ? ' · ' : ''}
                {t('topics.followUps', { count: more })}
              </span>
            ) : null}
          </span>
        ) : null}
        <span className="tp-turn" data-turn={topic.turn}>
          {other ? (
            <>
              <ProjectMark project={other} />
              {' · '}
            </>
          ) : null}
          {turnLabel(topic)}
        </span>
      </a>
    </li>
  );
}

// A search with no hit in this project offers every project (`onEverywhere`): what was concluded
// is often kept in another one (P6-R3-8).
export function TopicList({
  topics,
  open,
  search,
  wide,
  onEverywhere,
}: {
  topics: readonly FoundTopic[];
  open: FoundTopic | undefined;
  search: string;
  wide: boolean;
  onEverywhere?: (() => void) | undefined;
}) {
  if (topics.length === 0)
    return (
      <>
        <p className="pane-message">
          {search === ''
            ? t('topics.empty')
            : t(wide ? 'topics.search.noneAnywhere' : 'topics.search.none', { words: search })}
        </p>
        {search !== '' && !wide && onEverywhere ? (
          <Button variant="quiet" onClick={onEverywhere}>
            {t('topics.search.tryEverywhere')}
          </Button>
        ) : null}
      </>
    );
  return (
    <nav className="tp-list" aria-label={t('topics.list')}>
      {topicGroups(topics).map((group) => (
        <section key={group.state} className="tp-group" data-state={group.state}>
          <h2 className="tp-gh">
            {t(`topics.state.${group.state}`)} <span className="n">{group.topics.length}</span>
          </h2>
          <ul>
            {group.topics.map((topic) => (
              <Row key={keyOf(topic)} topic={topic} open={topic === open} />
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

// An entry of an item found, after what it is and who said it: «Tu respuesta: …».
function Said({ said }: { said: ItemSaid }) {
  const who = saidWho(said);
  return (
    <span className="tp-sum" data-person={said.person ? '' : undefined}>
      {who ? <b className="tp-who">{who}: </b> : null}
      {said.said}
    </span>
  );
}

// A search looks in the items' threads too: a decision is often made there, not in a topic. Each
// item found shows what it said that holds the words, with the person's own words beside it when
// an agent's held more of them (P3C-R3-13), and opens the item.
function ItemHits({ items }: { items: readonly FoundItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="tp-group tp-items" aria-label={t('topics.items.title')}>
      <h2 className="tp-gh">
        {t('topics.items.title')} <span className="n">{items.length}</span>
      </h2>
      <ul>
        {items.map((item) => {
          const other = elsewhere(item, currentProjectId());
          return (
            <li key={keyOf(item)}>
              <a
                className="tp-row"
                href={other ? projectPage(other.id, hashFor(item.id)) : hashFor(item.id)}
              >
                <span className="tp-id">{item.id}</span>
                <span className="tp-title">{item.title}</span>
                {item.said === item.title && !item.theirs ? null : (
                  <span className="tp-said">
                    {item.said === item.title ? null : <Said said={item} />}
                    {item.theirs ? <Said said={item.theirs} /> : null}
                  </span>
                )}
                {other ? (
                  <span className="tp-turn">
                    <ProjectMark project={other} />
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Turn({ turn, now }: { turn: TopicTurn; now: number }) {
  if (turn.kind === 'event')
    return (
      <p className="tp-event">
        {t('topics.taskDeleted', { id: turn.text })}
        <span> · {noteTime(turn.at, now)}</span>
      </p>
    );
  if (turn.kind !== 'answer')
    return (
      <div className="nt-msg you">
        <NoteText className="nt-q" text={turn.text} />
        <div className="by">
          <b>{t('topics.you')}</b>
          <span>· {noteTime(turn.at, now)}</span>
        </div>
      </div>
    );
  return (
    <div className="nt-msg ag tp-answer">
      <div className="by">
        <AgentMark name={turn.by.name} decorative />
        <span className="nm">{turn.by.name}</span>
        <span>· {noteTime(turn.at, now)}</span>
      </div>
      <NoteText className="nt-q" text={turn.text} />
      {turn.full ? (
        <details className="tp-full">
          <summary>
            {t('topics.fullAnswer')}{' '}
            <span className="tp-src" data-source={turn.source ?? 'agent'}>
              · {t(turn.source === 'session' ? 'topics.source.session' : 'topics.source.agent')}
            </span>
          </summary>
          <NoteText className="nt-q" text={turn.full} />
        </details>
      ) : null}
    </div>
  );
}

function NoteBox({ topic, onDone }: { topic: Topic; onDone: (topic: Topic) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = () => {
    if (text.trim() === '' || busy) return;
    setBusy(true);
    noteOnTopic(topic.id, text).then(
      (next) => {
        setText('');
        setBusy(false);
        toast({ msg: t('topics.noted', { id: topic.id }) });
        onDone(next);
      },
      (error: unknown) => {
        setBusy(false);
        toast({ msg: error instanceof Error ? error.message : String(error) });
      },
    );
  };
  return (
    <div className="tp-note">
      <label className="tp-nl" htmlFor={`tp-note-${topic.id}`}>
        {t('topics.note.label')}
      </label>
      <textarea
        id={`tp-note-${topic.id}`}
        value={text}
        rows={2}
        placeholder={t('topics.note.placeholder')}
        onChange={(event) => setText(event.target.value)}
      />
      <Button variant="primary" size="sm" disabled={text.trim() === '' || busy} onClick={send}>
        {t('topics.note.send')}
      </Button>
    </div>
  );
}

function Convert({ topic, onDone }: { topic: Topic; onDone: (topic: Topic) => void }) {
  const app = useApp();
  const boards = app.collections.filter((c) => intakeTypes(c, undefined).length > 0);
  const [board, setBoard] = useState(() => convertBoard(topic, boards, app.all));
  const collection = app.collectionOf(board);
  const type = collection ? intakeTypes(collection, undefined)[0] : undefined;
  const [values, setValues] = useState<FormValues>({});
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Opening the form puts focus on its board; Cancelar hands it back to the button that opened it.
  const box = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    box.current?.querySelector<HTMLElement>(open ? 'select' : 'button')?.focus();
  }, [open]);
  const toggle = (next: boolean) => {
    moved.current = true;
    setOpen(next);
  };
  // Each board asks for its own fields: another board starts them again, the title kept.
  const start = (next: TypeView | undefined, title = topic.title) =>
    setValues(next ? { ...convertDraft(next, topic), title } : {});
  if (!open)
    return (
      <div className="tp-cv" ref={box}>
        <Button
          size="sm"
          onClick={() => {
            start(type);
            toggle(true);
          }}
          disabled={boards.length === 0}
        >
          {t('topics.convert')}
        </Button>
      </div>
    );
  const ready = type !== undefined && convertReady(type, values);
  const choose = (name: string) => {
    setBoard(name);
    const next = app.collectionOf(name);
    start(next ? intakeTypes(next, undefined)[0] : undefined, values.title ?? topic.title);
  };
  const go = () => {
    if (!collection || !type || !ready || busy) return;
    setBusy(true);
    setError(undefined);
    createItem(collection.name, type.name, payloadOf(values))
      .then((item) => convertTopicTo(topic.id, item.id).then((next) => ({ item, next })))
      .then(
        ({ item, next }) => {
          setBusy(false);
          setOpen(false);
          toast({ msg: t('topics.converted', { id: topic.id, item: item.id }) });
          onDone(next);
        },
        (failure: unknown) => {
          setBusy(false);
          setError(failure instanceof Error ? failure.message : String(failure));
        },
      );
  };
  return (
    <div className="tp-convert" ref={box}>
      <label>
        <span>{t('topics.convert.board')}</span>
        <select value={board} onChange={(event) => choose(event.target.value)}>
          {board === '' ? (
            <option value="" disabled>
              {t('topics.convert.pick')}
            </option>
          ) : null}
          {boards.map(({ name }) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {type
        ? convertFields(type).map((field) => (
            <div key={`${board}:${field.name}`} className="fwrap">
              <FieldControl
                id={`tp-convert-${topic.id}-${field.name}`}
                field={field}
                value={values[field.name] ?? ''}
                disabled={busy}
                onChange={(value) => setValues((was) => ({ ...was, [field.name]: value }))}
                label={
                  field.name === 'title' ? t('intake.titleField') : fieldWord(type, field.name)
                }
                word={(v) => valueWord(type, field.name, v)}
                hinted={false}
              />
            </div>
          ))
        : null}
      <Button variant="primary" size="sm" onClick={go} disabled={busy || !ready}>
        {t('topics.convert.go')}
      </Button>
      <GhostButton onClick={() => toggle(false)}>{t('topics.convert.cancel')}</GhostButton>
      {error ? (
        <p className="action-error" role="alert">
          {t('topics.convert.failed', { message: error })}
        </p>
      ) : null}
    </div>
  );
}

function TopicPage({
  topic,
  now,
  canWrite,
  onChange,
}: {
  topic: Topic;
  now: number;
  canWrite: boolean;
  onChange: (topic: Topic) => void;
}) {
  const live = topic.state !== 'closed' && topic.state !== 'task';
  const close = () =>
    closeTopicNow(topic.id).then(
      (next) => {
        toast({ msg: t('topics.closed', { id: topic.id }) });
        onChange(next);
      },
      (error: unknown) => toast({ msg: error instanceof Error ? error.message : String(error) }),
    );
  const waiting = live && topic.turn === 'agent';
  return (
    <article className="tp-topic" aria-labelledby={`tp-h-${topic.id}`}>
      <a className="tp-back" href={topicsHash()}>
        ← {t('topics.back')}
      </a>
      <header className="tp-th">
        <span className="tp-id">{topic.id}</span>
        <h2 id={`tp-h-${topic.id}`}>{topic.title}</h2>
        <span className="tp-turn" data-turn={topic.turn}>
          {turnLabel(topic)}
        </span>
      </header>
      {topic.resume ? (
        <p className="tp-resume">
          {t('topics.resume')}: <code>{topic.resume}</code>
        </p>
      ) : null}
      {topic.links.length > 0 ? (
        <p className="tp-links">
          {t('topics.links')}:{' '}
          {topic.links.map((id, index) => (
            <span key={id}>
              {index > 0 ? ', ' : null}
              <a href={hashFor(id)}>{id}</a>
            </span>
          ))}
        </p>
      ) : null}
      <div className="nt-thread tp-thread">
        {topic.turns.map((turn) => (
          <Turn key={turn.n} turn={turn} now={now} />
        ))}
        {waiting ? (
          <div className="nt-msg wait">
            <p>
              {topic.agent ? t('topics.waiting', { agent: topic.agent }) : t('topics.waitingAny')}
            </p>
          </div>
        ) : null}
      </div>
      {canWrite && topic.state !== 'task' ? (
        <div className="tp-acts">
          <NoteBox topic={topic} onDone={onChange} />
          {live ? (
            <div className="tp-moves">
              <Convert topic={topic} onDone={onChange} />
              <GhostButton onClick={close}>{t('topics.close')}</GhostButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

// What the search box holds, read once the person stops typing for a moment.
const SEARCH_PAUSE_MS = 250;

function useSettled(value: string): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value.trim()), SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="tp-search">
      <input
        type="search"
        value={value}
        aria-label={t('topics.search.label')}
        placeholder={t('topics.search.placeholder')}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function TopicsView({ topic: openId }: { topic: string | undefined }) {
  const app = useApp();
  const [all, setAll] = useState(false);
  const [bump, setBump] = useState(0);
  // A search looks in every topic, closed ones too: what was concluded before.
  const [typed, setTyped] = useState('');
  const search = useSettled(typed);
  // What was concluded about this project is often asked, and kept, in another (P6-R2-4).
  const [everywhere, setEverywhere] = useState(false);
  const wide = everywhere && search !== '';
  const load = useCallback(
    (signal: AbortSignal) => fetchTopics(signal, all, search, wide),
    [all, search, wide],
  );
  const remote = useRemote(load, app.version + bump, app.connection);
  const name = app.project?.name ?? '';
  const changed = () => setBump((n) => n + 1);
  const turnOn = () => switchTopics(true).then(changed, () => undefined);
  const view = remote.status === 'ready' ? remote.value : undefined;
  const open = view ? topicOfRoute(openId, view.topics, currentProjectId()) : undefined;
  return (
    <div className="page tp-page" data-open={open ? '' : undefined}>
      <header className="head" data-enter="head">
        <div className="kicker">
          <b>{t('topics.kicker')}</b> &nbsp;·&nbsp; {name}
        </div>
        <h1 className="display">{t('topics.display')}</h1>
        <p className="dek">{t('topics.dek')}</p>
      </header>
      <div className="tp-body" data-enter="fade">
        {remote.status !== 'ready' ? (
          <p className={remote.status === 'failed' ? 'pane-message action-error' : 'pane-message'}>
            {remote.status === 'failed' ? remote.message : t('common.loading')}
          </p>
        ) : !view?.on && view?.topics.length === 0 && search === '' ? (
          <div className="tp-off">
            <p className="pane-message">{t('topics.off')}</p>
            {app.session.canConfigure && !app.phone ? (
              <Button variant="primary" onClick={turnOn}>
                {t('topics.turnOn')}
              </Button>
            ) : (
              <p className="pane-message">{t('topics.offDesk')}</p>
            )}
          </div>
        ) : (
          <div className="tp-split">
            <div className="tp-side">
              <SearchBox value={typed} onChange={setTyped} />
              {search === '' ? null : (
                <label className="tp-all tp-everywhere">
                  <input
                    type="checkbox"
                    checked={everywhere}
                    onChange={(e) => setEverywhere(e.target.checked)}
                  />{' '}
                  {t('topics.search.everywhere')}
                </label>
              )}
              <TopicList
                topics={view?.topics ?? []}
                open={open}
                search={search}
                wide={wide}
                onEverywhere={() => setEverywhere(true)}
              />
              {search === '' ? null : <ItemHits items={view?.items ?? []} />}
              {search === '' ? (
                <label className="tp-all">
                  <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />{' '}
                  {t('topics.showClosed')}
                </label>
              ) : null}
            </div>
            <div className="tp-main">
              {open ? (
                <TopicPage
                  key={open.id}
                  topic={open}
                  now={app.now}
                  canWrite={app.session.canWrite}
                  onChange={changed}
                />
              ) : (
                <p className="pane-message tp-pick">{t('topics.pick')}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
