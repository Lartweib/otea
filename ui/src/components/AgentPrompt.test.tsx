import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { withCode } from './AgentPrompt.tsx';

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
