import { describe, expect, it } from 'vitest';
import { fileViewOf } from './file-view.ts';

const file = (filename: string, contentType = 'application/octet-stream') => ({
  filename,
  contentType,
});

describe('fileViewOf: how a file in a files part is read', () => {
  // Data as data (JSON as a tree, CSV and TSV as a table), Markdown as formatted text, code, data
  // and plain text as lines, a PDF as its pages, and anything else to open or download, never as
  // text.
  it.each<[string, string | undefined, string]>([
    ['data.json', undefined, 'json'],
    ['respuesta', 'application/json', 'json'],
    ['x.csv', undefined, 'table'],
    ['x.tsv', undefined, 'table'],
    ['arquitectura.md', 'text/markdown', 'markdown'],
    ['NOTAS.MARKDOWN', undefined, 'markdown'],
    ['main.ts', undefined, 'text'],
    ['app.py', undefined, 'text'],
    ['q.sql', undefined, 'text'],
    ['conf.yaml', undefined, 'text'],
    ['run.sh', undefined, 'text'],
    ['a.txt', undefined, 'text'],
    ['LICENSE', 'text/plain', 'text'],
    ['informe.pdf', 'application/pdf', 'pdf'],
    ['INFORME.PDF', undefined, 'pdf'],
    ['sin-nombre', 'application/pdf', 'pdf'],
    ['proyecto.bin', undefined, 'download'],
    ['dibujo.svg', 'image/svg+xml', 'download'],
  ])('reads %s (%s) as %s', (name, contentType, view) => {
    expect(fileViewOf(file(name, contentType))).toBe(view);
  });
});
