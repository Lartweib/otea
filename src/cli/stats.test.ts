import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createItem } from '../app/items.ts';
import { approveItem, handoffItem, sendBackItem } from '../app/next.ts';
import { openProject } from '../app/project.ts';
import { publishAs } from '../app/testing.ts';
import { creatures } from '../core/board/testing.ts';
import { saveProfile } from '../store/queries.ts';
import { type Cli, cliAt, type TempRepo, tempGitRepo } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };

// otea stats: how each model performs, as a text table or --json.
describe('otea stats', () => {
  let repo: TempRepo;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, {});
    await otea('init', '--local', '--template', 'none');
    const project = openProject(repo.dir);
    try {
      const def = creatures();
      for (const step of def.steps) step.hand = [];
      publishAs(project, def, 'bcri');
      const agents = [
        ['quill', 'claude-sonnet-5', 'medium'],
        ['kiln', 'claude-opus-5-5', 'high'],
      ] as const;
      for (const [agent, model, effort] of agents) {
        const at = new Date().toISOString();
        saveProfile(
          project.db,
          agent,
          { harness: 'claude-code', model, effort },
          {
            at,
            channel: 'cli',
            confirmed: true,
          },
        );
      }
      const quill = { kind: 'agent' as const, name: 'quill' };
      const kiln = { kind: 'agent' as const, name: 'kiln' };
      const fields = { fdesc: 'verde' };
      const first = createItem(project, {
        collection: 'Criaturas',
        title: 'Rana',
        fields,
        actor: you,
      });
      const by = { id: first.id, channel: 'cli' as const };
      handoffItem(project, { ...by, actor: quill });
      sendBackItem(project, { ...by, actor: you, channel: 'ui', reason: 'Más barro' });
      handoffItem(project, { ...by, actor: quill, note: 'Con barro' });
      approveItem(project, { ...by, actor: you, channel: 'ui' });
      handoffItem(project, { ...by, actor: kiln });
    } finally {
      project.db.close();
    }
  });

  afterEach(() => repo.remove());

  it('prints one row per model family and effort, with the exact models under it', async () => {
    const { code, out } = await otea('stats');

    expect(code).toBe(0);
    const lines = out.trimEnd().split('\n');
    expect(lines[0]).toBe(
      'How each model performs, all time, every board (profiles as the agents declare them)',
    );
    expect(lines[2]).toMatch(
      /^model · effort\s+handoffs\s+sent back\s+rounds per step\s+items done\s+discards\s+claim to handoff$/,
    );
    expect(lines[3]).toMatch(/^sonnet · medium\s+2\s+1 \(50%\)\s+2\.0\s+0\s+0\s+–$/);
    expect(out).toContain('  claude-sonnet-5');
    expect(out).toContain('  Criaturas › Concepto');
    expect(out).toMatch(/opus · high\s+1\s+0 \(0%\)\s+–/);
  });

  it('gives the same numbers under --json', async () => {
    const { out } = await otea('stats', '--json');

    const report = JSON.parse(out);
    expect(report.since).toBeNull();
    expect(report.boards).toContain('Criaturas');
    expect(report.rows[0]).toMatchObject({
      family: 'sonnet',
      effort: 'medium',
      handoffs: 2,
      sentBack: 1,
      finishedSteps: 1,
      rounds: 2,
    });
  });

  it('keeps to a board and a period', async () => {
    const report = JSON.parse(
      (await otea('stats', '--board', 'criaturas', '--since', '7d', '--json')).out,
    );

    expect(report.rows).toHaveLength(2);
    expect(report.since).not.toBeNull();
  });

  it('says so when nothing was handed off with a profile', async () => {
    const project = openProject(repo.dir);
    try {
      publishAs(project, { ...creatures(), name: 'Vacío' }, 'bvac');
    } finally {
      project.db.close();
    }

    const { code, out } = await otea('stats', '--board', 'Vacío');

    expect(code).toBe(0);
    expect(out).toContain('No handoffs yet by an agent with a declared profile');
  });

  it('refuses a period it cannot read', async () => {
    const { code, err } = await otea('stats', '--since', 'soon');

    expect(code).not.toBe(0);
    expect(err).toContain('7d, 30d or 12h, or all');
  });
});
