import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Evidence } from '../../types.ts';
import { FileView } from './FileViews.tsx';

const file = (filename: string, contentType: string, size = 2048): Evidence => ({
  id: 7,
  itemId: 'IDE-1',
  role: 'single',
  module: 'edocs',
  kind: 'file',
  filename,
  contentType,
  size,
  sha256: '',
  caption: null,
  createdAt: '2026-01-01T00:00:00Z',
  actor: { kind: 'agent', name: 'brush' },
  channel: 'cli',
});

describe('FileView', () => {
  it('offers a file it cannot read to open or download, with its size, never a raw kind word', () => {
    const html = renderToStaticMarkup(
      <FileView evidence={file('proyecto.bin', 'application/octet-stream')} />,
    );
    expect(html).toContain('class="ev-offer well"');
    expect(html).toContain('proyecto.bin');
    expect(html).toContain('2 KB');
    expect(html).toMatch(/download="proyecto.bin"[^>]*>Download</);
    expect(html).toMatch(/target="_blank"[^>]*>Open</);
    expect(html).not.toMatch(/>file</);
  });

  it('reads Markdown and text files instead of offering them', () => {
    expect(
      renderToStaticMarkup(<FileView evidence={file('arquitectura.md', 'text/markdown')} />),
    ).not.toContain('ev-offer');
    expect(
      renderToStaticMarkup(<FileView evidence={file('main.ts', 'text/plain')} />),
    ).not.toContain('ev-offer');
  });
});
