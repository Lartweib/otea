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
    ask: (by: string) => `${by} te pregunta`,
    replied: (by: string) => `${by} contestó tu nota`,
    stuck: (by: string) => `Se atascó · ${by} no responde`,
    aside: (by: string) => `${by} lo dejó para después`,
    group: {
      turn: (n: number) => `${n} cosas te tocan`,
      ask: (n: number) => `${n} preguntas te esperan`,
      replied: (n: number) => `${n} notas contestadas`,
      stuck: (n: number) => `${n} cosas se atascaron`,
      aside: (n: number) => `${n} cosas apartadas`,
      mixed: (n: number) => `${n} cosas te esperan`,
    },
    in: (title: string, project: string) => `${title} en ${project}`,
  },
  en: {
    turn: 'Your turn',
    ask: (by: string) => `${by} asks you`,
    replied: (by: string) => `${by} answered your note`,
    stuck: (by: string) => `Stuck · ${by} went quiet`,
    aside: (by: string) => `${by} set it aside for later`,
    group: {
      turn: (n: number) => `${n} things are yours`,
      ask: (n: number) => `${n} questions wait for you`,
      replied: (n: number) => `${n} notes answered`,
      stuck: (n: number) => `${n} things got stuck`,
      aside: (n: number) => `${n} things set aside`,
      mixed: (n: number) => `${n} things wait for you`,
    },
    in: (title: string, project: string) => `${title} in ${project}`,
  },
} as const satisfies Record<
  NoticeLang,
  {
    turn: string;
  } & Record<Exclude<NotifyKind, 'turn'>, (by: string) => string> & {
      group: Record<NotifyKind | 'mixed', (n: number) => string>;
      in: (title: string, project: string) => string;
    }
>;

// The project a notice comes from: a burst names it and takes the place of its own last burst.
export type NoticeProject = { id: string; name: string };

export function noticeText(notice: Notice, lang: NoticeLang, project?: NoticeProject): NoticeText {
  const words = WORDS[lang];
  if (notice.kind === 'group') {
    const title = words.group[notice.of](notice.count);
    return {
      title: project ? words.in(title, project.name) : title,
      body: short(notice.items.map(({ title }) => title).join(' · ')),
      tag: project ? `otea-group-${project.id}` : 'otea-group',
      url: '/#/',
      item: null,
    };
  }
  const by = notice.by ?? '';
  const title = notice.kind === 'turn' ? words.turn : words[notice.kind](by);
  return {
    title,
    body: short(`${notice.item} · ${notice.title}`),
    tag: `otea-item-${notice.item}`,
    url: itemUrl(notice.item),
    item: notice.item,
  };
}
