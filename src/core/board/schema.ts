import { z } from 'zod';
import {
  BOARD_SCHEMA,
  type BoardDefinition,
  DONE,
  DROPPED,
  EVIDENCE_KINDS,
  FIELD_KINDS,
  PLACES,
  SAME,
  TITLE,
  WAITS,
  ZONES,
} from './model.ts';
import { placeOf, shapeProblems } from './shape-words.ts';

// The shape of a board definition as it travels (PUT draft) and as it is stored (a version or a
// draft row): checked whole, so a malformed document never reaches the engine. Problems a person
// can fix in the editor (a duplicate name, a bad way) are not shape errors: problemsOf finds them.
// Every key says what it is for, with an example: the JSON Schema published for agents
// (schemas/board.schema.json) and the words of a shape error read them.

const about = (description: string, ...examples: unknown[]) => ({ description, examples });

const ID = /^[a-z][a-z0-9_-]*$/;

const id = z
  .string()
  .regex(ID, 'is not an id: lowercase letters, digits, - and _, starting with a letter');

// An id: of the thing itself, or of the step or part it names.
const idOf = (description: string, ...examples: unknown[]) =>
  id.meta(about(description, ...examples));

const ids = (description: string, ...examples: unknown[]) =>
  z.array(id).meta(about(description, ...examples));

const text = (description: string, ...examples: unknown[]) =>
  z.string().meta(about(description, ...examples));

const flag = (description: string, example: boolean) =>
  z.boolean().meta(about(description, example));

// A motive names a closed state of its own (dropped__<id>), whose name takes no dash.
const STATE_KEY = /^[a-z][a-z0-9_]*$/;

const agent = z.strictObject({
  agent: z.string().min(1).meta(about('The Otea name of the agent', 'claude-b')),
});

const choice = z
  .strictObject({
    id: idOf('The hidden id of the choice', 'chigh'),
    name: text('What the choice reads', 'High'),
  })
  .meta(about('A choice of the field', { id: 'chigh', name: 'High' }));

const part = z
  .strictObject({
    id: idOf('The hidden id of the part: its key in parts', 'fsteps'),
    name: text('What the field or evidence is called', 'Steps to reproduce'),
    kind: z
      .enum([...FIELD_KINDS, ...EVIDENCE_KINDS])
      .meta(
        about(
          `A field (${FIELD_KINDS.join(', ')}) or evidence (${EVIDENCE_KINDS.join(', ')})`,
          'long',
          'images',
        ),
      ),
    hint: text('What goes here: the line agents read', 'The commands that show the bug', ''),
    options: z
      .array(choice)
      .meta(
        about(
          'The choices of a choice, multi or check field; empty for any other kind',
          [{ id: 'chigh', name: 'High' }],
          [],
        ),
      ),
    show: text(
      'How evidence shows: images as gallery, one or ba; video as strip or player',
      'gallery',
    ).optional(),
    initial: text(
      'The value a new item starts with: a choice id, a level (low, medium, high, critical), yes or no',
      'chigh',
    ).optional(),
    guard: z
      .strictObject({
        push: ids('The steps (ids) during which the branch may be pushed', ['simplement']),
        repo: idOf('The field (part id) the repository is read from', 'frepo').optional(),
        base: text(
          'The base branch Otea protects too: agents push or merge into it only to bring in an item that is Done',
          'main',
        ).optional(),
      })
      .meta(
        about('A branch field only: Otea protects the branch', {
          push: ['simplement'],
          repo: 'frepo',
          base: 'main',
        }),
      )
      .optional(),
  })
  .meta(
    about('A field (something to fill) or a piece of evidence (something to show)', {
      id: 'fsteps',
      name: 'Steps to reproduce',
      kind: 'long',
      hint: '',
      options: [],
    }),
  );

const hand = z
  .strictObject({
    ref: idOf('The part (id) the step hands off, or title', 'fsteps'),
    req: z
      .enum(['always', 'when', 'no'], { error: 'must be "always", "when" or "no"' })
      .meta(
        about(
          'Whether it is required: always, only when another part has a value, or no',
          'always',
        ),
      ),
    when: z
      .strictObject({
        part: idOf('The choice, multi, level or yesno part (id) it reads', 'fseverity'),
        value: text('The value that makes it required: a choice id, a level, yes or no', 'high'),
      })
      .meta(
        about('With req "when": which part and value make it required', {
          part: 'fseverity',
          value: 'high',
        }),
      )
      .optional(),
    fresh: flag('Evidence only: new in each round, so a send-back empties it', false),
  })
  .meta(about('One thing the step hands off', { ref: 'fsteps', req: 'always', fresh: false }));

