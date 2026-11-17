import { useCallback, useState } from 'react';
import {
  closeTopicNow,
  convertTopicTo,
  createItem,
  fetchTopics,
  noteOnTopic,
  switchTopics,
} from '../../api.ts';
import { useApp } from '../../app/context.tsx';
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
  convertDraft,
  convertFields,
  convertReady,
  lastAnswer,
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

function Row({ topic, open }: { topic: Topic; open: boolean }) {
  const answer = lastAnswer(topic);
  return (
    <li>
      <a
        className="tp-row"
        href={topicsHash(topic.id)}
        aria-current={open ? 'true' : undefined}
        data-state={topic.state}
      >
        <span className="tp-id">{topic.id}</span>
        <span className="tp-title">{topic.title}</span>
        {answer ? <span className="tp-sum">{answer.text}</span> : null}
        <span className="tp-turn" data-turn={topic.turn}>
          {turnLabel(topic)}
        </span>
      </a>
    </li>
  );
}

function List({ topics, open }: { topics: readonly Topic[]; open: string | undefined }) {
  if (topics.length === 0) return <p className="pane-message">{t('topics.empty')}</p>;
  return (
    <nav className="tp-list" aria-label={t('topics.list')}>
      {topicGroups(topics).map((group) => (
        <section key={group.state} className="tp-group" data-state={group.state}>
          <h2 className="tp-gh">
            {t(`topics.state.${group.state}`)} <span className="n">{group.topics.length}</span>
          </h2>
          <ul>
            {group.topics.map((topic) => (
              <Row key={topic.id} topic={topic} open={topic.id === open} />
            ))}
          </ul>
        </section>
      ))}
    </nav>
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
  const [board, setBoard] = useState(boards[0]?.name ?? '');
  const collection = app.collectionOf(board);
  const type = collection ? intakeTypes(collection, undefined)[0] : undefined;
  const [values, setValues] = useState<FormValues>({});
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Each board asks for its own fields: another board starts them again, the title kept.
  const start = (next: TypeView | undefined, title = topic.title) =>
    setValues(next ? { ...convertDraft(next, topic), title } : {});
  if (!open)
    return (
      <Button
        size="sm"
        onClick={() => {
          start(type);
          setOpen(true);
        }}
        disabled={boards.length === 0}
      >
        {t('topics.convert')}
      </Button>
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
    <div className="tp-convert">
      <label>
        <span>{t('topics.convert.board')}</span>
        <select value={board} onChange={(event) => choose(event.target.value)}>
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
      <GhostButton onClick={() => setOpen(false)}>{t('topics.convert.cancel')}</GhostButton>
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

export function TopicsView({ topic: openId }: { topic: string | undefined }) {
  const app = useApp();
  const [all, setAll] = useState(false);
  const [bump, setBump] = useState(0);
  const load = useCallback((signal: AbortSignal) => fetchTopics(signal, all), [all]);
  const remote = useRemote(load, app.version + bump, app.connection);
  const name = app.project?.name ?? '';
  const changed = () => setBump((n) => n + 1);
  const turnOn = () => switchTopics(true).then(changed, () => undefined);
  const view = remote.status === 'ready' ? remote.value : undefined;
  const open = view ? topicOfRoute(openId, view.topics) : undefined;
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
        ) : !view?.on && view?.topics.length === 0 ? (
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
              <List topics={view?.topics ?? []} open={open?.id} />
              <label className="tp-all">
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />{' '}
                {t('topics.showClosed')}
              </label>
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
