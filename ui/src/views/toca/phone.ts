import type { FeedEvent } from '../../activity.ts';
import type { TocaSection } from '../../derive/toca.ts';
import { type PlainKey, t } from '../../i18n/i18n.ts';
import type { Item } from '../../types.ts';

// Te toca on the phone (mobile mock 1): each review says what the agent delivered, the empty
// sections of yours join one italic line.

export type Delivery = { agent: string; note: string; images: number; files: number };

const said = (data: Record<string, unknown>): string => {
  const text = [data.note, data.reason].find((v) => typeof v === 'string' && v.trim() !== '');
  return typeof text === 'string' ? text.trim() : '';
};

// The agent move that brought the item where it is, its note (a board keeps the handoff's words as
// its note, a preset as its reason), and the files attached since the move before it: what this
// round delivered. Null when an agent did not hand it in itself.
export function deliveryOf(item: Item, feed: readonly FeedEvent[]): Delivery | null {
  const own = feed.filter((e) => e.itemId === item.id);
  const at = own.findLastIndex((e) => e.type === 'transitioned' && e.data.to === item.state);
  const handoff = own[at];
  if (handoff?.actor.kind !== 'agent' || typeof handoff.data.via === 'string') return null;
  const before = own.slice(0, at).findLastIndex((e) => e.type === 'transitioned');
  let images = 0;
  let files = 0;
  for (const e of own.slice(before + 1, at)) {
    if (e.type !== 'evidence_added') continue;
    if (e.data.kind === 'image') images++;
    else files++;
  }
  return { agent: handoff.actor.name, note: said(handoff.data), images, files };
}

// How much evidence, in words: 2 imágenes, 3 archivos.
export function evidenceWords(images: number, files: number): string {
  return [
    images ? t('phone.ev.images', { count: images }) : '',
    files ? t('sheet.files', { count: files }) : '',
  ]
    .filter(Boolean)
    .join(', ');
}

const QUIET: Partial<Record<TocaSection, PlainKey>> = {
  atasco: 'phone.quiet.atasco',
  preguntas: 'phone.quiet.preguntas',
  revisiones: 'phone.quiet.revisiones',
  propios: 'phone.quiet.propios',
};

// Your sections with nothing in them, in one line: Sin atascos ni preguntas para ti.
export function quietLine(empty: readonly TocaSection[]): string {
  const words = empty.flatMap((s) => {
    const key = QUIET[s];
    return key ? [t(key)] : [];
  });
  if (!words.length) return '';
  const last = words.pop() as string;
  const list = words.length ? `${words.join(', ')} ${t('phone.quiet.and')} ${last}` : last;
  const line = t('phone.quiet', { list });
  return line.charAt(0).toUpperCase() + line.slice(1);
}
