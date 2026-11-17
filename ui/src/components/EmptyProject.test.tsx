import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import type { ProjectSettings } from '../types.ts';
import { EmptyProjectView } from './EmptyProject.tsx';

const settings = {
  name: 'tipcalc',
  dataDir: 'D:/home/data/tipcalc-k3x7qa',
  collections: [
    { name: 'Pedidos', preset: 'bd7q3ukd' },
    { name: 'Tareas', preset: 'work' },
  ],
  paths: [{ path: 'D:/code/tipcalc', repos: [] }],
} as unknown as ProjectSettings;

const PROMPT = ['Configura Otea en este proyecto.', '1. Ejecuta `otea init`.'].join('\n');

const render = (boards: string[] = ['Pedidos', 'Tareas'], prompt: string | null = PROMPT) =>
  renderToStaticMarkup(
    createElement(EmptyProjectView, {
      settings,
      boards,
      prompt,
      onNew: () => {},
      onConnect: () => {},
      onPickBoards: () => {},
    }),
  );

// A project with no item yet: the person writes the first one here, or connects an agent.
describe('the empty project page', () => {
  it('offers a New item button and connecting an agent, not a command that fails', () => {
    setLanguage('es');
    const html = render();
    expect(html).toContain('>Nuevo ítem</button>');
    expect(html).toContain('Conectar un agente</button>');
    expect(html).not.toContain('otea create');
  });

  it('names the boards by their names alone, never by a hidden id', () => {
    setLanguage('es');
    const html = render();
    expect(html).toContain('tableros');
    expect(html).toContain('Pedidos, Tareas');
    expect(html).not.toContain('bd7q3ukd');
    expect(html).not.toContain('colecciones');
    setLanguage('en');
    expect(render()).toContain('boards');
    expect(render()).not.toContain('collections');
    setLanguage('es');
  });

  it('starts a project with no board yet from the agent prompt, or by picking boards', () => {
    setLanguage('es');
    const html = render([]);
    expect(html).toContain('Configura Otea en este proyecto.');
    expect(html).toContain('<code class="inl">otea init</code>');
    expect(html).toContain('Copiar la instrucción</button>');
    expect(html).toContain('>Elegir tableros</button>');
    expect(html.indexOf('Copiar la instrucción')).toBeLessThan(html.indexOf('Elegir tableros'));
    expect(html).not.toContain('Nuevo ítem');
    expect(html).toContain('ninguno todavía');
    setLanguage('en');
    expect(render([])).toContain('>Pick boards</button>');
    setLanguage('es');
  });

  it('shows no prompt once the project has boards, nor while it loads', () => {
    setLanguage('es');
    expect(render()).not.toContain('Copiar la instrucción');
    expect(render([], null)).toContain('>Elegir tableros</button>');
  });
});
