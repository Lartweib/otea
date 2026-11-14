import { OteaError } from './errors.ts';

// What an agent declares it runs as: the harness it works through (an MCP client's clientInfo, or
// what a command-line agent names), the exact model id and the effort, both stored as declared.
// It is kept for analysis after the fact (rounds and send-backs per model and effort), never to
// route or restrict work.
export type Profile = { harness: string; model: string; effort: string };

// What an agent declares for a model or an effort it cannot read from its own settings or
// environment: Otea never guesses for it, nor lets it guess. It still makes a profile, and the
// analysis keeps it apart from every family and effort.
export const UNKNOWN = 'unknown';

export const isUnknown = (value: string) => value === UNKNOWN;

// Model ids grouped for analysis: the first rule that matches names the family; an id none matches
// is its own family. Extend it as new lines of models appear.
const FAMILIES: readonly [RegExp, (match: RegExpMatchArray) => string][] = [
  [/\b(opus|sonnet|haiku|fable)\b/, (m) => m[1] ?? ''],
  [/^gpt-(\d+)/, (m) => `gpt-${m[1]}`],
  [/^(o\d+)\b/, (m) => m[1] ?? ''],
  [/^gemini-.*?\b(pro|flash)\b/, (m) => `gemini-${m[1]}`],
];

export function modelFamily(model: string): string {
  const id = model.toLowerCase();
  if (id === UNKNOWN) return UNKNOWN;
  for (const [pattern, family] of FAMILIES) {
    const match = id.match(pattern);
    if (match) return family(match);
  }
  return id;
}

const VALUE = /^\S{1,100}$/;

// A profile value is one word as the agent declares it (an exact model id, an effort level, a
// harness name): no translation between vendors, so it is only checked to be one word. A model or
// an effort the agent cannot read is unknown, kept in one spelling; the harness it always knows.
export function assertProfileValue(name: 'model' | 'effort' | 'harness', value: string): string {
  const unknown = value.toLowerCase() === UNKNOWN;
  if (unknown && name === 'harness') {
    throw new OteaError(
      'invalid_profile',
      '--harness takes the tool you run in (such as claude-code, codex or gemini-cli): you always know it',
    );
  }
  if (unknown) return UNKNOWN;
  if (VALUE.test(value)) return value;
  throw new OteaError(
    'invalid_profile',
    `--${name} takes one word of at most 100 characters, as your harness names it (such as claude-opus-5-5 or high), or unknown when you cannot read it: never guess`,
  );
}

export const profileLine = ({ model, effort }: Profile) => `${model} · ${effort}`;
