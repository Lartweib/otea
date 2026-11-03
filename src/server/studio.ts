import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { applyBlueprint, editBlueprint, updateBlueprint } from '../app/blueprints.ts';
import type { Project } from '../app/project.ts';
import {
  duplicatePreset,
  listStudioBlueprints,
  listStudioPresets,
  projectBlueprintState,
  readPresetSource,
  savePreset,
} from '../app/studio.ts';
import type { ChangeFeed } from './changes.ts';
import { RejectedRequest } from './errors.ts';
import type { Session } from './session.ts';
import { assertWritable } from './writes.ts';

// Studio's routes: presets and blueprints as files. Reads are open like the rest of the API;
// every write takes the same signed-in, same-origin JSON request as the item writes.

const NAME = /^[a-z0-9][a-z0-9-]*$/;

const PresetDraftBody = z.strictObject({
  yaml: z.string(),
  playbooks: z.record(z.string(), z.string()).optional(),
});

const DuplicateBody = z.strictObject({ as: z.string().min(1) });

const BlueprintEditBody = z.strictObject({
  boards: z.array(z.strictObject({ name: z.string().min(1), preset: z.string().min(1) })),
  connections: z.array(z.string()),
  playbook: z.string().nullable(),
});

const ApplyBody = z.strictObject({ name: z.string().regex(NAME) });

async function body<T>(c: Context, schema: z.ZodType<T>, expected: string): Promise<T> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new RejectedRequest(400, 'invalid_body', `Expected ${expected}`);
  return parsed.data;
}

export function studioApi(project: Project, feed: ChangeFeed, auth: Session): Hono {
  return new Hono()
    .get('/presets', (c) => c.json(listStudioPresets(project)))
    .get('/presets/:name', (c) => c.json(readPresetSource(project, c.req.param('name'))))
    .post('/presets/:name', async (c) => {
      assertWritable(c, auth);
      const draft = await body(
        c,
        PresetDraftBody,
        '{"yaml": string, "playbooks"?: {[path]: string}}',
      );
      const saved = savePreset(project, c.req.param('name'), {
        yaml: draft.yaml,
        ...(draft.playbooks === undefined ? {} : { playbooks: draft.playbooks }),
      });
      feed.notify();
      return c.json(saved);
    })
    .post('/presets/:name/duplicate', async (c) => {
      assertWritable(c, auth);
      const { as } = await body(c, DuplicateBody, '{"as": string}');
      const copy = duplicatePreset(project, c.req.param('name'), as);
      feed.notify();
      return c.json(copy, 201);
    })
    .get('/blueprints', (c) => c.json(listStudioBlueprints(project)))
    .get('/blueprint', (c) => c.json(projectBlueprintState(project)))
    .post('/blueprint', async (c) => {
      assertWritable(c, auth);
      const edit = await body(
        c,
        BlueprintEditBody,
        '{"boards": [{"name", "preset"}], "connections": [string], "playbook": string | null}',
      );
      const edited = editBlueprint(project, edit);
      feed.notify();
      return c.json({ applied: edited.applied, ...projectBlueprintState(project) });
    })
    .post('/blueprint/apply', async (c) => {
      assertWritable(c, auth);
      // By name only: a browser never points the server at a path on disk.
      const { name } = await body(c, ApplyBody, '{"name": string}');
      const applied = applyBlueprint(project, name, project.root);
      feed.notify();
      return c.json(applied, 201);
    })
    .post('/blueprint/update', async (c) => {
      assertWritable(c, auth);
      const updated = updateBlueprint(project);
      feed.notify();
      return c.json(updated);
    });
}
