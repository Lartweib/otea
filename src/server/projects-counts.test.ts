import { describe, expect, it } from 'vitest';
import { addCollection } from '../app/collections.ts';
import { createItem, moveItem } from '../app/items.ts';
import { claimItem } from '../app/leases.ts';
import type { Actor } from '../core/item.ts';
import { countsOf } from './projects.ts';
import { memoryProject } from './testing.ts';

const bot: Actor = { kind: 'agent', name: 'claude' };

// The projects page's «Te espera» and the count beside the switcher say the same as Te toca: an
// item whose agent went quiet (its lease ran out) waits for you to restart or reassign it. It was
// counted with the agents' and missing from «Te espera» (ONB3-5).
describe('what waits for you in a project', () => {
  it('lists an item whose agent went quiet with what waits for you, not with the agents', () => {
    const project = memoryProject();
    addCollection(project, { name: 'tasks' });
    const made = (title: string) =>
      createItem(project, { collection: 'tasks', title, fields: { description: 'x' }, actor: bot })
        .id;
    const review = made('To review');
    const quiet = made('Gone quiet');
    made('Queued for an agent');
    moveItem(project, { id: review, to: 'in_progress', actor: bot, channel: 'cli' });
    moveItem(project, { id: review, to: 'review', actor: bot, channel: 'cli' });
    claimItem(project, { id: quiet, actor: bot, ttlMs: 1 }, () => '2020-01-01T00:00:00.000Z');

    const counts = countsOf(project);
    expect(counts.waiting.map((item) => item.title)).toEqual(['To review', 'Gone quiet']);
    expect(counts.withAgents).toBe(1);
    expect(counts.open).toBe(3);
  });
});
