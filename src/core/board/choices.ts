import type { BoardDefinition } from './model.ts';

// The options a decision weighs and the one the person picks. Options are a long text the board
// shows as options (`show: 'options'`), written one `### A · Name` heading per option, a line that
// sums it up, then `+ ` gains and `- ` costs; `(recommended)` after the name marks the agent's
// pick. Reviewing an item that carries two or more, the person picks one, with an optional
// comment: an option_chosen event, the last of which is the item's choice, read by next and show
// and drawn on the item's page.

export const OPTION_CHOSEN = 'option_chosen';

export type DecisionOption = {
  letter: string;
  name: string;
  summary: string;
  gains: string[];
  costs: string[];
  recommended: boolean;
};

const HEADING = /^#{2,4}\s+([A-Za-z0-9]{1,2})\s*[·.:)\-–—]\s*(.+?)\s*$/;
const RECOMMENDED = /\s*\((?:recommended|recomendada|recomendado)\)\s*$/i;

// The options a text holds; none when it holds no such heading (it is then plain Markdown).
export function optionsOf(text: string): DecisionOption[] {
  const options: DecisionOption[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = HEADING.exec(line);
    if (heading) {
      const [, letter = '', named = ''] = heading;
      options.push({
        letter: letter.toUpperCase(),
        name: named.replace(RECOMMENDED, ''),
        summary: '',
        gains: [],
        costs: [],
        recommended: RECOMMENDED.test(named),
      });
      continue;
    }
    const option = options.at(-1);
    if (!option || line === '') continue;
    if (/^\+\s+/.test(line)) option.gains.push(line.replace(/^\+\s+/, ''));
    else if (/^[-*]\s+/.test(line)) option.costs.push(line.replace(/^[-*]\s+/, ''));
    else option.summary = option.summary ? `${option.summary} ${line}` : line;
  }
  return options;
}

// The options the person picks from on the item: the first long text the board shows as options
// that holds two or more. Undefined when there is nothing to pick.
export function pickableOptions(
  def: Pick<BoardDefinition, 'parts'>,
  fields: Readonly<Record<string, unknown>>,
): { part: string; options: DecisionOption[] } | undefined {
  for (const part of Object.values(def.parts)) {
    if (part.kind !== 'long' || part.show !== 'options') continue;
    const value = fields[part.id];
    if (typeof value !== 'string') continue;
    const options = optionsOf(value);
    if (options.length >= 2) return { part: part.id, options };
  }
  return undefined;
}

// The option the person picked: its letter and name, their comment, and the review it was picked
// in (the step by id and by name).
export type ItemChoice = {
  option: string;
  name: string;
  comment?: string;
  at: string;
  by: string;
  step: string;
  stepName: string;
};

type ChoiceEvent = {
  type: string;
  actor: { kind: 'human' | 'agent'; name: string };
  at: string;
  data: Record<string, unknown>;
};

// The item's choice: the last option the person picked.
export function choiceOf(events: readonly ChoiceEvent[]): ItemChoice | undefined {
  const last = events.findLast(({ type }) => type === OPTION_CHOSEN);
  if (!last) return undefined;
  const { data } = last;
  const comment = typeof data.comment === 'string' ? data.comment.trim() : '';
  return {
    option: String(data.option ?? ''),
    name: String(data.name ?? ''),
    ...(comment ? { comment } : {}),
    at: last.at,
    by: last.actor.name,
    step: String(data.step ?? ''),
    stepName: String(data.stepName ?? data.step ?? ''),
  };
}

// What an agent reads of the choice, in English as the rest of next and show.
export function choiceLines(choice: ItemChoice): string[] {
  const lines = [`  ${choice.option} · ${choice.name} (in ${choice.stepName})`];
  if (choice.comment) lines.push(`  Their comment: "${choice.comment}"`);
  return lines;
}
