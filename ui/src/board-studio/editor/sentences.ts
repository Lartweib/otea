import { startsWith, waysOf } from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  type Hand,
  isAgent,
  LEVELS,
  partOf,
  type Step,
  stepById,
  stepIndex,
} from '../../../../src/core/board/model.ts';
import { language, type MessageKey, type PlainKey, t } from '../../i18n/i18n.ts';
import { doesText, reviewsText, targetName } from '../words.ts';

// The board in sentences: the summary under its name, and what each choice on a step's card means
// (who does it and reviews it, what a handoff asks, where it can go, how rounds count). Each
// sentence is a message key with its params; a board's own words (step and part names) are marked
// so the page can set them apart. `plain` says a sentence as text.

// One of the board's own words, or several joined by "and"/"or" (with an arrow: "→ Animar").
export type Name = { name: string };
export type Names = { names: readonly string[]; join: 'and' | 'or'; arrow?: boolean };
export type Value = string | number | Name | Names;

export type Sentence = {
  key: MessageKey;
  params?: Readonly<Record<string, Value>>;
  level?: 'warn';
};

const say = t as unknown as (key: MessageKey, params?: Record<string, string | number>) => string;

export const isName = (v: Value): v is Name => typeof v === 'object' && 'name' in v;
export const isNames = (v: Value): v is Names => typeof v === 'object' && 'names' in v;

// The parts of a joined list, in the language on screen: elements and the words between them.
export function listParts(v: Names): { type: 'element' | 'literal'; value: string }[] {
  const names = v.arrow ? v.names.map((n) => `→ ${n}`) : [...v.names];
  return new Intl.ListFormat(language(), {
    type: v.join === 'and' ? 'conjunction' : 'disjunction',
  }).formatToParts(names);
}

export function valueText(v: Value): string {
  if (isName(v)) return v.name;
  if (isNames(v))
    return listParts(v)
      .map((p) => p.value)
      .join('');
  return String(v);
}

export function plain(s: Sentence): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(s.params ?? {}))
    params[k] = typeof v === 'number' ? v : valueText(v);
  return say(s.key, params);
}

const lowerFirst = (s: string) => (s ? s[0]?.toLocaleLowerCase(language()) + s.slice(1) : s);
const unnamed = (name: string) => name.trim() || t('bs.editor.unnamed');

// ---- the summary ----

export function summary(def: BoardDefinition): Sentence[] {
  const form = [def.title, ...def.form.map((f) => partOf(def, f.ref)?.name ?? '')].filter(Boolean);
  const out: Sentence[] = [
    {
      key: 'bs.editor.sum.start',
      params: { item: lowerFirst(def.item.trim() || t('bs.editor.item')), form: and(form) },
    },
  ];
  if (!def.steps.length) {
    out.push({ key: 'bs.editor.sum.none', params: { plus: { name: '+' } } });
    return out;
  }
  def.steps.forEach((step, index) => {
    const hand = step.hand
      .filter((h) => h.req !== 'no')
      .map((h) => partOf(def, h.ref)?.name ?? '')
      .filter(Boolean);
    const first = index === 0;
    const key =
      (first ? 'bs.editor.sum.first' : 'bs.editor.sum.then') + (hand.length ? '_hand' : '');
    out.push({
      key: key as MessageKey,
      params: {
        step: { name: unnamed(step.name) },
        does: doesText(step.doer),
        reviews: reviewsText(step.reviewer),
        ...(hand.length ? { hand: and(hand) } : {}),
      },
    });
    const alt = waysOf(def, step.id).slice(1);
    if (alt.length)
      out.push({
        key: 'bs.editor.sum.ways',
        params: {
          step: { name: unnamed(step.name) },
          ways: { names: alt.map((w) => targetName(def, w)), join: 'or' },
        },
      });
  });
  out.push({ key: 'bs.editor.sum.end', params: { done: { name: t('bs.done') } } });
  return out;
}

const and = (names: readonly string[]): Names => ({ names, join: 'and' });

// ---- a step's card ----

// Who does or reviews the step, by name, for the sentences ("un agente", "kiln").
const agentWord = (step: Step) =>
  step.doer === 'any' ? t('bs.editor.an_agent') : isAgent(step.doer) ? step.doer.agent : '';

