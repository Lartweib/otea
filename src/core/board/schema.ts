import { z } from 'zod';
import {
  BOARD_SCHEMA,
  type BoardDefinition,
  DONE,
  DROPPED,
  EVIDENCE_KINDS,
  FIELD_KINDS,
  SAME,
  TITLE,
  ZONES,
} from './model.ts';

// The shape of a board definition as it travels (PUT draft) and as it is stored (a version or a
// draft row): checked whole, so a malformed document never reaches the engine. Problems a person
// can fix in the editor (a duplicate name, a bad way) are not shape errors: problemsOf finds them.

const ID = /^[a-z][a-z0-9_-]*$/;

const id = z.string().regex(ID, 'is not an id');

const agent = z.strictObject({ agent: z.string().min(1) });

const choice = z.strictObject({ id, name: z.string() });

const part = z.strictObject({
  id,
  name: z.string(),
  kind: z.enum([...FIELD_KINDS, ...EVIDENCE_KINDS]),
  hint: z.string(),
  options: z.array(choice),
  show: z.string().optional(),
});

const hand = z.strictObject({
  ref: id,
  req: z.enum(['always', 'when', 'no'], { error: 'must be "always", "when" or "no"' }),
  when: z.strictObject({ part: id, value: z.string() }).optional(),
  fresh: z.boolean(),
});

const step = z.strictObject({
  id,
  name: z.string(),
  doer: z.union([z.enum(['you', 'any']), agent], {
    error: 'who does the step: "you", "any" or {"agent": "<name>"}',
  }),
  reviewer: z.union([z.enum(['none', 'you']), agent], {
    error: 'who reviews the step: "none", "you" or {"agent": "<name>"}',
  }),
  hand: z.array(hand),
  ways: z.array(id),
  back: id,
  instructions: z.strictObject({ take: z.string(), before: z.string(), review: z.string() }),
});

export const definitionSchema = z.strictObject({
  schema: z.literal(BOARD_SCHEMA),
  name: z.string(),
  item: z.string(),
  icon: z.string(),
  title: z.string(),
  parts: z.record(id, part),
  form: z.array(z.strictObject({ ref: id, required: z.boolean() })),
  steps: z.array(step),
  anytime: z.array(id),
  layout: z.record(id, z.enum(ZONES)),
  row: z.array(id),
  about: z.string(),
  idle: z.string(),
  cap: z.strictObject({ on: z.boolean(), n: z.number() }),
  samples: z.array(z.string()),
  template: z.string().optional(),
});

export type DefinitionReading =
  | { ok: true; definition: BoardDefinition }
  | { ok: false; problems: string[] };

export function parseDefinition(raw: unknown): DefinitionReading {
  const result = definitionSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      problems: result.error.issues.map(
        (issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`,
      ),
    };
  }
  const definition = result.data as BoardDefinition;
  const misfiled = Object.entries(definition.parts)
    .filter(([key, value]) => key !== value.id)
    .map(([key, value]) => `parts.${key}: the part says its id is ${value.id}`);
  if (misfiled.length > 0) return { ok: false, problems: misfiled };
  const clashes = idClashes(definition);
  if (clashes.length > 0) return { ok: false, problems: clashes };
  return { ok: true, definition };
}

// Ids the engine gives a meaning of its own: where a way or a send-back leads, the title, and the
// suffixes of a step's review states.
const RESERVED = new Set([DONE, DROPPED, SAME, TITLE]);
const REVIEW_SUFFIX = /__(review|yours)$/;

// Ids a step or a part cannot take, though they have the shape of one: a reserved word, a state
// suffix, or a step id another step already has. The editor never makes them; a hand-written or an
// agent's board.json can.
function idClashes(definition: BoardDefinition): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  definition.steps.forEach(({ id }, index) => {
    const at = `steps.${index}.id`;
    if (RESERVED.has(id)) problems.push(`${at}: ${id} is a word the board keeps for itself`);
    else if (REVIEW_SUFFIX.test(id))
      problems.push(`${at}: a step id cannot end in __review or __yours`);
    else if (seen.has(id)) problems.push(`${at}: another step already has the id ${id}`);
    else if (id in definition.parts)
      problems.push(`${at}: a field or evidence already has the id ${id}`);
    seen.add(id);
  });
  for (const id of Object.keys(definition.parts)) {
    if (RESERVED.has(id)) problems.push(`parts.${id}: ${id} is a word the board keeps for itself`);
  }
  return problems;
}

// Reads a stored definition, which was checked when written: a failure here is a corrupt row.
export function readDefinition(json: string): BoardDefinition {
  const reading = parseDefinition(JSON.parse(json));
  if (!reading.ok) throw new Error(`Corrupt board definition: ${reading.problems.join('; ')}`);
  return reading.definition;
}
