import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Channel } from '../core/authority.ts';
import type { Actor } from '../core/item.ts';
import { addCollection } from './collections.ts';
import { attachEvidence } from './evidence.ts';
import { createItem, getItem, moveItem, showItem } from './items.ts';
import { claimItem } from './leases.ts';
import { OFFICIAL_PRESETS_DIR, requirePreset } from './presets.ts';
import type { Project } from './project.ts';
import { relayDecision } from './relay.ts';
import { memoryContext, projectOf } from './testing.ts';
import { validateProject } from './validate.ts';

const claude: Actor = { kind: 'agent', name: 'claude' };
const human: Actor = { kind: 'human', name: 'human' };
const at = () => '2026-01-01T00:00:00.000Z';

const playbook = (preset: string) =>
  readFileSync(join(OFFICIAL_PRESETS_DIR, preset, 'playbook.md'), 'utf8');

describe('the architecture and review presets', () => {
  let root: string;
  let project: Project;

  const move = (
    id: string,
    to: string,
    actor = claude,
    channel: Channel = 'cli',
    reason?: string,
  ) => moveItem(project, { id, to, actor, channel, ...(reason ? { reason } : {}) }, at);
  const file = (name: string, content: string) => {
    const path = join(root, name);
    writeFileSync(path, content);
    return path;
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'otea-presets-new-'));
    project = projectOf(root, memoryContext());
    addCollection(project, { name: 'decisions', preset: 'architecture' });
    addCollection(project, { name: 'creatures', preset: 'review' });
  });

  afterEach(() => {
    project.db.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('ship as official presets with playbooks, icons and one named type each', () => {
    const architecture = requirePreset(project.presets, 'architecture');
    const review = requirePreset(project.presets, 'review');

    expect(architecture).toMatchObject({ origin: 'official', version: 1, icon: 'diagram' });
    expect(review).toMatchObject({ origin: 'official', version: 1, icon: 'compare' });
    expect(architecture.types.map(({ name, icon }) => [name, icon])).toEqual([
      ['decision', 'diagram'],
    ]);
    expect(review.types.map(({ name, icon }) => [name, icon])).toEqual([['piece', 'compare']]);

    expect(project.presets.problems).toEqual([]);
    expect(validateProject(project)).toEqual({ errors: 0, warnings: 0, findings: [] });
  });

  it('take a decision from drafting to accepted, through a round of revision', () => {
    const { id } = createItem(
      project,
      { collection: 'decisions', title: 'Rotate keys with an overlap', fields: {}, actor: claude },
      at,
    );
    expect(getItem(project, id, at)).toMatchObject({ state: 'drafting', turn: 'agent' });

    move(id, 'review');
    expect(() => move(id, 'accepted')).toThrow(expect.objectContaining({ code: 'forbidden' }));
    move(id, 'revising', human, 'ui', 'What does mobile do with cached tokens?');
    claimItem(project, { id, actor: claude }, at);
    move(id, 'review');

    expect(move(id, 'accepted', human, 'ui')).toMatchObject({ state: 'accepted', turn: 'none' });
  });

  it('draws an attached Mermaid file in the decision diagram, versioned by attach', () => {
    const { id } = createItem(
      project,
      { collection: 'decisions', title: 'One project per folder', fields: {}, actor: claude },
      at,
    );
    const input = { id, actor: claude, channel: 'cli' as const };
    attachEvidence(project, { ...input, path: file('flow.mmd', 'flowchart LR\n  a --> b') }, at);
    attachEvidence(project, { ...input, path: file('flow.mmd', 'flowchart LR\n  a --> c') }, at);

    const evidence = showItem(project, id, { actor: claude, channel: 'cli' }, at).evidence;
    expect(evidence.map(({ module, kind }) => [module, kind])).toEqual([
      ['diagram', 'diagram'],
      ['diagram', 'diagram'],
    ]);
  });

  it('hand a piece to review only with its note, and let the human send it back', () => {
    const { id } = createItem(
      project,
      { collection: 'creatures', title: 'Moth idle loop', fields: {}, actor: claude },
      at,
    );
    move(id, 'in_progress');
    attachEvidence(
      project,
      { id, path: file('idle_r1.mp4', 'video'), actor: claude, channel: 'cli' },
      at,
    );
    expect(() => move(id, 'review')).toThrow(expect.objectContaining({ code: 'reason_required' }));
    move(id, 'review', claude, 'cli', 'First pass: 6 frames');

    expect(() => move(id, 'approved', claude)).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    relayDecision(
      project,
      {
        id,
        to: 'in_progress',
        // Another agent relays it: claude did the piece.
        via: 'codex',
        channel: 'cli',
        quote: 'Too frantic',
        reason: 'Too frantic',
      },
      at,
    );
    expect(getItem(project, id, at)).toMatchObject({ state: 'in_progress', turn: 'agent' });
    expect(showItem(project, id, { actor: claude, channel: 'cli' }, at).evidence[0]?.module).toBe(
      'recording',
    );
  });

  it('ship playbooks that name the round note and the options format', () => {
    expect(playbook('review')).toContain('otea move <id> review --reason');
    expect(playbook('architecture')).toContain('### <letter> · <name>');
    expect(playbook('architecture')).toContain('otea attach <id> rotation.mmd');
  });
});
