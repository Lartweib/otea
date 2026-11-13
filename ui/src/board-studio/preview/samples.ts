import type { ItemFacts, Phase } from '../../../../src/core/board/engine.ts';
import { startsWith } from '../../../../src/core/board/engine.ts';
import {
  type BoardDefinition,
  isAgent,
  isEvidence,
  LEVELS,
  type Part,
  partOf,
  stepById,
  TITLE,
} from '../../../../src/core/board/model.ts';
import { t } from '../../i18n/i18n.ts';
import type { Look } from '../../lanes/looks.ts';

// The preview's sample items and values: what the previews draw an item with, so every look shows
// on El tablero and the agent's text reads like a real one. They live in the draft's preview only
// and never reach a board.

export type SampleItem = {
  id: string;
  title: string;
  step: string | null;
  phase: Phase | null;
  look: Look;
  // The agent doing (or reviewing) it, when the step names one.
  agent: string | null;
  round: number;
  closed: boolean;
  // A discarded sample's motive (its name), on a board that has motives.
  motive?: string;
};

// The item's id prefix as the preview shows it: three letters of the item's name, no accents.
export function itemPrefix(item: string): string {
  const letters = item
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '');
  return letters.slice(0, 3).toUpperCase() || 'ITM';
}

// The prefix the items of each board that already has a collection go by, by board name: a board
// made before ids came from the item's name (ERRORES), or one whose three letters were taken
// (BUG2), keeps its own. The editor sets it from the project's collections.
let known: ReadonlyMap<string, string> = new Map();

export function setBoardPrefixes(prefixes: ReadonlyMap<string, string>): void {
  known = prefixes;
}

// The id prefix the preview shows for a board's items: the one its items already go by, else the
// one a new board gets.
export function boardPrefix(def: Pick<BoardDefinition, 'name' | 'item'>): string {
  return known.get(def.name) ?? itemPrefix(def.item);
}

export const sampleId = (def: BoardDefinition, n = 12): string => `${boardPrefix(def)}-${n}`;

// The k-th sample title: the board's own samples in turn, numbered once they run out.
export function sampleTitle(def: BoardDefinition, k = 0): string {
  const titles = def.samples.filter((title) => title.trim() !== '');
  if (titles.length === 0) {
    const base = t('bs.preview.sampleTitle', { item: def.item });
    return k === 0 ? base : `${base} (${k + 1})`;
  }
  const base = titles[k % titles.length] ?? '';
  return k < titles.length ? base : `${base} (${Math.floor(k / titles.length) + 1})`;
}

// One item per step and look: the doer's work (an agent's lit, waiting when it never connected,
// or yours), each review (yours with its halo, round 2), then one in Hecho, and one discarded
// with a motive on a board that has motives.
export function sampleItems(def: BoardDefinition, offline: readonly string[] = []): SampleItem[] {
  const out: SampleItem[] = [];
  const add = (item: Omit<SampleItem, 'id' | 'title' | 'closed'>, closed = false) => {
    const n = out.length;
    out.push({
      id: `${boardPrefix(def)}-${n + 1}`,
      title: sampleTitle(def, n),
      closed,
      ...item,
    });
  };
  const agentLook = (agent: string | null): Look =>
    agent !== null && offline.includes(agent) ? 'waiting' : 'working';
  for (const step of def.steps) {
    if (step.doer === 'you')
      add({ step: step.id, phase: 'doing', look: 'yours', agent: null, round: 1 });
    else {
      const agent = isAgent(step.doer) ? step.doer.agent : null;
      add({ step: step.id, phase: 'doing', look: agentLook(agent), agent, round: 1 });
    }
    if (step.reviewer === 'you' && step.doer !== 'you')
      add({ step: step.id, phase: 'review', look: 'yours', agent: null, round: 2 });
    if (isAgent(step.reviewer)) {
      const agent = step.reviewer.agent;
      add({ step: step.id, phase: 'review', look: agentLook(agent), agent, round: 1 });
    }
  }
  add({ step: null, phase: null, look: 'done', agent: null, round: 1 }, true);
  const motives = def.drop.motives;
  const motive = motives[1] ?? motives[0];
  if (motive)
    add(
      { step: null, phase: null, look: 'dropped', agent: null, round: 1, motive: motive.name },
      true,
    );
  return out;
}