const step = z
  .strictObject({
    id: idOf('The hidden id of the step', 'sfix'),
    name: text('What the step is called', 'Fix'),
    doer: z
      .union([z.enum(['you', 'any']), agent], {
        error: 'must be "you", "any" or {"agent": "<name>"}',
      })
      .meta(
        about('Who does the step: "you" (the person), "any" agent, or one agent', 'any', {
          agent: 'claude-b',
        }),
      ),
    reviewer: z
      .union([z.enum(['none', 'you']), agent], {
        error: 'must be "none", "you" or {"agent": "<name>"}',
      })
      .meta(about('Who reviews the step: "none", "you" (the person), or one agent', 'you')),
    hand: z
      .array(hand)
      .meta(about('What the step hands off', [{ ref: 'fsteps', req: 'always', fresh: false }])),
    ways: ids(
      'Ways out besides the next step: a later step (id) or done, or an earlier step to take the item back to',
      ['done'],
      [],
    ),
    back: idOf('Where a send-back lands: same (this step) or an earlier step id', 'same'),
    instructions: z
      .strictObject({
        take: text('What an agent reads when it takes the step', 'Reproduce it first.'),
        before: text('What an agent reads before it hands the step off', 'Run the tests.'),
        review: text('What an agent reviewing the step reads', 'Check the test fails first.'),
      })
      .meta(
        about('The instructions agents read on the step', {
          take: 'Reproduce it first.',
          before: 'Run the tests.',
          review: '',
        }),
      ),
    note: z
      .strictObject({
        req: z
          .enum(['no', 'always'], { error: 'must be "no" or "always"' })
          .meta(about('Whether each handoff needs a note', 'always')),
        hint: text('What goes in the note', 'What you ran and what you saw'),
      })
      .default({ req: 'no', hint: '' })
      .meta(about('The note the doer writes with each handoff', { req: 'no', hint: '' })),
    waits: z
      .array(z.enum(WAITS, { error: 'must be "parts" or "blockers"' }))
      .default([])
      .meta(
        about(
          'What the step waits for before it is handed off: its parts closed, its blockers closed',
          ['blockers'],
          [],
        ),
      ),
    skipWhenReady: flag(
      'First step nobody reviews only: an item created with all it hands off starts at the next step',
      false,
    ).default(false),
    doerMayDrop: flag('Whether an agent doing it may drop the item, saying why', false).default(
      false,
    ),
  })
  .meta(about('A step of the board, in order'));

export const definitionSchema = z
  .strictObject({
    // A version 1 definition reads as version 2, every later setting at its default.
    schema: z
      .union([z.literal(1), z.literal(BOARD_SCHEMA)], { error: `must be ${BOARD_SCHEMA}` })
      .meta(about(`The version of the board format: write ${BOARD_SCHEMA}`, BOARD_SCHEMA))
      .transform(() => BOARD_SCHEMA),
    name: text('The name of the board', 'Bugs'),
    item: text('What one item of the board is called', 'Bug'),
    icon: text('The icon: board, bug, paw, book, inbox, flask or check2', 'bug'),
    title: text('The name of the title field every item has', 'Title'),
    parts: z.record(id, part).meta(
      about('The fields and evidence of the board, by id', {
        fsteps: { id: 'fsteps', name: 'Steps to reproduce', kind: 'long', hint: '', options: [] },
      }),
    ),
    form: z
      .array(
        z
          .strictObject({
            ref: idOf('A field (id) the creation form asks for', 'fsteps'),
            required: flag('Whether the form requires it', true),
          })
          .meta(about('A field of the creation form', { ref: 'fsteps', required: true })),
      )
      .meta(
        about('The creation form besides the title, in order', [{ ref: 'fsteps', required: true }]),
      ),
    steps: z
      .array(step)
      .meta(
        about(
          'The steps, in order: the default way out of each is the next one, and done after the last',
        ),
      ),
    anytime: ids('Parts (ids) that can be filled at any step', ['fbranch'], []),
    layout: z.record(id, z.enum(ZONES)).meta(
      about(`Where each part (or rounds, or parts) shows on the item page: ${ZONES.join(', ')}`, {
        fsteps: 'main',
        rounds: 'side',
      }),
    ),
    row: ids('The parts (ids) the list row shows, in order', ['fseverity'], []),
    about: text('About this board: what it is for', 'Bugs found in the app, until fixed.'),
    idle: text('What an agent does when the board has nothing for it', 'Look for new bugs.'),
    cap: z
      .strictObject({
        on: flag('Whether agents add items only while few wait for the person', false),
        n: z.number().meta(about('How many may wait for the person', 3)),
      })
      .meta(about('The cap on the items agents add', { on: false, n: 3 })),
    samples: z
      .array(z.string())
      .meta(about('Titles of the sample items previews draw', ['Login fails on Safari'], [])),
    template: text('The template it was copied from, for the record', 'bugs').optional(),
    split: z
      .strictObject({
        board: idOf('The board (hidden id) its items divide into, or same', 'same'),
        always: flag('Whether a part is never created alone', false),
      })
      .meta(
        about('"Se divide en": the board each item divides into', { board: 'same', always: false }),
      )
      .optional(),
    madeWith: ids('The boards (hidden ids) a template made with this one', ['bbugs']).optional(),
    drop: z
      .strictObject({
        by: z
          .enum(['page', 'anyone'], { error: 'must be "page" or "anyone"' })
          .meta(
            about(
              'Who may drop an item: only from its page, or anyone (an agent too, asked to)',
              'anyone',
            ),
          ),
        motives: z
          .array(
            z
              .strictObject({
                id: z
                  .string()
                  .regex(
                    STATE_KEY,
                    'is not a motive id: lowercase letters, digits and _, starting with a letter',
                  )
                  .meta(about('The hidden id of the motive', 'wont_fix')),
                name: text('What the motive reads', "Won't fix"),
              })
              .meta(about('A motive a drop names', { id: 'wont_fix', name: "Won't fix" })),
          )
          .meta(about('The motives a drop names', [{ id: 'duplicate', name: 'Duplicate' }], [])),
      })
      .default({ by: 'anyone', motives: [] })
      .meta(
        about('Who may drop an item, and the motives a drop names', { by: 'anyone', motives: [] }),
      ),
    list: z
      .strictObject({
        as: z.enum(['list', 'table']).meta(about('How the published list shows its items', 'list')),
        group: idOf(
          'What it groups by: a choice, level or yesno part (id), step or motive',
          'step',
        ).optional(),
      })
      .default({ as: 'list' })
      .meta(about('How the published list shows its items', { as: 'list' })),
  })
  .meta({
    title: 'Otea board',
    description:
      'A board definition (board.json): what `otea board draft <id>` prints and `otea board draft <id> --file board.json` reads.',
  });

