import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.ts';

describe('markdown', () => {
  it('renders headings, lists, code and links', () => {
    const html = renderMarkdown(
      '## Steps\n\n- open `login`\n- see [run 42](https://ci.example/42)\n\n```\nnpm test\n```',
    );

    expect(html).toContain('<h2>Steps</h2>');
    expect(html).toContain('<li>open <code>login</code></li>');
    expect(html).toContain(
      '<a href="https://ci.example/42" target="_blank" rel="noopener noreferrer">run 42</a>',
    );
    expect(html).toContain('<pre><code>npm test\n</code></pre>');
  });

  it('escapes raw HTML instead of injecting it', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops links with a dangerous protocol', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');

    expect(html).not.toContain('javascript:');
    expect(html).toContain('<a href="" target="_blank" rel="noopener noreferrer">click</a>');
  });
});
