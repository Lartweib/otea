import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject } from '../app/project.ts';
import { publishAs } from '../app/testing.ts';
import { creatures } from '../core/board/testing.ts';
import { type Cli, cliAt, type TempRepo, tempGitRepo } from './testing.ts';

// «Pide prueba» holds however a point is ticked: otea tick, or the field set with update.
describe('a checklist that asks for proof, from the CLI', () => {
  let repo: TempRepo;
  let otea: Cli;
  let id: string;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init', '--local', '--template', 'none');
    const def = creatures();
    const steps = def.parts.fsteps;
    if (steps) steps.proof = true;
    // Concepto hands the checklist, optional: a point ticked there still needs its proof.
    def.steps[0]?.hand.push({ ref: 'fsteps', req: 'no', fresh: false });
    const project = openProject(repo.dir);
    try {
      publishAs(project, def, 'bcre');
    } finally {
      project.db.close();
    }
    const created = await otea(
      'create',
      '--collection',
      'Criaturas',
      '--title',
      'Sapo',
      '--field',
      'Descripción=verde',
      '--json',
    );
    id = JSON.parse(created.out).id;
    repo.write('art.png', 'png');
    await otea('claim', id);
    await otea('attach', id, 'art.png', '--module', 'Arte conceptual');
  });

  afterEach(() => repo.remove());

  it('holds the handoff when update --field ticked points without proof', async () => {
    expect((await otea('update', id, '--field', 'fsteps=cone,ctwo')).code).toBe(0);

    const handoff = await otea('handoff', id);

    expect(handoff.code).toBe(8);
    expect(handoff.err).toContain('missing Comprobaciones (a proof for Silueta and Paleta)');
    expect(handoff.err).toContain('otea tick');
  });

  it('hands off an optional checklist left unticked', async () => {
    expect((await otea('handoff', id)).code).toBe(0);
  });
});
