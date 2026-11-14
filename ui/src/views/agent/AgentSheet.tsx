import { type ReactNode, useEffect, useState } from 'react';
import { activeLease } from '../../active-lease.ts';
import { clockOf, turnLookup } from '../../activity.ts';
import { fetchAgent } from '../../api.ts';
import { typeOfItem, useApp } from '../../app/context.tsx';
import { Prof } from '../../components/Prof.tsx';
import { whenText } from '../../derive/when.ts';
import { agoLabel } from '../../format.ts';
import { t, tx } from '../../i18n/i18n.ts';
import { GhostButton, Icon } from '../../kit/index.ts';
import { AgentMark } from '../../kit/Marks.tsx';
import { lookOf } from '../../lanes/looks.ts';
import { NodeGlyph } from '../../lanes/NodeGlyph.tsx';
import type { Agent, AgentProfile } from '../../presence.ts';
import { stateWord } from '../../preset-words.ts';
import { profilePair, profileValue } from '../../profile-words.ts';
import { type AgentRow, agentRows, harnessOf } from '../../shell/topbar-model.ts';
import type { Item } from '../../types.ts';
import { whenOf } from '../detail/history.ts';
import { agentTrace, type HeldLease } from '../toca/trace.ts';
import { spanText } from '../toca/words.ts';
import {
  type AgentDetail,
  eligibility,
  type Handoff,
  lastHandoffs,
  profileTrail,
} from './agent-sheet.ts';
import { TraceSvg } from './Trace.tsx';

// An agent's sheet (agents mock §3), the same shape as an item's: Cerrar up top, who it is (its
// harness, since when it is connected, its last sign), the profile it declares now and how it got
// there, its work (what it holds, its last handoffs with the profile of each round), its last two
// hours as a line, and the steps it may take.

function useAgentDetail(name: string, version: number): AgentDetail | null | undefined {
  const [detail, setDetail] = useState<{ name: string; value: AgentDetail | null } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version means it may have changed
  useEffect(() => {
    const controller = new AbortController();
    fetchAgent(name, controller.signal).then(
      (value) => setDetail({ name, value }),
      () => undefined,
    );
    return () => controller.abort();
  }, [name, version]);
  return detail?.name === name ? detail.value : undefined;
}

// A moment as the sheet says it: the hour today, the day and hour before.
function momentOf(iso: string, now: number): string {
  const at = Date.parse(iso);
  return new Date(at).toDateString() === new Date(now).toDateString()
    ? clockOf(at)
    : whenOf(iso, now);
}

function Block({
  label,
  gloss,
  children,
}: {
  label: string;
  gloss?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section className="ag-blk" data-c>
      <div className="margin-label">
        {label}
        {gloss ? <span>{gloss}</span> : null}
      </div>
      <div className="ag-body">{children}</div>
    </section>
  );
}

function Stand({
  row,
  presence,
  now,
}: {
  row: AgentRow | undefined;
  presence: Agent;
  now: number;
}) {
  const it = row?.item;
  const since = row ? spanText(now - row.since) : '';
  if (!row) return <>{t('agent.stand.away', { time: agoLabel(presence.lastSeen, now) })}</>;
  if (row.state === 'work' && it)
    return <>{tx('agent.stand.work', { title: <em>{it.title}</em>, time: since })}</>;
  if (row.state === 'quiet' && it)
    return <>{tx('agent.stand.quiet', { title: <em>{it.title}</em>, time: clockOf(row.since) })}</>;
  if (row.state === 'wait' && it)
    return (
      <>
        {tx('agent.stand.wait', {
          answer: <em className="you-t">{t('agent.stand.answer')}</em>,
          title: <em>{it.title}</em>,
          time: since,
        })}
      </>
    );
  if (!row.profile) return <>{t('agent.stand.noProfile')}</>;
  return <>{t('agent.stand.idle', { time: since })}</>;
}

