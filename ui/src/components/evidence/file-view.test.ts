import { describe, expect, it } from 'vitest';
import { fileViewOf } from './file-view.ts';

const file = (filename: string, contentType = 'application/octet-stream') => ({
  filename,
  contentType,
});

describe('fileViewOf: how a file in a files part is read', () => {
  it('reads data as data: JSON as a tree, CSV and TSV as a table', () => {
    expect(fileViewOf(file('data.json'))).toBe('json');
    expect(fileViewOf(file('respuesta', 'application/json'))).toBe('json');
    expect(fileViewOf(file('x.csv'))).toBe('table');
    expect(fileViewOf(file('x.tsv'))).toBe('table');
  });

  it('reads Markdown as formatted text', () => {
    expect(fileViewOf(file('arquitectura.md', 'text/markdown'))).toBe('markdown');
    expect(fileViewOf(file('NOTAS.MARKDOWN'))).toBe('markdown');
  });

  it('reads code, data and plain text as lines', () => {
    for (const name of ['main.ts', 'app.py', 'q.sql', 'conf.yaml', 'run.sh', 'a.txt'])
      expect(fileViewOf(file(name))).toBe('text');
    expect(fileViewOf(file('LICENSE', 'text/plain'))).toBe('text');
  });

  it('offers anything else to open or download, never as text', () => {
    expect(fileViewOf(file('informe.pdf', 'application/pdf'))).toBe('download');
    expect(fileViewOf(file('proyecto.bin'))).toBe('download');
    expect(fileViewOf(file('dibujo.svg', 'image/svg+xml'))).toBe('download');
  });
});
