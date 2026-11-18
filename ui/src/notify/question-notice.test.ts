import { describe, expect, it } from 'vitest';
import type { FeedEvent } from '../activity.ts';
import { freshQuestions } from './question-notice.ts';

const kiln = { kind: 'agent', name: 'kiln' } as const;
const you = { kind: 'human', name: 'fede' } as const;
const ev = (id: number, type: string, at: string, actor: FeedEvent['actor'] = kiln): FeedEvent => ({
  id,
  type,
  actor,
  at,
  data: {},
  itemId: `CAM-${id}`,
});

// An agent's question while the page is open came with no notice, only the list and the tab's
// title (DR-26): the page says so once, for the questions asked since it opened.
describe('the questions to tell the person about', () => {
  const opened = Date.parse('2026-11-18T10:00:00Z');

  it('are the agents’ questions asked since the page opened, each once', () => {
    const shown = new Set<number>();
    const feed = [
      ev(1, 'question_asked', '2026-11-18T09:00:00Z'),
      ev(2, 'question_asked', '2026-11-18T10:01:00Z'),
      ev(3, 'claimed', '2026-11-18T10:02:00Z'),
      ev(4, 'question_answered', '2026-11-18T10:03:00Z', you),
    ];
    expect(freshQuestions(feed, opened, shown).map((e) => e.id)).toEqual([2]);
    expect(freshQuestions(feed, opened, shown)).toEqual([]);
  });
});
