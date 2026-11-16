import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Evidence } from '../../types.ts';
import { FileView } from './FileViews.tsx';
import { keepEvidenceText } from './TextViews.tsx';

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

describe('FileView for data', () => {
  const at = (id: number, filename: string, contentType: string, text: string) => {
    const e = { ...file(filename, contentType), id };
    keepEvidenceText(`/api/evidence/${id}/file`, text);
    return e;
  };

  it('reads a CSV as a table under its header row, its source a toggle away', () => {
    const html = renderToStaticMarkup(
      <FileView evidence={at(901, 'tips.csv', 'text/csv', 'name,tip\nana,"1,5"\nbeto,3\n')} />,
    );
    expect(html).toContain('<table');
    expect(html).toMatch(/<th[^>]*>[\s\S]*name[\s\S]*<\/th>/);
    expect(html).toContain('1,5');
    expect(html).toMatch(/data-label="tip"/);
    expect(html).toMatch(/>2 rows</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>source</);
  });

  it('reads JSON as a tree whose branches fold', () => {
    const html = renderToStaticMarkup(
      <FileView evidence={at(902, 'r.json', 'application/json', '{"a":1,"list":[true,"x"]}')} />,
    );
    expect(html).toContain('ev-json');
    expect(html).toMatch(/<details[^>]*open/);
    expect(html).toContain('list');
    expect(html).toMatch(/2 items/);
  });

  it('falls back to lines when JSON does not parse', () => {
    const html = renderToStaticMarkup(
      <FileView evidence={at(903, 'roto.json', 'application/json', '{"a":')} />,
    );
    expect(html).not.toContain('ev-json');
    expect(html).toContain('ev-log');
  });
});