export function stepConseq(
  def: BoardDefinition,
  step: Step,
  agents: readonly { name: string; connected: boolean }[],
): Sentence[] {
  const out: Sentence[] = [];
  const agentDoes = step.doer !== 'you';
  const rev = step.reviewer;
  if (agentDoes && rev === 'you')
    out.push({ key: 'bs.editor.conseq.you_review', params: { who: agentWord(step) } });
  if (agentDoes && rev === 'none') out.push({ key: 'bs.editor.conseq.no_review' });
  if (!agentDoes && rev === 'none') out.push({ key: 'bs.editor.conseq.yours_alone' });
  if (!agentDoes && isAgent(rev))
    out.push({ key: 'bs.editor.conseq.agent_reviews_you', params: { agent: rev.agent } });
  if (!agentDoes && rev === 'you') out.push({ key: 'bs.editor.conseq.self_review', level: 'warn' });
  if (agentDoes && isAgent(rev)) {
    out.push({ key: 'bs.editor.conseq.agent_reviews', params: { agent: rev.agent } });
    if (step.doer === 'any' || (isAgent(step.doer) && step.doer.agent === rev.agent))
      out.push({ key: 'bs.editor.conseq.own_work', params: { agent: rev.agent } });
  }
  const seen = new Set<string>();
  for (const who of [step.doer, rev]) {
    if (!isAgent(who) || seen.has(who.agent)) continue;
    seen.add(who.agent);
    if (!agents.some((a) => a.name === who.agent && a.connected))
      out.push({
        key: 'bs.editor.conseq.offline',
        params: { agent: who.agent, step: { name: unnamed(step.name) } },
        level: 'warn',
      });
  }
  return out;
}

// A "required only when" value in words: a choice's name, a level, yes or no.
export function whenValueName(def: BoardDefinition, part: string, value: string): string {
  const p = partOf(def, part);
  if (!p || !value) return '…';
  if (p.kind === 'level')
    return (LEVELS as readonly string[]).includes(value) ? t(`bs.level.${value}` as PlainKey) : '…';
  if (p.kind === 'yesno') return value === 'yes' ? t('bs.yes') : value === 'no' ? t('bs.no') : '…';
  return p.options.find((c) => c.id === value)?.name ?? '…';
}

export function handConseq(def: BoardDefinition, step: Step, hand: Hand): Sentence[] {
  const part = partOf(def, hand.ref);
  if (!part) return [];
  if (hand.req === 'no') return [{ key: 'bs.editor.hand.no' }];
  if (hand.req === 'when') {
    const on = hand.when ? partOf(def, hand.when.part) : undefined;
    return [
      {
        key: 'bs.editor.hand.when',
        params: {
          part: { name: on?.name ?? '…' },
          value: { name: hand.when ? whenValueName(def, hand.when.part, hand.when.value) : '…' },
        },
      },
    ];
  }
  const who = step.doer === 'you' ? 'you' : 'agent';
  const out: Sentence[] = [
    {
      key: `bs.editor.hand.${who}${hand.fresh ? '_fresh' : ''}` as MessageKey,
      params: { part: { name: part.name } },
    },
  ];
  if (part.kind === 'check') out.push({ key: 'bs.editor.hand.check' });
  return out;
}

export function waysConseq(def: BoardDefinition, step: Step): Sentence | null {
  const ways = waysOf(def, step.id);
  if (ways.length < 2) return null;
  const names = ways.map((w) => targetName(def, w));
  if (step.reviewer === 'you')
    return { key: 'bs.editor.ways.approve', params: { ways: { names, join: 'or', arrow: true } } };
  if (step.reviewer === 'none' && step.doer === 'you')
    return { key: 'bs.editor.ways.hand', params: { ways: { names, join: 'or', arrow: true } } };
  return { key: 'bs.editor.ways.agent', params: { ways: { names, join: 'or' } } };
}

// How rounds count, said on the step a send-back lands on.
export function roundsSentence(def: BoardDefinition, step: Step): Sentence {
  const back = step.back === 'same' ? step : (stepById(def, step.back) ?? step);
  return { key: 'bs.editor.rounds', params: { step: { name: unnamed(back.name) } } };
}

// Everything the step starts with, by name, and where it came from (a step's name, or the form).
export function startsWithNames(def: BoardDefinition, step: Step) {
  return startsWith(def, step.id).flatMap(({ ref, from }) => {
    const part = partOf(def, ref);
    if (!part) return [];
    const fromStep = from ? stepById(def, from) : undefined;
    return [{ ref, name: part.name, kind: part.kind, from: fromStep?.name }];
  });
}

// "Paso 2 de 3".
export function stepPlace(def: BoardDefinition, step: Step): Sentence {
  return {
    key: 'bs.editor.card.place',
    params: { n: stepIndex(def, step.id) + 1, count: def.steps.length },
  };
}
