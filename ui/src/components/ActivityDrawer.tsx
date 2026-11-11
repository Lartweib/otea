import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ACTIVITY_KINDS,
  type ActivityKind,
  arcDash,
  clockOf,
  type FeedLine,
  feedLines,
  type LeaseRow,
  leaseLeft,
  leaseRows,
  leftShare,
  shownLines,
  turnLookup,
} from '../activity.ts';
import { typeOfItem, useApp } from '../app/context.tsx';
import { relationSentence } from '../format.ts';
import type { Connection } from '../hooks.ts';
import { t, tx } from '../i18n/i18n.ts';
import { useEscape } from '../kit/escape.ts';
import { AgentMark, Icon, IconButton, Swap } from '../kit/index.ts';
import { Choreo, part } from '../motion/choreo.ts';
import { stateWord } from '../preset-words.ts';
import type { CollectionView, Item } from '../types.ts';

// Actividad (SPEC §10.4, mock:804-827, 3538-3579): a 500 px drawer from the right of .main. It
// slides in (translateX 100% → 0, 600 settle) while its parts resolve at 120 + 34·min(i, 5); the
// close is the same gesture mirrored. Reservas activas: each lease's arc draining in real time,
// the time left; Últimos eventos: kind and agent chips over the feed, which swaps in place.

// The drawer counts down while it is open.
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

