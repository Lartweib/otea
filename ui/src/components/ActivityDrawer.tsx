import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ACTIVITY_KINDS,
  type ActivityKind,
  clockLeft,
  FEED_SIZE,
  type FeedEvent,
  type FeedLine,
  feedLines,
  type HeldLease,
  heldLeases,
  idleAgents,
  leftShare,
  mergeFeed,
  shownLines,
  turnLookup,
} from '../activity.ts';
import { fetchEvents } from '../api.ts';
import { agoLabel, momentLabel, relationSentence } from '../format.ts';
import type { Connection } from '../hooks.ts';
import { t, tx } from '../i18n/i18n.ts';
import { Button, Icon, NodeMark } from '../kit/index.ts';
import { hashFor } from '../selection.ts';
import type { CollectionView, Item } from '../types.ts';

// The log as the drawer holds it: the newest events, read once it opens and then after the last one
// on each change. Events past `seenUpTo` arrived while it was open and come in with a short fade.
type Feed = { events: FeedEvent[]; loaded: boolean; seenUpTo: number };

function useFeed(open: boolean, version: number): Feed {
  const [feed, setFeed] = useState<Feed>({ events: [], loaded: false, seenUpTo: 0 });
  const current = useRef(feed);
  current.current = feed;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version means the log grew
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const { loaded, events } = current.current;
    const query = loaded ? { since: events.at(-1)?.id ?? 0 } : { latest: FEED_SIZE };
    fetchEvents(query, controller.signal).then(
      (arrived) =>
        setFeed((was) => {
          const merged = mergeFeed(was.events, arrived);
          const seenUpTo = was.loaded ? was.seenUpTo : (merged.at(-1)?.id ?? 0);
          return { events: merged, loaded: true, seenUpTo };
        }),
      () => undefined,
    );
    return () => controller.abort();
  }, [open, version]);
  return feed;
}

// The drawer counts down to the second while it is open.
function useClock(open: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);
  return now;
}

const DIAL_R = 21;
const AROUND = 2 * Math.PI * DIAL_R;

// The time a lease has left, as an arc that drains around the agent's node.
function Dial({ share, held }: { share: number; held: boolean }) {
  return (
    <svg className="activity-dial" width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
      <circle className="activity-track" cx="26" cy="26" r={DIAL_R} />
      <circle
        className="activity-arc"
        data-held={held || undefined}
        cx="26"
        cy="26"
        r={DIAL_R}
        style={{ strokeDasharray: `${(share * AROUND).toFixed(2)} ${AROUND.toFixed(2)}` }}
      />
      <NodeMark kind={held ? 'working' : 'queued'} cx={26} cy={26} r={5.5} />
    </svg>
  );
}

const clockTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

function LeaseRow({ lease, now, onPick }: { lease: HeldLease; now: number; onPick: () => void }) {
  const left = Date.parse(lease.expiresAt) - now;
  const claimed = lease.claimedAt
    ? t('activity.claimedAt', { time: momentLabel(lease.claimedAt, now) })
    : undefined;
  const renewal = lease.renewedAt
    ? t('activity.renewed', { ago: agoLabel(lease.renewedAt, now) })
    : t('activity.noRenewal');
  return (
    <li>
      <button type="button" className="activity-agent" onClick={onPick}>
        <Dial share={leftShare(lease, now)} held />
        <span className="activity-agent-m">
          <span className="activity-agent-top">
            <span className="activity-name">{lease.holder}</span>
            <span className="activity-left">
              {clockLeft(lease.expiresAt, now)}
              <small>{left < 120_000 ? t('activity.soon') : t('activity.left')}</small>
            </span>
          </span>
          <span className="activity-item">
            <span className="t-id">{lease.item.id}</span>
            <span className="activity-title">{lease.item.title}</span>
          </span>
          <span className="t-cap">{claimed ? `${claimed} · ${renewal}` : renewal}</span>
        </span>
      </button>
    </li>
  );
}

function IdleRow({ name, last, now }: { name: string; last: FeedLine; now: number }) {
  return (
    <li>
      <div className="activity-agent" data-idle="">
        <Dial share={0} held={false} />
        <span className="activity-agent-m">
          <span className="activity-agent-top">
            <span className="activity-name">{name}</span>
            <span className="activity-left" data-idle="">
              {t('activity.idle')}
            </span>
          </span>
          <span className="activity-item">
            <span className="activity-title">{phraseOf(last)}</span>
          </span>
          <span className="t-cap">
            {t('activity.lastAct', { ago: agoLabel(last.event.at, now) })}
          </span>
        </span>
      </div>
    </li>
  );
}

// The sentence of a feed line, its item id set as an id.
function phraseOf({ phrase, event }: FeedLine): ReactNode {
  const id = <span className="t-id">{event.itemId}</span>;
  switch (phrase.key) {
    case 'activity.claimed':
      return tx(phrase.key, { id, time: phrase.time });
    case 'activity.claimedOver':
      return tx(phrase.key, { id, previous: phrase.previous });
    case 'activity.handed':
    case 'activity.moved':
    case 'activity.created':
      return tx(phrase.key, { id, state: phrase.state });
    case 'activity.attached':
      return tx(phrase.key, { id, file: phrase.file });
    case 'activity.linked':
    case 'activity.unlinked':
      return tx(phrase.key, { relation: relationSentence(phrase.kind, phrase.from, phrase.to) });
    case 'activity.other':
      return tx(phrase.key, { id, type: phrase.type });
    default:
      return tx(phrase.key, { id });
  }
}