// A value as the preview shows it, for each kind; `seed` varies it between items.
export function sampleValue(part: Part, seed = 0): string {
  switch (part.kind) {
    case 'level':
      return t(`bs.level.${LEVELS[seed % LEVELS.length] ?? 'low'}` as 'bs.level.low');
    case 'choice':
    case 'multi':
      return part.options[seed % Math.max(1, part.options.length)]?.name ?? '—';
    case 'check':
      return `${Math.max(0, part.options.length - 1)}/${part.options.length}`;
    case 'number':
      return String(3 + (seed % 9));
    case 'date':
      return t('bs.preview.value.date');
    case 'yesno':
      return t(seed % 2 ? 'bs.no' : 'bs.yes');
    case 'url':
      return 'example.com/docs';
    case 'branch':
      return 'fix/example';
    case 'long':
      return t('bs.preview.value.long');
    case 'text':
      return part.id === TITLE ? '' : t('bs.preview.value.text');
    default:
      return t('bs.preview.value.files', { count: 2 });
  }
}

// A value as an item stores it: choice ids, a checklist with every box ticked, yes or no, a date.
export function sampleRaw(part: Part, seed = 0): unknown {
  switch (part.kind) {
    case 'choice':
      return part.options[seed % Math.max(1, part.options.length)]?.id ?? '';
    case 'multi':
      return JSON.stringify(part.options.slice(0, 1).map(({ id }) => id));
    case 'check':
      return JSON.stringify(part.options.map(({ id }) => id));
    case 'level':
      return LEVELS[seed % LEVELS.length];
    case 'number':
      return 3 + (seed % 9);
    case 'date':
      return '2026-11-14';
    case 'yesno':
      return 'yes';
    case 'url':
      return 'https://example.com/docs';
    default:
      return sampleValue(part, seed);
  }
}

const CREATED = '2026-11-10T09:00:00.000Z';
const ROUND = '2026-11-11T09:00:00.000Z';
const HANDED = '2026-11-11T10:00:00.000Z';

export type SampleFacts = {
  title: string;
  fields: Record<string, unknown>;
  // How many files each evidence part holds.
  evidence: Record<string, number>;
  // The same, as the engine reads it.
  engine: ItemFacts;
};

// The sample item at a step: what it starts with and what can be filled at any time are there; its
// own handoff is empty while the step is done and complete once it is under review.
export function sampleFacts(
  def: BoardDefinition,
  stepId: string,
  phase: Phase,
  title = sampleTitle(def),
): SampleFacts {
  const fields: Record<string, unknown> = { [TITLE]: title };
  const evidence: Record<string, number> = {};
  const attached: { part: string; at: string }[] = [];
  const fill = (part: Part, files: number, at: string) => {
    if (part.id === TITLE) return;
    if (isEvidence(part)) {
      evidence[part.id] = files;
      for (let i = 0; i < files; i++) attached.push({ part: part.id, at });
    } else fields[part.id] = sampleRaw(part, part.name.length);
  };
  const before = [...startsWith(def, stepId).map(({ ref }) => ref), ...def.anytime];
  for (const ref of before) {
    const part = partOf(def, ref);
    if (part && !(part.id in evidence) && !(part.id in fields)) fill(part, 2, CREATED);
  }
  if (phase !== 'doing') {
    for (const { ref } of stepById(def, stepId)?.hand ?? []) {
      const part = partOf(def, ref);
      if (part) fill(part, 1, HANDED);
    }
  }
  return { title, fields, evidence, engine: { fields, evidence: attached, roundStartedAt: ROUND } };
}