// The lease's arc (mock:3541-3544): a 12 px ring on the rule, the share left in ink (warn when it
// ran out), from the top.
export function LeaseArc({ share, expired }: { share: number; expired: boolean }) {
  return (
    <svg width="30" height="30" viewBox="-15 -15 30 30" aria-hidden="true">
      <circle r="12" fill="none" stroke="var(--rule)" strokeWidth="2" />
      <circle
        className="arc"
        r="12"
        fill="none"
        stroke={expired ? 'var(--warn)' : 'var(--ink-2)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={arcDash(expired ? 0 : share)}
        transform="rotate(-90)"
      />
    </svg>
  );
}

function Lease({ row, now, onOpen }: { row: LeaseRow; now: number; onOpen: () => void }) {
  const left = leaseLeft(row, now);
  return (
    <div className="lease" data-i="">
      <LeaseArc share={leftShare(row, now)} expired={row.expired} />
      <div className="lt">
        <b>{row.holder}</b>{' '}
        <button type="button" className="id" onClick={onOpen}>
          {row.item.id}
        </button>
        <div>{row.item.title}</div>
      </div>
      <div className={left.warn ? 'lr warn' : 'lr'}>
        {left.main}
        <small>{t(`activity.${left.sub}`)}</small>
      </div>
    </div>
  );
}

// The sentence of a feed line, the item's id as a button that opens it.
function sentence(line: FeedLine, id: ReactNode, state: (s: string) => string): ReactNode {
  const { phrase } = line;
  const you = line.agent === null;
  switch (phrase.key) {
    case 'activity.claimed':
      return tx(phrase.key, { id, time: phrase.time });
    case 'activity.claimedOver':
      return tx(phrase.key, { id, previous: phrase.previous });
    case 'activity.released':
      return tx(phrase.key, { id });
    case 'activity.handed':
      return tx(phrase.key, { id, state: state(phrase.state) });
    case 'activity.moved':
    case 'activity.created':
      return tx(you ? `${phrase.key}You` : phrase.key, { id, state: state(phrase.state) });
    case 'activity.attached':
      return tx(you ? 'activity.attachedYou' : phrase.key, { id, file: phrase.file });
    case 'activity.edited':
      return tx(you ? 'activity.editedYou' : phrase.key, { id });
    case 'activity.linked':
    case 'activity.unlinked':
      return tx(you ? `${phrase.key}You` : phrase.key, {
        relation: relationSentence(phrase.kind, phrase.from, phrase.to),
      });
    case 'activity.other':
      return tx(phrase.key, { id, type: phrase.type });
  }
}

type ActivityDrawerProps = {
  open: boolean;
  onClose: () => void;
  // Kept for the app's call; the drawer reads the app's data.
  items?: readonly Item[];
  collections?: readonly CollectionView[];
  version?: number;
  connection?: Connection;
  phone?: boolean;
};

export function ActivityDrawer({ open, onClose }: ActivityDrawerProps) {
  const app = useApp();
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const el = useRef<HTMLElement>(null);
  const ch = useRef<Choreo | null>(null);
  const now = useClock(open);
  const [kind, setKind] = useState<ActivityKind>('all');
  const [agent, setAgent] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on open, close and mount
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    if (open) {
      if (!ch.current) {
        const items = [...node.querySelectorAll('[data-i]')].slice(0, 10);
        ch.current = new Choreo([
          part(
            node,
            { transform: 'translateX(calc(100% + 44px))' },
            { transform: 'translateX(0%)' },
            600,
            'settle',
            0,
          ),
          ...items.flatMap((x, i) => {
            const d = 120 + 34 * Math.min(i, 5);
            return [
              part(x, { opacity: 0 }, { opacity: 1 }, 340, 'drift', d),
              part(
                x,
                { transform: 'translateY(4px)' },
                { transform: 'translateY(0px)' },
                380,
                'glide',
                d,
              ),
            ];
          }),
          part(node, { opacity: 0 }, { opacity: 1 }, 1, 'drift', 0, { ronly: true }),
        ]);
      }
      ch.current.go(1);
    } else if (ch.current) {
      const c = ch.current;
      c.go(0).then((latest) => {
        if (latest && c.dir === 0) {
          ch.current = null;
          setMounted(false);
        }
      });
    }
  }, [open, mounted]);

  useEscape(open, 'drawer', onClose);

  if (!mounted) return null;
  const lines = feedLines(app.feed, turnLookup(app.all, app.collections));
  const leases = leaseRows(app.all, app.feed, now);
  const agents = [...new Set(lines.flatMap((l) => (l.agent ? [l.agent] : [])))].sort((a, b) =>
    a.localeCompare(b),
  );
  const shown = shownLines(lines, kind, agent);
  const byId = new Map(app.all.map((it) => [it.id, it]));
  const stateOf = (itemId: string) => (s: string) => {
    const it = byId.get(itemId);
    return it ? stateWord(typeOfItem(it, app.collectionOf), s) : s;
  };
  const openItem = (id: string) => {
    app.openItem(id);
    if (app.phone) onClose();
  };
  const live = app.connection === 'live';
  return (
    <aside ref={el} className="drawer" aria-label={t('activity.label')}>
      <div className="dhd">
        <h3>{t('activity.title')}</h3>
        <small>{t(live ? 'activity.live' : 'activity.offline', { time: clockOf(now) })}</small>
        <IconButton aria-label={t('activity.close')} onClick={onClose}>
          <Icon name="x" />
        </IconButton>
      </div>
      <div className="dbody">
        <h4 data-i="">
          {t('activity.leases')} <small>{leases.length}</small>
        </h4>
        {leases.length === 0 ? (
          <p className="none" data-i="">
            {t('activity.noLeases')}
          </p>
        ) : (
          leases.map((row) => (
            <Lease
              key={`${row.holder} ${row.item.id}`}
              row={row}
              now={now}
              onOpen={() => openItem(row.item.id)}
            />
          ))
        )}
        <h4 data-i="">{t('activity.feed')}</h4>
        <fieldset className="fchips" data-i="" aria-label={t('activity.kinds')}>
          {ACTIVITY_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={kind === k ? 'on' : undefined}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {t(`activity.kind.${k}`)}
            </button>
          ))}
        </fieldset>
        {agents.length > 0 ? (
          <fieldset className="fchips" data-i="" aria-label={t('activity.from')}>
            <button
              type="button"
              className={agent === null ? 'on' : undefined}
              aria-pressed={agent === null}
              onClick={() => setAgent(null)}
            >
              {t('activity.everyone')}
            </button>
            {agents.map((a) => (
              <button
                key={a}
                type="button"
                className={agent === a ? 'on' : undefined}
                aria-pressed={agent === a}
                onClick={() => setAgent(a)}
              >
                {a}
              </button>
            ))}
          </fieldset>
        ) : null}
        <div data-i="">
          <Swap k={`${kind}|${agent ?? ''}`} as="div" className="feedw">
            {lines.length === 0 ? (
              <p className="none">{t('activity.quiet')}</p>
            ) : shown.length === 0 ? (
              <p className="none">{t('activity.empty')}</p>
            ) : (
              <ol className="feed" aria-label={t('activity.feed')}>
                {shown.slice(0, 80).map((line) => {
                  const id = (
                    <button
                      type="button"
                      className="id"
                      onClick={() => openItem(line.event.itemId)}
                    >
                      {line.event.itemId}
                    </button>
                  );
                  return (
                    <li key={line.event.id}>
                      <span className="tm">{clockOf(Date.parse(line.event.at))}</span>
                      {line.agent ? (
                        <AgentMark name={line.agent} decorative />
                      ) : (
                        <AgentMark you decorative />
                      )}
                      <span className="tx">
                        {line.agent ? <>{line.agent} </> : null}
                        {sentence(line, id, stateOf(line.event.itemId))}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Swap>
        </div>
      </div>
    </aside>
  );
}
