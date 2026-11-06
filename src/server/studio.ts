import { readFileSync } from 'node:fs';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { applyBlueprint, editBlueprint, updateBlueprint } from '../app/blueprints.ts';
import type { Project } from '../app/project.ts';
import {
  copyBoardPreset,
  createPreset,
  customizeBoard,
  customizePreset,
  deletePreset,
  duplicatePreset,
  listStudioBlueprints,
  listStudioPresets,
  projectBlueprintState,
  readPresetSamples,
  readPresetSource,
  revertBoard,
  sampleAsset,
  savePreset,
} from '../app/studio.ts';
import type { ChangeFeed } from './changes.ts';
import { RejectedRequest } from './errors.ts';
import type { Session } from './session.ts';
import { assertConfigurable } from './writes.ts';

// Studio's routes: presets and blueprints as files. Reads are open like the rest of the API;
// every write changes the project's setup, so it comes from this computer's signed-in browser as a
// same-origin JSON request, never from a paired device.

const NAME = /^[a-z0-9][a-z0-9-]*$/;

const PresetDraftBody = z.strictObject({
  yaml: z.string(),
  playbooks: z.record(z.string(), z.string()).optional(),
  samples: z.string().optional(),
});

const DuplicateBody = z.strictObject({ as: z.string().min(1) });

const CreateBody = z.strictObject({ name: z.string().min(1) });

const BlueprintEditBody = z.strictObject({
  boards: z.array(z.strictObject({ name: z.string().min(1), preset: z.string().min(1) })),
  connections: z.array(z.string()),
  playbook: z.string().nullable(),
});

const ApplyBody = z.strictObject({ name: z.string().regex(NAME) });

// The name of the project copy of a board's preset, made before a change to an official one.
const CopyPresetBody = z.strictObject({ as: z.string().regex(NAME) });

const CustomizeBody = z.strictObject({ yaml: z.string() });

const RevertBody = z.strictObject({
  previous: z.strictObject({ preset: z.string().regex(NAME), yaml: z.string() }),
});

function boardParam(c: Context): string {
  const board = c.req.param('board') ?? '';
  if (!NAME.test(board))
    throw new RejectedRequest(400, 'invalid_name', `"${board}" is not a board`);
  return board;
}

async function body<T>(c: Context, schema: z.ZodType<T>, expected: string): Promise<T> {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new RejectedRequest(400, 'invalid_body', `Expected ${expected}`);
  return parsed.data;
}

// A sample's file, for the preview to draw; never cached, since a save may replace it.
function serveSample(c: Context, project: Project): Response {
  const { path, contentType } = sampleAsset(
    project,
    c.req.param('name') ?? '',
    c.req.param('file') ?? '',
  );
  return c.body(readFileSync(path), 200, {
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
    'content-security-policy': 'sandbox',
    'cache-control': 'no-cache',
  });
}

export function studioApi(project: Project, feed: ChangeFeed, auth: Session): Hono {
  return new Hono()
    .get('/presets', (c) => c.json(listStudioPresets(project)))
    .post('/presets', async (c) => {
      assertConfigurable(c, auth);
      const { name } = await body(c, CreateBody, '{"name": string}');
      const created = createPreset(project, name);
      feed.notify();
      return c.json(created, 201);
    })
    .get('/presets/:name', (c) => c.json(readPresetSource(project, c.req.param('name'))))
    .get('/presets/:name/samples', (c) => c.json(readPresetSamples(project, c.req.param('name'))))
    .get('/presets/:name/samples/:file', (c) => serveSample(c, project))
    .post('/presets/:name', async (c) => {
      assertConfigurable(c, auth);
      const draft = await body(
        c,
        PresetDraftBody,
        '{"yaml": string, "playbooks"?: {[path]: string}, "samples"?: string}',
      );
      const saved = savePreset(project, c.req.param('name'), {
        yaml: draft.yaml,
        ...(draft.playbooks === undefined ? {} : { playbooks: draft.playbooks }),
        ...(draft.samples === undefined ? {} : { samples: draft.samples }),
      });
      feed.notify();
      return c.json(saved);
    })
    .post('/presets/:name/delete', (c) => {
      assertConfigurable(c, auth);
      const deleted = deletePreset(project, c.req.param('name'));
      feed.notify();
      return c.json(deleted);
    })
    .post('/presets/:name/duplicate', async (c) => {
      assertConfigurable(c, auth);
      const { as } = await body(c, DuplicateBody, '{"as": string}');
      const copy = duplicatePreset(project, c.req.param('name'), as);
      feed.notify();
      return c.json(copy, 201);
    })
    .get('/blueprints', (c) => c.json(listStudioBlueprints(project)))
    .get('/blueprint', (c) => c.json(projectBlueprintState(project)))
    .post('/blueprint', async (c) => {
      assertConfigurable(c, auth);
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
      assertConfigurable(c, auth);
      // By name only: a browser never points the server at a path on disk.
      const { name } = await body(c, ApplyBody, '{"name": string}');
      const applied = applyBlueprint(project, name, project.root);
      feed.notify();
      return c.json(applied, 201);
    })
    .post('/blueprint/boards/:board/copy-preset', async (c) => {
      assertConfigurable(c, auth);
      const { as } = await body(c, CopyPresetBody, '{"as": string}');
      const copied = copyBoardPreset(project, c.req.param('board'), as);
      feed.notify();
      return c.json(copied, 201);
    })
    .post('/boards/:board/customize', async (c) => {
      assertConfigurable(c, auth);
      const board = boardParam(c);
      const { yaml } = await body(c, CustomizeBody, '{"yaml": string}');
      const customized = customizeBoard(project, board, yaml);
      feed.notify();
      return c.json(customized);
    })
    .post('/presets/:name/customize', async (c) => {
      assertConfigurable(c, auth);
      const { yaml } = await body(c, CustomizeBody, '{"yaml": string}');
      const customized = customizePreset(project, c.req.param('name'), yaml);
      feed.notify();
      return c.json(customized);
    })
    .post('/boards/:board/revert', async (c) => {
      assertConfigurable(c, auth);
      const board = boardParam(c);
      const { previous } = await body(c, RevertBody, '{"previous": {"preset", "yaml"}}');
      const reverted = revertBoard(project, board, previous);
      feed.notify();
      return c.json(reverted);
    })
    .post('/blueprint/update', async (c) => {
      assertConfigurable(c, auth);
      const updated = updateBlueprint(project);
      feed.notify();
      return c.json(updated);
    });
}
