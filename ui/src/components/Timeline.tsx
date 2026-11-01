import { useState } from 'react';
import { eventAgent } from '../agent-mark.ts';
import { describeEvent, eventActorLabel, momentParts, relayOf } from '../format.ts';
import { AgentMark } from '../kit/index.ts';
import type { ItemEvent } from '../types.ts';

type TimelineProps = { events: ItemEvent[] };

// A relayed decision is drawn apart from one made in the UI: a ring in your color, not a filled dot.
const relayed = (event: ItemEvent) => (relayOf(event) ? true : undefined);

// The item's past, newest first, on one straight lane: a dot per event, filled in your color when
// a human acted, ink when an agent did, a ring when an agent relayed a human's words. It never
// swings between lanes: only the list's rail does.
export function Timeline({ events }: TimelineProps) {
  const newestFirst = [...events].reverse();
  // Events that arrive while the item is open fade in; those already there do not.
  const [knownUpTo] = useState(() => Math.max(0, ...events.map((event) => event.id)));
  const now = Date.now();
  return (
    <ol className="timeline">
      {newestFirst.map((event) => {
        const quote = relayOf(event)?.quote;
        const agent = eventAgent(event);
        const { day, time } = momentParts(event.at, now);
        return (
          <li
            key={event.id}
            className={event.id > knownUpTo ? 'ev new' : 'ev'}
            data-actor={event.actor.kind}
            data-relayed={relayed(event)}
          >
            <time className="t-cap" dateTime={event.at}>
              {day ? (
                <span className="ev-day">
                  {day}
                  <span className="visually-hidden">, </span>
                </span>
              ) : null}
              {time}
            </time>
            <span className="ev-m">
              {describeEvent(event)}{' '}
              <em>
                <span className="ev-sep">· </span>
                {agent ? <AgentMark name={agent} className="ev-mark" decorative /> : null}
                {eventActorLabel(event)}
              </em>
            </span>
            {quote ? <q className="ev-quote">{quote}</q> : null}
          </li>
        );
      })}
    </ol>
  );
}
