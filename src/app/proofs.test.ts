import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { creatures } from '../core/board/testing.ts';
import { updateItemState } from '../store/queries.ts';
import { attachEvidence } from './evidence.ts';
import { createItem, requireItem } from './items.ts';
import { boardBlockOf, handoffItem } from './next.ts';
import type { Project } from './project.ts';
import { tickPoint } from './proofs.ts';
import { memoryContext, projectOf, publishAs } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const quill = { kind: 'agent' as const, name: 'quill' };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 17, 9, 0, tick++)).toISOString();

const JUNIT = `<?xml version="1.0"?>
<testsuites><testsuite name="art">
  <testcase classname="art" name="silhouette reads at 32 px"/>
  <testcase classname="art" name="palette fits"><failure message="off by one">x</failure></testcase>
</testsuite></testsuites>`;

describe('ticking a checklist point with its proof', () => {
  let root: string;
  let project: Project;
  let id: string;

  const file = (name: string, content: string) => {
    const path = join(root, name);
    writeFileSync(path, content);
    return path;
  };
  const attach = (path: string, module = 'elog') =>
    attachEvidence(project, { id, path, module, actor: quill, channel: 'cli' }, now);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'otea-proofs-'));
    const def = creatures();
    const steps = def.parts.fsteps;
    if (steps) steps.proof = true;
    def.parts.elog = {
      id: 'elog',
      name: 'Salida',
      kind: 'log',
      hint: '',
      options: [],
    };
    def.parts.efile = {
      id: 'efile',
      name: 'Informe',
      kind: 'file',
      hint: '',
      options: [],
    };
    def.steps[1]?.hand.push(
      { ref: 'elog', req: 'no', fresh: false },
      { ref: 'efile', req: 'no', fresh: false },
    );
    const ctx = memoryContext();
    publishAs(ctx, def, 'bcri', now);
    project = projectOf(root, ctx);
    id = createItem(
      project,
      {
        collection: 'Criaturas',
        title: 'Rana',
        fields: { fdesc: 'Lenta' },
        actor: you,
      },
      now,
    ).id;
    updateItemState(project.db, id, 'sanimate', now());
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('proves a point with a log line that exists, and refuses one past the end', () => {
    const log = attach(file('build.log', 'start\nsilhouette ok\n'));
    expect(() =>
      tickPoint(project, {
        id,
        point: 'Silueta',
        source: { log: { file: 'build.log', line: 9 } },
        actor: quill,
        channel: 'cli',
      }),
    ).toThrowError('build.log cannot prove it at line 9: it has 2 lines');
    expect(requireItem(project.db, id).fields.fsteps ?? '').toBe('');

    const done = tickPoint(
      project,
      {
        id,
        point: 'silueta',
        source: { log: { file: 'build.log', line: 2 } },
        actor: quill,
        channel: 'cli',
      },
      now,
    );
    expect(done.text).toBe('Ticked "Silueta" in Comprobaciones with build.log line 2.');
    expect(done.proof).toMatchObject({
      kind: 'log',
      evidence: log.id,
      line: 2,
      text: 'silhouette ok',
    });
    expect(requireItem(project.db, id).fields.fsteps).toBe('["cone"]');
  });

  it('proves a point only with a test that passes in an attached report', () => {
    attach(file('junit.xml', JUNIT));
    const by = (test: string) => () =>
      tickPoint(
        project,
        { id, point: 'Paleta', source: { test }, actor: quill, channel: 'cli' },
        now,
      );
    expect(by('palette fits')).toThrowError(
      '"art › palette fits" fails in junit.xml: a point is proved only by a test that passes',
    );
    expect(by('nothing here')).toThrowError(/has a test "nothing here"/);
    expect(by('art › silhouette reads at 32 px')().text).toBe(
      'Ticked "Paleta" in Comprobaciones with the test "art › silhouette reads at 32 px" of junit.xml (passes).',
    );
  });

  it('holds the handoff until every ticked point has its proof, and shows them on the page', () => {
    const art = file('silueta.png', 'png');
    const shot = attachEvidence(
      project,
      { id, path: art, module: 'eart', actor: quill, channel: 'cli' },
      now,
    );
    attachEvidence(
      project,
      {
        id,
        path: file('anim.webm', 'video'),
        module: 'eanim',
        actor: quill,
        channel: 'cli',
      },
      now,
    );
    tickPoint(
      project,
      {
        id,
        point: 'Silueta',
        source: { evidence: shot.id },
        actor: quill,
        channel: 'cli',
      },
      now,
    );
    const bare = tickPoint(
      project,
      { id, point: 'Paleta', source: {}, actor: quill, channel: 'cli' },
      now,
    );
    expect(bare.text).toBe(
      'Ticked "Paleta" in Comprobaciones, without proof yet: Comprobaciones asks for one.',
    );
    const block = boardBlockOf(project, requireItem(project.db, id));
    expect(block?.missing).toEqual([
      expect.objectContaining({
        ref: 'fsteps',
        reason: 'unproved',
        points: ['Paleta'],
      }),
    ]);
    expect(
      block?.checklists?.[0]?.points.map(({ name, ticked, proof }) => [name, ticked, proof?.kind]),
    ).toEqual([
      ['Silueta', true, 'file'],
      ['Paleta', true, undefined],
    ]);
    expect(block?.proofs).toEqual([
      expect.objectContaining({
        point: 'cone',
        kind: 'file',
        file: 'silueta.png',
      }),
    ]);
    expect(() => handoffItem(project, { id, actor: quill, channel: 'cli' }, now)).toThrowError(
      /missing Comprobaciones \(a proof for Paleta\)[\s\S]*otea tick/,
    );
  });
});
