import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { mergeAgentDraft, requestAgentDraft } from '../app/agent-draft.ts';
import {
  boardProblems,
  createBoard,
  createBoardSet,
  discardDraft,
  getBoardRecord,
  listBoardSummaries,
  listTemplates,
  publishBoard,
  publishPair,
  publishPlan,
  restoreBoard,
  restorePair,
  saveDraft,
} from '../app/boards.ts';
import type { Project } from '../app/project.ts';
import { LANGS, type Lang } from '../core/board/templates.ts';
import type { ChangeFeed } from './changes.ts';
import { RejectedRequest } from './errors.ts';
import type { Session } from './session.ts';
import { assertConfigurable } from './writes.ts';

// Studio's boards: drafts, publish (with its plan), restore and discard, and the templates. Reads
// are open like the rest of the API; every write changes how the project works, so, like Studio's
// other writes, it comes from this computer's signed-in browser.
//
// The bodies and answers here are the shapes the UI's board-studio/api.ts reads.

const lang = z.enum(LANGS as [Lang, ...Lang[]]);

const CreateBody = z.strictObject({
  name: z.string(),
  item: z.string().optional(),
  template: z.string().optional(),
  lang,
});

const SetBody = z.strictObject({
  set: z.string(),
  lang,
  boards: z.array(z.strictObject({ name: z.string().optional(), item: z.string().optional() })),
});

const DraftBody = z.strictObject({
  definition: z.unknown(),
  baseVersion: z.number().int().positive().nullable(),
  draftStamp: z.string().nullable().optional(),
});

const PublishBody = z.strictObject({
  moves: z.record(z.string(), z.string()),
  draftStamp: z.string().nullable().optional(),
});

const RestoreBody = z.strictObject({ version: z.number().int().positive().nullable() });

const Moves = z.record(z.string(), z.string());
const Stamp = z.string().nullable();
const Version = z.number().int().positive().nullable();

// A board that "se divide en" another and that board; a role is acted on when it is named.
const PublishPairBody = z.strictObject({
  parent: z.string(),
  child: z.string(),
  moves: z.strictObject({ parent: Moves.optional(), child: Moves.optional() }),
  draftStamps: z.strictObject({ parent: Stamp.optional(), child: Stamp.optional() }).optional(),
});

const RestorePairBody = z.strictObject({
  parent: z.string(),
  child: z.string(),
  versions: z.strictObject({ parent: Version.optional(), child: Version.optional() }),
});

// Drops the roles a body left out, so an absent role stays absent (exactOptionalPropertyTypes).
function roles<T>(value: { parent?: T | undefined; child?: T | undefined } | undefined) {
  return {
    ...(value?.parent === undefined ? {} : { parent: value.parent }),
    ...(value?.child === undefined ? {} : { child: value.child }),
  };
}

const AgentDraftBody = z.strictObject({
  name: z.string(),
  need: z.string(),
  agent: z.string().min(1).nullable(),
  lang,
});

const MergeBody = z.strictObject({ evidence: z.number().int().positive() });

const HUMAN = { kind: 'human' as const, name: 'human' };

async function body<T>(c: Context, schema: z.ZodType<T>, expected: string): Promise<T> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new RejectedRequest(400, 'invalid_body', `Expected ${expected}`);
  return parsed.data;
}

function langOf(c: Context): Lang {
  return c.req.query('lang') === 'es' ? 'es' : 'en';
}