// The JSON Schema of board.json, published as schemas/board.schema.json: what an agent writes, so
// a setting that has a default may be left out.
export function boardJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(definitionSchema, { io: 'input' }) as Record<string, unknown>;
}

let published: Record<string, unknown> | undefined;

export type DefinitionReading =
  | { ok: true; definition: BoardDefinition }
  | { ok: false; problems: string[] };

export function parseDefinition(raw: unknown): DefinitionReading {
  const result = definitionSchema.safeParse(raw);
  if (!result.success) {
    published ??= boardJsonSchema();
    return { ok: false, problems: shapeProblems(raw, result.error.issues, published) };
  }
  const definition = result.data as BoardDefinition;
  const misfiled = Object.entries(definition.parts)
    .filter(([key, value]) => key !== value.id)
    .map(([key, value]) =>
      problem(raw, ['parts', key, 'id'], `the part says its id is ${value.id}`),
    );
  if (misfiled.length > 0) return { ok: false, problems: misfiled };
  const clashes = idClashes(raw, definition);
  if (clashes.length > 0) return { ok: false, problems: clashes };
  return { ok: true, definition };
}

// A problem at a place of the board, in the words of a shape error.
function problem(raw: unknown, path: (string | number)[], words: string): string {
  return `${placeOf(raw, path)}: ${words} [${path.join('.')}]`;
}

// Ids the engine gives a meaning of its own: where a way or a send-back leads, the title, and the
// suffixes of a step's review states.
const RESERVED = new Set([DONE, DROPPED, SAME, TITLE, ...PLACES]);
const REVIEW_SUFFIX = /__(review|yours)$/;

// Ids a step or a part cannot take, though they have the shape of one: a reserved word, a state
// suffix, or a step id another step already has. The editor never makes them; a hand-written or an
// agent's board.json can.
function idClashes(raw: unknown, definition: BoardDefinition): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  definition.steps.forEach(({ id }, index) => {
    const at = (words: string) => problems.push(problem(raw, ['steps', index, 'id'], words));
    if (RESERVED.has(id)) at(`${id} is a word the board keeps for itself`);
    else if (REVIEW_SUFFIX.test(id)) at('a step id cannot end in __review or __yours');
    else if (seen.has(id)) at(`another step already has the id ${id}`);
    else if (id in definition.parts) at(`a field or evidence already has the id ${id}`);
    seen.add(id);
  });
  for (const [id, part] of Object.entries(definition.parts)) {
    if (RESERVED.has(id))
      problems.push(problem(raw, ['parts', id], `${id} is a word the board keeps for itself`));
    if (part.guard && part.kind !== 'branch')
      problems.push(problem(raw, ['parts', id, 'guard'], 'only a branch field is protected'));
  }
  const motives = new Set<string>();
  definition.drop.motives.forEach(({ id }, index) => {
    if (motives.has(id))
      problems.push(
        problem(raw, ['drop', 'motives', index, 'id'], `another motive already has the id ${id}`),
      );
    motives.add(id);
  });
  return problems;
}

// Reads a stored definition, which was checked when written: a failure here is a corrupt row.
export function readDefinition(json: string): BoardDefinition {
  const reading = parseDefinition(JSON.parse(json));
  if (!reading.ok) throw new Error(`Corrupt board definition: ${reading.problems.join('; ')}`);
  return reading.definition;
}