type ActivityDrawerProps = {
  open: boolean;
  onClose: () => void;
  items: readonly Item[];
  collections: readonly CollectionView[];
  version: number;
  connection: Connection;
  // On a phone the drawer covers the list: picking an item closes it.
  phone: boolean;
};

// A drawer over the inbox: each lease an agent holds, draining in real time, then a calm feed of
// what just happened, newest first, an agent's acts on the left lane and yours on the right.
export function ActivityDrawer({
  open,
  onClose,
  items,
  collections,
  version,
  connection,
  phone,
}: ActivityDrawerProps) {
  const feed = useFeed(open, version);
  const now = useClock(open);
  const [kind, setKind] = useState<ActivityKind>('all');
  const [agent, setAgent] = useState<string | null>(null);
  const lines = feedLines(feed.events, turnLookup(items, collections));
  const held = heldLeases(items, feed.events, now);
  const idle = idleAgents(lines, held);
  const agents = [
    ...new Set([...held.map((lease) => lease.holder), ...idle.map((x) => x.name)]),
  ].sort((a, b) => a.localeCompare(b));
  const shown = shownLines(lines, kind, agent);
  const pick = (id: string) => () => {
    window.location.hash = hashFor(id);
    if (phone) onClose();
  };
  const clock = clockTime(new Date(now).toISOString());
  const busy = new Set(held.map((lease) => lease.holder)).size;
  return (
    <aside
      className="activity raised"
      data-open={open || undefined}
      aria-label={t('activity.label')}
      aria-hidden={!open || undefined}
      inert={!open}
      id="activity-drawer"
    >
      <header className="activity-head">
        <div>
          <h2 className="t-h">{t('activity.title')}</h2>
          <span className="t-cap">
            {t(connection === 'live' ? 'activity.live' : 'activity.offline', { time: clock })}
          </span>
        </div>
        <div className="activity-head-end">
          <span className="t-cap">{`${t('activity.holding', { count: busy })} · ${t('activity.idleCount', { count: idle.length })}`}</span>
          <Button size="sm" variant="quiet" onClick={onClose}>
            <Icon name="close" />
            {t('common.close')}
          </Button>
        </div>
      </header>
      {held.length + idle.length > 0 ? (
        <ul className="activity-agents" aria-label={t('activity.leases')}>
          {held.map((lease) => (
            <LeaseRow
              key={`${lease.holder} ${lease.item.id}`}
              lease={lease}
              now={now}
              onPick={pick(lease.item.id)}
            />
          ))}
          {idle.map(({ name, last }) => (
            <IdleRow key={name} name={name} last={last} now={now} />
          ))}
        </ul>
      ) : null}
      <div className="activity-filters">
        <fieldset className="activity-pills" aria-label={t('activity.kinds')}>
          {ACTIVITY_KINDS.map((each) => (
            <Button key={each} size="sm" aria-pressed={kind === each} onClick={() => setKind(each)}>
              {t(`activity.kind.${each}`)}
              <span className="activity-n">{shownLines(lines, each, agent).length}</span>
            </Button>
          ))}
        </fieldset>
        {agents.length > 0 ? (
          <fieldset className="activity-pills" aria-label={t('activity.from')}>
            <span className="t-label">{t('activity.from')}</span>
            {agents.map((name) => (
              <Button
                key={name}
                size="sm"
                aria-pressed={agent === name}
                onClick={() => setAgent((was) => (was === name ? null : name))}
              >
                {name}
              </Button>
            ))}
          </fieldset>
        ) : null}
      </div>
      <div className="activity-feed">
        {!feed.loaded ? (
          <p className="activity-empty t-small">{t('activity.loading')}</p>
        ) : lines.length === 0 ? (
          <p className="activity-empty t-small">{t('activity.quiet')}</p>
        ) : shown.length === 0 ? (
          <p className="activity-empty t-small">{t('activity.empty')}</p>
        ) : (
          <ol aria-label={t('activity.feed')}>
            {shown.map((line) => {
              const time = clockTime(line.event.at);
              return (
                <li
                  key={line.event.id}
                  data-new={line.event.id > feed.seenUpTo || undefined}
                  data-yours={line.kind === 'handoff' || undefined}
                >
                  <button type="button" className="activity-ev" onClick={pick(line.event.itemId)}>
                    <span
                      className="activity-dot"
                      data-lane={line.lane}
                      data-relayed={line.relayed || undefined}
                      aria-hidden="true"
                    />
                    <time
                      className="t-cap"
                      dateTime={line.event.at}
                      title={momentLabel(line.event.at, now)}
                    >
                      {time.slice(0, 5)}
                      <b>{time.slice(5)}</b>
                    </time>
                    <span className="activity-msg">
                      <span className="activity-who">{line.agent ?? t('activity.you')}</span>
                      {phraseOf(line)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}