export function boardsApi(project: Project, feed: ChangeFeed, auth: Session): Hono {
  const id = (c: Context) => c.req.param('id') ?? '';
  return (
    new Hono()
      .get('/templates', (c) => c.json({ templates: listTemplates(langOf(c)) }))
      .get('/boards', (c) => c.json({ boards: listBoardSummaries(project) }))
      .post('/boards', async (c) => {
        assertConfigurable(c, auth);
        const input = await body(
          c,
          CreateBody,
          '{"name": string, "item"?: string, "template"?: string, "lang": "en" | "es"}',
        );
        const record = createBoard(project, {
          name: input.name,
          lang: input.lang,
          ...(input.item === undefined ? {} : { item: input.item }),
          ...(input.template === undefined ? {} : { template: input.template }),
        });
        feed.notify();
        return c.json(record, 201);
      })
      // A template that makes several boards: every one of them, as drafts, or none.
      .post('/boards/set', async (c) => {
        assertConfigurable(c, auth);
        const input = await body(
          c,
          SetBody,
          '{"set": string, "lang": "en" | "es", "boards": [{"name"?: string, "item"?: string}]}',
        );
        const records = createBoardSet(project, input);
        feed.notify();
        return c.json({ records }, 201);
      })
      // "Que lo esboce un agente": creates the Pedido and a waiting board (server slice).
      .post('/boards/agent-draft', async (c) => {
        assertConfigurable(c, auth);
        const input = await body(
          c,
          AgentDraftBody,
          '{"name": string, "need": string, "agent": string | null, "lang": "en" | "es"}',
        );
        const asked = requestAgentDraft(project, input);
        feed.notify();
        return c.json(asked, 201);
      })
      // The joined workspace's Publicar: both boards of a pair (or the one with changes), as one.
      .post('/boards/publish-pair', async (c) => {
        assertConfigurable(c, auth);
        const input = await body(
          c,
          PublishPairBody,
          '{"parent": id, "child": id, "moves": {"parent"?: moves, "child"?: moves}, "draftStamps"?: {"parent"?: string | null, "child"?: string | null}}',
        );
        const result = publishPair(project, {
          parent: input.parent,
          child: input.child,
          moves: roles(input.moves),
          draftStamps: roles(input.draftStamps),
          by: HUMAN,
        });
        feed.notify();
        return c.json(result);
      })
      // Its Deshacer: both boards back, or neither.
      .post('/boards/restore-pair', async (c) => {
        assertConfigurable(c, auth);
        const input = await body(
          c,
          RestorePairBody,
          '{"parent": id, "child": id, "versions": {"parent"?: number | null, "child"?: number | null}}',
        );
        const result = restorePair(project, {
          parent: input.parent,
          child: input.child,
          versions: roles(input.versions),
          by: HUMAN,
        });
        feed.notify();
        return c.json(result);
      })
      .get('/boards/:id', (c) => {
        const record = getBoardRecord(project, id(c));
        const definition = (record.draft ?? record.live)?.definition;
        const problems = definition ? boardProblems(project, record.id, definition) : [];
        return c.json({ record, problems });
      })
      .put('/boards/:id/draft', async (c) => {
        assertConfigurable(c, auth);
        const input = await body(
          c,
          DraftBody,
          '{"definition": board, "baseVersion": number | null}',
        );
        const saved = saveDraft(project, id(c), {
          definition: input.definition,
          baseVersion: input.baseVersion,
          ...(input.draftStamp === undefined ? {} : { draftStamp: input.draftStamp }),
        });
        feed.notify();
        return c.json(saved);
      })
      .delete('/boards/:id/draft', (c) => {
        assertConfigurable(c, auth);
        const result = discardDraft(project, id(c));
        feed.notify();
        return c.json(result);
      })
      // Merges an agent's board draft (its evidence on the Pedido) into the draft (server slice).
      .post('/boards/:id/draft/merge', async (c) => {
        assertConfigurable(c, auth);
        const { evidence } = await body(c, MergeBody, '{"evidence": number}');
        const record = mergeAgentDraft(project, id(c), evidence);
        feed.notify();
        return c.json(record);
      })
      .post('/boards/:id/publish/plan', (c) => c.json(publishPlan(project, id(c))))
      .post('/boards/:id/publish', async (c) => {
        assertConfigurable(c, auth);
        const { moves, draftStamp } = await body(
          c,
          PublishBody,
          '{"moves": {[stepId]: stepId | "done"}, "draftStamp"?: string | null}',
        );
        const result = publishBoard(project, id(c), {
          moves,
          by: HUMAN,
          ...(draftStamp === undefined ? {} : { draftStamp }),
        });
        feed.notify();
        return c.json(result);
      })
      .post('/boards/:id/restore', async (c) => {
        assertConfigurable(c, auth);
        const { version } = await body(c, RestoreBody, '{"version": number | null}');
        const record = restoreBoard(project, id(c), { version, by: HUMAN });
        feed.notify();
        return c.json(record);
      })
  );
}
