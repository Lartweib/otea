import { describe, expect, it } from 'vitest';
import { type BriefItem, briefLines, writeBrief } from './brief.ts';
import type { Relation } from './relations.ts';

const item = (id: string, fields: Record<string, unknown> = {}): BriefItem => ({
  id,
  title: `Title of ${id}`,
  collection: id.split('-')[0]?.toLowerCase() ?? '',
  state: 'todo',
  fields,
});

const blocks = (from: string, to: string): Relation => ({ kind: 'blocks', from, to });

const brief = (items: BriefItem[], relations: Relation[] = [], open: string[] = []) =>
  writeBrief({
    project: 'astra',
    items,
    relations,
    isOpen: (id) => open.includes(id),
    limits: ['No new dependencies.'],
    success: ['Tests pass.'],
    writtenAt: '2026-11-03 14:12',
  });

describe('writeBrief', () => {
  it('orders the items so what blocks one comes first, keeping the given order otherwise', () => {
    const { order } = brief(
      [item('BUGS-17'), item('BUGS-14'), item('TASK-3')],
      [blocks('TASK-3', 'BUGS-17')],
    );

    expect(order).toEqual([
      { id: 'TASK-3', title: 'Title of TASK-3', after: [], missing: [] },
      { id: 'BUGS-17', title: 'Title of BUGS-17', after: ['TASK-3'], missing: [] },
      { id: 'BUGS-14', title: 'Title of BUGS-14', after: [], missing: [] },
    ]);
  });

  it('flags an open blocker left out of the brief, and ignores a closed one', () => {
    const relations = [blocks('TASK-6', 'BUGS-15'), blocks('TASK-1', 'BUGS-15')];

    const { order, markdown } = brief([item('BUGS-15')], relations, ['TASK-6']);

    expect(order[0]?.missing).toEqual(['TASK-6']);
    expect(markdown).toContain('1. BUGS-15 · Title of BUGS-15 (needs TASK-6, not in this brief)');
    expect(markdown).toContain('- blocked: TASK-6 is not in this brief; stop and ask.');
  });

  it('writes the whole brief as Markdown: order, items with their fields, limits, success', () => {
    const items = [
      item('TASK-3', { description: 'Autosave owns its slot.', priority: 'high', steps: '' }),
      item('BUGS-17', { description: 'Slot 2 is overwritten.', steps: 'Quit\nduring autosave' }),
    ];

    expect(brief(items, [blocks('TASK-3', 'BUGS-17')]).markdown).toBe(
      [
        '# Brief · astra',
        '',
        '2 items · written 2026-11-03 14:12',
        '',
        'Work these items in the order below. Claim each one before you start and heartbeat while you work. Hand each one back with its evidence attached. If something is unclear, stop and ask in the item instead of guessing.',
        '',
        '## Order',
        '',
        '1. TASK-3 · Title of TASK-3',
        '2. BUGS-17 · Title of BUGS-17 (after TASK-3)',
        '',
        '## Items',
        '',
        '### TASK-3 · Title of TASK-3',
        '',
        'Autosave owns its slot.',
        '',
        '- board: task · todo',
        '- priority: high',
        '',
        '### BUGS-17 · Title of BUGS-17',
        '',
        'Slot 2 is overwritten.',
        '',
        '- board: bugs · todo',
        '- steps: Quit',
        '  during autosave',
        '- after: TASK-3',
        '',
        '## Limits',
        '',
        '- No new dependencies.',
        '',
        '## Success',
        '',
        '- Tests pass.',
        '',
        '## Hand back',
        '',
        'Move each item on to review when it holds. Leave a note on anything you skipped.',
        '',
      ].join('\n'),
    );
  });

  it('leaves out the limits and success sections when they are empty', () => {
    const { markdown } = writeBrief({
      project: 'astra',
      items: [item('TASK-1')],
      relations: [],
      isOpen: () => true,
      limits: [],
      success: [],
      writtenAt: 'now',
    });

    expect(markdown).toContain('1 item · written now');
    expect(markdown).not.toContain('## Limits');
    expect(markdown).not.toContain('## Success');
  });
});

describe('briefLines', () => {
  it('keeps one trimmed line per line typed, without the blank ones', () => {
    expect(briefLines('  One\n\nTwo  \n')).toEqual(['One', 'Two']);
  });
});
