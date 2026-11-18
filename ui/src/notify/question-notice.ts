import { useEffect, useRef } from 'react';
import type { FeedEvent } from '../activity.ts';
import { t } from '../i18n/i18n.ts';
import { toast } from '../kit/pop/toast.tsx';

// An agent's question while the page is open (DR-26): a quiet toast says who asks and where, with
// a way to answer, once per question. Questions asked before the page opened are already in Te
// toca and the tab's title; the item open on screen shows its own question.

// The agents' questions asked since `since` (ms) that `shown` has not seen; it marks them seen.
export function freshQuestions(
  feed: readonly FeedEvent[],
  since: number,
  shown: Set<number>,
): FeedEvent[] {
  const fresh = feed.filter(
    (e) =>
      e.type === 'question_asked' &&
      e.actor.kind === 'agent' &&
      !shown.has(e.id) &&
      Date.parse(e.at) >= since,
  );
  for (const e of fresh) shown.add(e.id);
  return fresh;
}

// A page loaded a moment after the question was asked still tells: the clock of the PC and the
// page may differ by a little.
const SLACK_MS = 5_000;

export function useQuestionNotice(
  feed: readonly FeedEvent[],
  o: { open: string | undefined; phone: boolean; onAnswer: (id: string) => void },
): void {
  const since = useRef(Date.now() - SLACK_MS);
  const shown = useRef(new Set<number>());
  const latest = useRef(o);
  latest.current = o;
  useEffect(() => {
    for (const e of freshQuestions(feed, since.current, shown.current)) {
      const { open, phone, onAnswer } = latest.current;
      if (open === e.itemId) continue;
      toast({
        msg: t('notice.asked', { agent: e.actor.name, id: e.itemId }),
        action: { label: t('notice.answer'), run: () => onAnswer(e.itemId) },
        ...(phone ? { at: 'top' as const } : {}),
      });
    }
  }, [feed]);
}
