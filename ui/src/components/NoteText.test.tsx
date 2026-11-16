import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NoteText } from './NoteText.tsx';

describe('NoteText', () => {
  it('draws a note’s Markdown, tables included, and escapes raw HTML', () => {
    const html = renderToStaticMarkup(
      <NoteText
        className="p-text"
        text={'- **a**\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n<b>no</b>'}
      />,
    );
    expect(html).toContain('<div class="md note-md p-text">');
    expect(html).toContain('<strong>a</strong>');
    expect(html).toContain('<table>');
    expect(html).not.toContain('<b>no</b>');
  });
});