function ProfileBlock({
  presence,
  detail,
  now,
}: {
  presence: Agent;
  detail: AgentDetail | null | undefined;
  now: number;
}) {
  const profile = presence.profile ?? null;
  const trail = profileTrail(detail?.profiles ?? []);
  const words = (p: AgentProfile) => <b>{profilePair(p.model, p.effort)}</b>;
  return (
    <Block label={t('agent.profile')} gloss={t('agent.profileGloss')}>
      <div className="pnow">
        {profile ? (
          <span className="pbig">
            {profileValue(profile.model)}
            <i>·</i>
            {profileValue(profile.effort)}
          </span>
        ) : (
          <span className="pbig warn">{t('agent.noProfile')}</span>
        )}
        {profile && trail[0] ? (
          <span className="when">{t('agent.since', { time: momentOf(trail[0].at, now) })}</span>
        ) : null}
        {profile && presence.profileConfirmed === false ? (
          <span className="flag soft">{t('agent.unconfirmed')}</span>
        ) : null}
      </div>
      {trail.length ? (
        <ol className="ptrail">
          {trail.map((line, i) => (
            <li key={line.at} className={i === 0 ? 'now' : undefined}>
              <span className="t">{momentOf(line.at, now)}</span>
              {line.from
                ? tx('agent.trail.change', { from: words(line.from), to: words(line.to) })
                : tx('agent.trail.first', { profile: words(line.to) })}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="self-note">{t('agent.selfNote')}</p>
    </Block>
  );
}

const STATUS: Record<Handoff['status'], 'agent.st.review' | 'agent.st.back' | 'agent.st.on'> = {
  review: 'agent.st.review',
  back: 'agent.st.back',
  on: 'agent.st.on',
};

function WorkBlock({ row, name }: { row: AgentRow | undefined; name: string }) {
  const app = useApp();
  const now = app.now;
  const byId = (id: string) => app.all.find((it) => it.id === id);
  const where = (it: Item | undefined) =>
    it ? `${it.collection} › ${stateWord(typeOfItem(it, app.collectionOf), it.state)}` : '';
  const held = [...(row?.held ?? [])];
  if (row?.state === 'wait' && row.item && !held.some((h) => h.id === row.item?.id))
    held.push(row.item);
  const turnOf = turnLookup(app.all, app.collections);
  const handoffs = lastHandoffs(name, app.feed, app.all, turnOf);
  return (
    <Block label={t('agent.work')}>
      <div className="wk">
        <div className="sub">{t('agent.holds')}</div>
        {held.length === 0 ? <p className="none">{t('agent.nothingHeld')}</p> : null}
        {held.map((h) => {
          const it = byId(h.id);
          const asks = row?.state === 'wait' && row.item?.id === h.id;
          const note = h.look === 'stuck' ? t('agent.st.stuck') : asks ? t('agent.st.asks') : '';
          return (
            <button key={h.id} type="button" className="wrow" onClick={() => app.openItem(h.id)}>
              <NodeGlyph look={it ? lookOf(it, now) : h.look} size={14} />
              <span className="wb">
                <span className="t">{h.title}</span>
                <span className="s">
                  <span className="id">{h.id}</span> {where(it)}
                  {note ? ` · ${note}` : ''}
                </span>
              </span>
              <span className={h.look === 'stuck' ? 'r warn-t' : 'r'}>
                {it ? whenText(it, now).text : ''}
              </span>
            </button>
          );
        })}
        <div className="sub gap">{t('agent.handed')}</div>
        {handoffs.length === 0 ? <p className="none">{t('agent.noHandoffs')}</p> : null}
        {handoffs.map((h) => {
          const it = byId(h.id);
          return (
            <button
              key={`${h.id}:${h.at}`}
              type="button"
              className="wrow"
              onClick={() => app.openItem(h.id)}
            >
              <NodeGlyph look={it ? lookOf(it, now) : 'done'} size={14} />
              <span className="wb">
                <span className="t">{h.title}</span>
                <span className="s">
                  <span className="id">{h.id}</span> {t('agent.round', { n: h.round })}
                  {h.profile ? (
                    <>
                      {' · '}
                      <Prof profile={h.profile} />
                    </>
                  ) : null}
                  {' · '}
                  {t(STATUS[h.status])}
                </span>
              </span>
              <span className="r">{momentOf(h.at, now)}</span>
            </button>
          );
        })}
      </div>
    </Block>
  );
}

function ActivityBlock({ name }: { name: string }) {
  const app = useApp();
  const now = app.now;
  const leases: HeldLease[] = [];
  for (const it of app.all) {
    const held = activeLease(it.lease, now);
    if (held?.holder === name)
      leases.push({ item: it.id, expiresAt: held.expiresAt, active: true });
    else if (it.expiredLease?.holder === name && it.turn === 'agent' && !held)
      leases.push({ item: it.id, expiresAt: it.expiredLease.expiresAt, active: false });
  }
  const turnOf = turnLookup(app.all, app.collections);
  const trace = agentTrace(app.feed, name, now, { leases, turnOf });
  return (
    <Block label={t('agent.activity')} gloss={t('agent.activityGloss')}>
      <TraceSvg name={name} trace={trace} />
      <div className="axis" aria-hidden="true">
        <span>{t('toca.axis.from')}</span>
        <span>{t('toca.axis.mid')}</span>
        <span>{t('toca.axis.now')}</span>
      </div>
      <div className="tkey" aria-hidden="true">
        <span>
          <svg width="16" height="8" aria-hidden="true">
            <path d="M0 1.5H16" stroke="var(--ink-2)" />
          </svg>
          {t('agent.key.work')}
        </span>
        <span>
          <svg width="16" height="8" aria-hidden="true">
            <path d="M0 6.5H16" stroke="var(--ink-2)" />
          </svg>
          {t('agent.key.wait')}
        </span>
        <span>
          <svg width="8" height="8" aria-hidden="true">
            <circle cx="4" cy="4" r="2.6" fill="var(--you)" />
          </svg>
          {t('agent.key.handed')}
        </span>
        <span>
          <svg width="16" height="8" aria-hidden="true">
            <path
              d="M0 1.5H16"
              stroke="var(--warn)"
              strokeWidth="1.2"
              strokeDasharray="1.5 3"
              strokeLinecap="round"
            />
          </svg>
          {t('agent.key.quiet')}
        </span>
      </div>
    </Block>
  );
}

function CanBlock({ name, detail }: { name: string; detail: AgentDetail | null | undefined }) {
  const rows = eligibility(name, detail?.steps ?? []);
  return (
    <Block label={t('agent.can')} gloss={t('agent.canGloss')}>
      {detail && rows.length === 0 ? <p className="none">{t('agent.noBoards')}</p> : null}
      <ul className="elig">
        {rows.map((r) => (
          <li key={`${r.board}:${r.name}:${r.review}`} className={r.can ? 'erow' : 'erow no'}>
            <Icon name={r.can ? 'check' : 'x'} />
            <span className="st">
              {r.board} <span className="bd">›</span>{' '}
              {r.review ? t('agent.review', { step: r.name }) : r.name}
            </span>
            <span className="why">
              {r.why === 'other'
                ? t('agent.why.other', { agent: r.agent ?? '' })
                : t(`agent.why.${r.why}`)}
            </span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

export function AgentSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const app = useApp();
  const now = app.now;
  const detail = useAgentDetail(name, app.version);
  const presence = app.agents?.find((a) => a.name === name);
  const row = agentRows(app.agents ?? [], app.all, now, app.feed).find((r) => r.name === name);
  const harness = presence ? harnessOf(presence) : null;
  return (
    <section className="ag-grid" aria-label={t('agent.label', { agent: name })}>
      <div className="sheet-bar" data-c>
        <div className="crumb">
          <span className="chip ag">{t('agent.chip')}</span>
          <span className="from">{t('agent.from')}</span>
        </div>
        <div className="bar-r">
          <GhostButton className="closeb" onClick={onClose}>
            {app.phone ? t('sheet.back') : t('sheet.close')}
          </GhostButton>
        </div>
      </div>
      <div className="ag-head">
        <h1 className="headline" data-c>
          <AgentMark name={name} className="lg" decorative />
          {name}
        </h1>
        <p className="standfirst" data-c>
          {presence ? (
            <Stand row={row} presence={presence} now={now} />
          ) : (
            t('agent.gone', { agent: name })
          )}
        </p>
      </div>
      {presence ? (
        <>
          <div className="ag-meta" data-c>
            <div>
              <div className="lbl">{t('agent.harness')}</div>
              <div className="v">
                {harness ? (harness.toLowerCase() === 'cli' ? t('shell.cli') : harness) : '—'}
                {presence.harnessVersion ? <small>{presence.harnessVersion}</small> : null}
              </div>
            </div>
            <div>
              <div className="lbl">{t('agent.connected')}</div>
              <div className="v">
                {presence.connectedAt ? whenOf(presence.connectedAt, now) : '—'}
              </div>
            </div>
            <div>
              <div className="lbl">{t('agent.seen')}</div>
              <div className={row?.quiet ? 'v warn-t' : 'v'}>
                {agoLabel(presence.lastSeen, now)}
              </div>
            </div>
          </div>
          <ProfileBlock presence={presence} detail={detail} now={now} />
          <WorkBlock row={row} name={name} />
          <ActivityBlock name={name} />
          <CanBlock name={name} detail={detail} />
        </>
      ) : null}
    </section>
  );
}
