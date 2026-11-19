import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/i18n.ts';
import { PromptBlock, withCode } from './AgentPrompt.tsx';

describe('a command in the instruction', () => {
  it('wraps only between its words, never at an option’s hyphen', () => {
    const html = renderToStaticMarkup(
      createElement(Fragment, null, withCode('Run `otea profile --effort <effort>` now.')),
    );
    expect(html).toBe(
      'Run <code class="inl"><span class="nw">otea</span> <span class="nw">profile</span> <span class="nw">--effort</span> <span class="nw">&lt;effort&gt;</span></code> now.',
    );
  });
});

// The instruction speaks to the agent (harness, MCP, --effort): the person is told it is not for
// them to follow, before they read it (P4-15).
describe('the paste block', () => {
  afterEach(() => setLanguage('en'));

  it('says it is for the agent, before the instruction', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(createElement(PromptBlock, { prompt: 'Run `otea next`.' }));
    const said = html.indexOf('Esto es para tu agente');
    expect(said).toBeGreaterThan(-1);
    expect(said).toBeLessThan(html.indexOf('<blockquote'));
    expect(html).toContain('no hace falta que entiendas sus términos');

    setLanguage('en');
    expect(
      renderToStaticMarkup(createElement(PromptBlock, { prompt: 'Run `otea next`.' })),
    ).toContain('This is for your agent');
  });
});
