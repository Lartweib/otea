import { useLayoutEffect, useRef } from 'react';
import { activeLease } from '../../active-lease.ts';
import type { FeedEvent } from '../../activity.ts';
import { t, tx } from '../../i18n/i18n.ts';
import { Count } from '../../kit/Count.tsx';
import { Swap } from '../../kit/Swap.tsx';
import { C } from '../../motion/curves.ts';
import { reduced } from '../../motion/reduced.ts';
import type { Agent } from '../../presence.ts';
import { stateWord } from '../../preset-words.ts';
import type { Item, Turn, TypeView } from '../../types.ts';
import type { Today } from './today.ts';
import {
  type AgentState,
  agentState,
  agentsShown,
  agentTrace,
  type HeldLease,
  type Trace,
  tracePath,
} from './trace.ts';
import { spanText } from './words.ts';

// Te toca's agents column (SPEC §8.2, mock:1918-1985): who is working, what each agent does, its
// last two hours as a trace, the way to connect one, and the colophon of today's counts. Updates
// swap and roll in place; a trace's tail extends and a new drop grows.

export type AgentsColumnProps = {
  agents: readonly Agent[] | null | undefined;
  items: readonly Item[];
  feed: readonly FeedEvent[];
  now: number;
  today: Today;
  types: (item: Item) => TypeView | undefined;
  turnOf: (itemId: string, state: string) => Turn | undefined;
  onConnect: () => void;
};

export type AgentLine = {
  name: string;
  st: AgentState;
  trace: Trace;
};

export function agentLines(
  p: Omit<AgentsColumnProps, 'today' | 'onConnect' | 'types'>,
): AgentLine[] {
  return agentsShown(p.agents, p.items, p.feed, p.now).map((name) => {
    const leases: HeldLease[] = [];
    for (const it of p.items) {
      const held = activeLease(it.lease, p.now);
      if (held?.holder === name)
        leases.push({ item: it.id, expiresAt: held.expiresAt, active: true });
      else if (it.expiredLease?.holder === name && it.turn === 'agent' && !held)
        leases.push({ item: it.id, expiresAt: it.expiredLease.expiresAt, active: false });
    }
    const presence = p.agents?.find((a) => a.name === name);
    return {
      name,
      st: agentState(name, p.items, p.feed, p.now, presence?.lastSeen),
      trace: agentTrace(p.feed, name, p.now, { leases, turnOf: p.turnOf }),
    };
  });
}

function Status({ st, now }: { st: AgentState; now: number }) {
  const time = spanText(now - st.since);
  if (st.state === 'work') return <span>{t('toca.agent.work', { time })}</span>;
  if (st.state === 'quiet')
    return <span className="warn-t">{t('toca.agent.quiet', { time })}</span>;
  if (st.state === 'wait') return <span className="you-t">{t('toca.agent.wait')}</span>;
  return <span>{t('toca.agent.free', { time })}</span>;
}

// The trace is drawn imperatively: when it changes its shape, its tail extends (680 ink) and a new
// drop grows (420 settle), mock:1972-1977.
function TraceSvg({ name, trace }: { name: string; trace: Trace }) {
  const svg = useRef<SVGSVGElement>(null);
  const markup = tracePath(trace, 260);
  const shape = `${trace.work.length}|${trace.handed.length}|${trace.quiet ? 1 : 0}`;
  const was = useRef<{ shape: string; drops: number } | null>(null);
  useLayoutEffect(() => {
    const el = svg.current;
    if (!el) return;
    const before = was.current;
    was.current = { shape, drops: trace.handed.length };
    if (!before || before.shape === shape || reduced()) return;
    const tail = el.querySelector<SVGPathElement>('.tr');
    if (tail?.getTotalLength) {
      const L = tail.getTotalLength();
      tail.animate([{ strokeDasharray: `${L * 0.86} ${L}` }, { strokeDasharray: `${L} ${L}` }], {
        duration: 680,
        easing: C.ink,
      });
    }
    const drops = el.querySelectorAll('.drop');
    if (drops.length > before.drops) {
      drops[drops.length - 1]?.animate([{ r: '0' }, { r: '2.3' }], {
        duration: 420,
        easing: C.settle,
        delay: 400,
        fill: 'backwards',
      });
    }
  }, [shape, trace.handed.length]);
  return (
    <svg
      ref={svg}
      className="trace"
      viewBox="0 0 260 24"
      preserveAspectRatio="none"
      role="img"
      aria-label={t('toca.agent.trace', { agent: name })}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the trace's markup is built from numbers
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

function AgentRow({
  line,
  now,
  types,
}: {
  line: AgentLine;
  now: number;
  types: AgentsColumnProps['types'];
}) {
  const { name, st, trace } = line;
  const it = st.item;
  const doing = it ? (
    st.state === 'free' ? (
      <>
        <i>{t('toca.agent.last')}</i> {it.title}
      </>
    ) : (
      it.title
    )
  ) : null;
  return (
    <div className="agent" data-a={name}>
      <div className="who">
        {name}
        <Swap k={st.state} className="sw" dy={3} outT={200} inT={340}>
          <Status st={st} now={now} />
        </Swap>
      </div>
      <Swap k={`${st.state}|${it?.id ?? ''}|${it?.title ?? ''}`} as="div" className="doing">
        {doing}
      </Swap>
      {it ? (
        <div className="meta">
          <span className="id">{it.id}</span> · {it.collection} › {stateWord(types(it), it.state)}
        </div>
      ) : null}
      <TraceSvg name={name} trace={trace} />
    </div>
  );
}

export function AgentsColumn(p: AgentsColumnProps) {
  const lines = agentLines(p);
  const working = lines.filter((l) => l.st.state === 'work').length;
  return (
    <aside className="agents" data-enter="fade" data-leaf="">
      <h3>
        {t('toca.agents.title')} <Count value={working} hold />
        <span className="n wk">{t('toca.agents.working')}</span>
      </h3>
      {lines.length ? (
        lines.map((l) => <AgentRow key={l.name} line={l} now={p.now} types={p.types} />)
      ) : (
        <p className="agents-none">{t('toca.agents.none')}</p>
      )}
      <div className="axis" aria-hidden="true">
        <span>{t('toca.axis.from')}</span>
        <span>{t('toca.axis.mid')}</span>
        <span>{t('toca.axis.now')}</span>
      </div>
      <button type="button" className="connect" onClick={p.onConnect}>
        {t('toca.connect')}
      </button>
      <p className="colophon">
        {tx('toca.colophon', {
          handed: <Count value={p.today.handed} hold />,
          approved: <Count value={p.today.approved} hold />,
          sent: <Count value={p.today.sent} hold />,
        })}
      </p>
    </aside>
  );
}
