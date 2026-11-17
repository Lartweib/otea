import { describe, expect, it } from 'vitest';
import { agentPrompt, designPrompt, joinPrompt, startPrompt } from './agent-prompts.ts';

describe('the start prompt', () => {
  for (const lang of ['en', 'es'] as const) {
    it(`walks a new project through set up, reading, interview, draft and trying it (${lang})`, () => {
      const text = startPrompt(lang);
      for (const command of [
        'otea init',
        'otea connect --as',
        'unknown',
        'otea board',
        'otea board draft --new',
        '--why',
        '--template',
        'otea board draft',
        '--file board.json',
        'otea profile --as',
        'otea next',
        'otea wait --turn agent --unclaimed',
        'otea reply',
      ])
        expect(text).toContain(command);
      expect(text).toMatch(lang === 'es' ? /una pregunta a la vez/ : /one question at a time/);
      expect(text).toMatch(
        lang === 'es'
          ? /letras minúsculas, dígitos y guiones, como claude-b/
          : /lowercase letters, digits and dashes, such as claude-b/,
      );
      // The board a draft hands in on is named in the screen's words, not the Spanish built-in's.
      expect(text).toContain(lang === 'es' ? '<id del Pedido>' : '<request id>');
      expect(text).not.toContain(lang === 'es' ? '<Pedido>' : 'Pedido');
      expect(text).toMatch(lang === 'es' ? /lo publico yo/ : /I publish it/);
    });
  }

  it('speaks the language of the screen', () => {
    expect(startPrompt('es')).toMatch(/^Configura Otea/);
    expect(startPrompt('en')).toMatch(/^Set up Otea/);
  });
});

describe('the design prompt', () => {
  it('drafts one more board from a template and never publishes it', () => {
    for (const lang of ['en', 'es'] as const) {
      const text = designPrompt(lang);
      expect(text).toContain('otea board draft --new');
      expect(text).toContain('--template');
      expect(text).not.toContain('otea connect');
    }
  });
});

describe('the join prompt', () => {
  const facts = {
    boards: [
      { name: 'Cambios', agentSteps: ['Aclarar', 'Hacerlo', 'Integrar'], waiting: 2 },
      { name: 'Errores', agentSteps: ['Completar', 'Arreglar'], waiting: 0 },
      { name: 'Revisiones', agentSteps: [], waiting: 0 },
    ],
    listening: ['claude', 'codex', 'claude'],
  };

  it('names the agents already working, the agent steps and what waits now', () => {
    const text = joinPrompt('es', facts);
    expect(text).toContain('que no sea uno de los que ya trabajan aquí (claude, codex)');
    expect(text).toContain('- Cambios: Aclarar, Hacerlo, Integrar (2 esperan a un agente ahora)');
    expect(text).toContain('- Errores: Completar, Arreglar');
    expect(text).not.toContain('Errores: Completar, Arreglar (');
    expect(text).not.toContain('Revisiones');
    expect(text).toContain('otea next --claim');
    expect(text).toContain('Nunca tomes un ítem que tiene otro agente');
    expect(text).not.toContain('otea board draft');
    // A second agent's otea connect would rewrite the .mcp.json the first one uses.
    expect(text).toContain('No ejecutes otea connect');
    expect(text).toContain(
      'otea profile --as <nombre> --model <modelo> --effort <esfuerzo> --harness <harness>',
    );
    expect(text).toContain('letras minúsculas, dígitos y guiones, como claude-b');
    // Two agents in one checkout would edit the same files.
    expect(text).toContain('git worktree add');
  });

  it('lets the first agent of a project with boards connect, with nobody to join', () => {
    for (const lang of ['en', 'es'] as const) {
      const text = joinPrompt(lang, { ...facts, listening: [], first: true });
      expect(text).toContain(
        lang === 'es' ? 'otea connect --as <nombre>' : 'otea connect --as <name>',
      );
      expect(text).not.toMatch(/No ejecutes otea connect|Do not run otea connect/);
      expect(text).not.toMatch(/junto a los otros|alongside the others|git worktree/);
      expect(text).toContain('otea profile --as');
    }
  });

  it('reads well with nobody listening and no agent steps, in English too', () => {
    const text = joinPrompt('en', { boards: [], listening: [] });
    expect(text).toContain(
      '1. Pick a name of your own (lowercase letters, digits and dashes, such as claude-b) and put it on every command',
    );
    expect(text).toContain('no board has agent steps yet');
    expect(joinPrompt('en', facts)).toContain('(2 waiting for an agent now)');
  });

  it('is what agentPrompt gives for each moment', () => {
    expect(agentPrompt('start', 'en', facts)).toBe(startPrompt('en'));
    expect(agentPrompt('design', 'es', facts)).toBe(designPrompt('es'));
    expect(agentPrompt('join', 'es', facts)).toBe(joinPrompt('es', facts));
  });
});
