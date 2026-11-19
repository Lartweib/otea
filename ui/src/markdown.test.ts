import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.ts';

describe('images a document points at beside it (P5-7)', () => {
  it('loads a relative image from the file of that name, leaving the rest as they are', () => {
    const html = renderMarkdown(
      '![Fig](figura.png) ![x](https://a.b/c.png) ![y](./img/z%20a.png) ![n](falta.png)',
      (name) => ({ 'figura.png': '/api/evidence/7/file', 'z a.png': '/api/evidence/8/file' })[name],
    );
    expect(html).toContain('<img src="/api/evidence/7/file" alt="Fig" />');
    expect(html).toContain('<img src="https://a.b/c.png" alt="x" />');
    expect(html).toContain('<img src="/api/evidence/8/file" alt="y" />');
    expect(html).toContain('<img src="falta.png" alt="n" />');
  });

  // Two of three relative images came out as empty 0×0 boxes, and nothing said why (P5-R2-10).
  it('says which image is missing, and how to show it, when given the words', () => {
    const html = renderMarkdown(
      '![Paleta](./img/palette.png) ![Fig](figura.png)',
      (name) => (name === 'figura.png' ? '/api/evidence/7/file' : undefined),
      (path) => `${path} <no adjunta>`,
    );
    expect(html).toContain('<img src="/api/evidence/7/file" alt="Fig" />');
    expect(html).not.toContain('palette.png" alt');
    expect(html).toContain(
      '<span class="md-noimg" role="img" aria-label="Paleta">./img/palette.png &lt;no adjunta&gt;</span>',
    );
  });
});

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

  it('keeps the ")" of a list numbered "1)", as it was written', () => {
    const html = renderMarkdown('Pasos:\n1) api\n2) web\n\n- a\n\n1. one\n2. two\n\n3) three');

    expect(html).toContain('<ol class="paren">\n<li>api</li>');
    expect(html).toContain('<ol>\n<li>one</li>');
    expect(html).toContain('<ol class="paren" start="3">\n<li>three</li>');
    expect(renderMarkdown('```\n<ol>\n```\n\n1) x')).toContain('<ol class="paren">\n<li>x</li>');
  });

  it('escapes raw HTML instead of injecting it', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('draws a GFM table, aligned, its cells read as Markdown, scrolling when wide', () => {
    const html = renderMarkdown(
      [
        'Opciones:',
        '',
        '| Opción | Coste | Notas |',
        '|:-------|------:|:-----:|',
        '| **SQLite** | 0 € | `local` |',
        '| Postgres \\| RDS | 20 € |',
        '',
        'Fin.',
      ].join('\n'),
    );

    expect(html).toContain('<p>Opciones:</p>');
    expect(html).toContain('<div class="md-table"><table>');
    expect(html).toContain(
      '<tr><th style="text-align:left">Opción</th><th style="text-align:right">Coste</th><th style="text-align:center">Notas</th></tr>',
    );
    expect(html).toContain(
      '<td style="text-align:left"><strong>SQLite</strong></td><td style="text-align:right">0 €</td><td style="text-align:center"><code>local</code></td>',
    );
    // An escaped pipe stays in its cell; a short row is filled.
    expect(html).toContain(
      '<td style="text-align:left">Postgres | RDS</td><td style="text-align:right">20 €</td><td style="text-align:center"></td>',
    );
    expect(html).toContain('<p>Fin.</p>');
    expect(html).not.toContain('|:---');
  });

  it('leaves pipes inside code blocks, and lines that only look like a table, alone', () => {
    const fenced = renderMarkdown('```\n| a | b |\n|---|---|\n```');
    expect(fenced).not.toContain('<table>');
    expect(fenced).toContain('| a | b |');
    expect(renderMarkdown('a | b\nnot a delimiter')).not.toContain('<table>');
    expect(renderMarkdown('| <script>x</script> |\n|---|\n| y |')).not.toContain('<script>');
  });

  it('drops links with a dangerous protocol', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');

    expect(html).not.toContain('javascript:');
    expect(html).toContain('<a href="" target="_blank" rel="noopener noreferrer">click</a>');
  });
});
