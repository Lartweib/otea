import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { designPrompt, startPrompt } from '../core/agent-prompts.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

// otea prompt prints what the person pastes into an agent's chat: the whole first contact on a
// project with no board of its own, the join prompt (from the project as it is now) on one with
// boards, and the shorter design prompt on request.
describe('otea prompt', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  beforeEach(() => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
  });

  afterEach(() => repo.remove());

  it('prints the first contact where there is no project or no board yet', async () => {
    const before = await otea('prompt');
    expect(before.code).toBe(0);
    expect(before.out.trim()).toBe(startPrompt('es'));

    await otea('init', '--local', '--template', 'none');
    expect((await otea('prompt')).out.trim()).toBe(startPrompt('es'));
    expect((await otea('prompt', '--lang', 'en')).out.trim()).toBe(startPrompt('en'));
  });

  it('prints the join prompt from the project once it has boards, and the others on request', async () => {
    await otea('init', '--local', '--template', 'changes');
    await cliAt(repo.dir, { OTEA_AGENT: 'claude' })(
      'create',
      '--collection',
      'Cambios',
      '--title',
      'Fix the footer',
      '--field',
      'Qué quiero=It shows last year',
    );

    const join = (await otea('prompt')).out;
    // Nobody works there now (the item's author left): nobody to join.
    expect(join).toContain('Empieza a trabajar en este proyecto');
    expect(join).toContain('- Cambios: Aclarar, Hacerlo, Integrar (1 espera a un agente ahora)');
    expect((await otea('prompt', 'design')).out.trim()).toBe(designPrompt('es'));
    expect((await otea('prompt', 'start')).out.trim()).toBe(startPrompt('es'));
  });

  it('refuses an unknown moment or language', async () => {
    expect((await otea('prompt', 'later')).code).toBe(2);
    expect((await otea('prompt', '--lang', 'fr')).code).toBe(2);
  });
});
