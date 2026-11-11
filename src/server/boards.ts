import { type Context, Hono } from 'hono';
import { z } from 'zod';
import {
  boardProblems,
  createBoard,
  discardDraft,
  getBoardRecord,
  listBoardSummaries,
  listTemplates,
  publishBoard,
  publishPlan,
  restoreBoard,
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
// Contract for the slices (see the Studio PLAN): the routes answering 501 are filled by the server
// slice; the bodies and answers here are the shapes the UI's board-studio/api.ts reads.

const lang = z.enum(LANGS as [Lang, ...Lang[]]);

const CreateBody = z.strictObject({
  name: z.string(),
  item: z.string().optional(),
  template: z.string().optional(),
  lang,
});

const DraftBody = z.strictObject({
  definition: z.unknown(),
  baseVersion: z.number().int().positive().nullable(),
});

const PublishBody = z.strictObject({ moves: z.record(z.string(), z.string()) });

const RestoreBody = z.strictObject({ version: z.number().int().positive().nullable() });

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

function notYet(what: string): never {
  throw new RejectedRequest(501, 'not_implemented', `${what} is not built yet`);
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
      // "Que lo esboce un agente": creates the Pedido and a waiting board (server slice).
      .post('/boards/agent-draft', (c) => {
        assertConfigurable(c, auth);
        return notYet('Having an agent draft a board');
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
      .post('/boards/:id/draft/merge', (c) => {
        assertConfigurable(c, auth);
        return notYet('Merging an agent draft');
      })
      .post('/boards/:id/publish/plan', (c) => c.json(publishPlan(project, id(c))))
      .post('/boards/:id/publish', async (c) => {
        assertConfigurable(c, auth);
        const { moves } = await body(c, PublishBody, '{"moves": {[stepId]: stepId | "done"}}');
        const result = publishBoard(project, id(c), { moves, by: HUMAN });
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
