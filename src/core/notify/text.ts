import type { Notice } from './planner.ts';
import type { NotifyKind } from './signals.ts';

// A notice in words, as a phone or the desktop shows it: short, the item's id and title and what
// happened, nothing else from the item (no notes, no evidence). Spanish de tú, as the UI.

export type NoticeLang = 'es' | 'en';

export type NoticeText = {
  title: string;
  body: string;
  // A later notice about the same item takes the place of the earlier one.
  tag: string;
  // Where tapping it opens the app: the item, or Te toca for a burst.
  url: string;
  item: string | null;
};

export const isNoticeLang = (value: unknown): value is NoticeLang =>
  value === 'es' || value === 'en';

const MAX_BODY = 100;

const short = (text: string, max = MAX_BODY) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

export const itemUrl = (id: string) => `/#/i/${encodeURIComponent(id)}`;

const WORDS = {
  es: {
    turn: 'Te toca',
    asks: (by: string) => `${by} te pregunta`,
    replied: (by: string) => `${by} contestó tu nota`,
    stuck: (by: string) => `Se atascó · ${by} no responde`,
    group: {
      turn: (n: number) => `${n} cosas te tocan`,
      replied: (n: number) => `${n} notas contestadas`,
      stuck: (n: number) => `${n} cosas se atascaron`,
      mixed: (n: number) => `${n} cosas te esperan`,
    },
  },
  en: {
    turn: 'Your turn',
    asks: (by: string) => `${by} asks you`,
    replied: (by: string) => `${by} answered your note`,
    stuck: (by: string) => `Stuck · ${by} went quiet`,
    group: {
      turn: (n: number) => `${n} things are yours`,
      replied: (n: number) => `${n} notes answered`,
      stuck: (n: number) => `${n} things got stuck`,
      mixed: (n: number) => `${n} things wait for you`,
    },
  },
} as const satisfies Record<
  NoticeLang,
  {
    turn: string;
    asks: (by: string) => string;
    replied: (by: string) => string;
    stuck: (by: string) => string;
    group: Record<NotifyKind | 'mixed', (n: number) => string>;
  }
>;

export function noticeText(notice: Notice, lang: NoticeLang): NoticeText {
  const words = WORDS[lang];
  if (notice.kind === 'group') {
    return {
      title: words.group[notice.of](notice.count),
      body: short(notice.items.map(({ title }) => title).join(' · ')),
      tag: 'otea-group',
      url: '/#/',
      item: null,
    };
  }
  const by = notice.by ?? '';
  const title =
    notice.kind === 'turn'
      ? notice.asks
        ? words.asks(by)
        : words.turn
      : notice.kind === 'replied'
        ? words.replied(by)
        : words.stuck(by);
  return {
    title,
    body: short(`${notice.item} · ${notice.title}`),
    tag: `otea-item-${notice.item}`,
    url: itemUrl(notice.item),
    item: notice.item,
  };
}
