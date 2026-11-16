// How a file in a files part is read on the item page: Markdown as formatted text, code, data and
// plain text as numbered lines, anything else offered to open or download. SVG is never drawn
// inline (it can carry scripts): it is offered as a file.
export type FileView = 'markdown' | 'text' | 'download';

const MARKDOWN = new Set(['md', 'markdown', 'mdown', 'mkd']);

const TEXT = new Set([
  'txt',
  'log',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'yaml',
  'yml',
  'toml',
  'ini',
  'env',
  'xml',
  'html',
  'css',
  'scss',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'mts',
  'cts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'php',
  'sql',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'bat',
  'lua',
  'gd',
  'tscn',
  'dockerfile',
  'gitignore',
]);

export function fileViewOf({
  filename,
  contentType,
}: {
  filename: string;
  contentType: string;
}): FileView {
  const dot = filename.lastIndexOf('.');
  const ext = (dot >= 0 ? filename.slice(dot + 1) : filename).toLowerCase();
  if (MARKDOWN.has(ext) || contentType === 'text/markdown') return 'markdown';
  if (contentType === 'image/svg+xml') return 'download';
  if (TEXT.has(ext) || contentType.startsWith('text/') || contentType === 'application/json')
    return 'text';
  return 'download';
}
