import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { Context } from 'hono';
import { evidenceToServe } from '../app/evidence.ts';
import type { Project } from '../app/project.ts';
import type { EvidenceRecord } from '../store/queries.ts';

// Evidence is whatever an agent attached, served from the app's own origin, so nothing in it may
// run there. Images and videos (the kinds exclude SVG) are shown inline with their type; diffs, diagrams and
// logs as plain text; anything else only as a download. nosniff keeps the browser to the declared
// type, and the sandbox policy denies scripts and the origin to a file opened on its own.
function presentation({ kind, contentType }: EvidenceRecord): { type: string; inline: boolean } {
  if (kind === 'image' || kind === 'video' || kind === 'audio')
    return { type: contentType, inline: true };
  if (kind === 'diff' || kind === 'log' || kind === 'diagram') {
    return { type: 'text/plain; charset=utf-8', inline: true };
  }
  return { type: contentType, inline: false };
}

function disposition(inline: boolean, filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

type Span = { start: number; end: number };

const RANGE = /^bytes=(\d*)-(\d*)$/;

// One byte range (a video player seeking), inclusive. undefined: serve the whole file (no range, or
// one this does not read, such as several ranges); 'unsatisfiable': past the end.
function rangeOf(header: string | undefined, size: number): Span | 'unsatisfiable' | undefined {
  const match = header === undefined ? null : RANGE.exec(header.trim());
  if (!match) return undefined;
  const [, from = '', to = ''] = match;
  if (from === '' && to === '') return undefined;
  if (from === '') {
    const suffix = Number(to);
    return suffix === 0 || size === 0
      ? 'unsatisfiable'
      : { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  if (start >= size) return 'unsatisfiable';
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  return end < start ? undefined : { start, end };
}

// If-None-Match lists the tags of the copies a browser keeps, or * for any.
function matches(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false;
  return header.split(',').some((tag) => {
    const trimmed = tag.trim();
    return trimmed === '*' || trimmed.replace(/^W\//, '') === etag;
  });
}

export function serveEvidence(c: Context, project: Project, id: string): Response {
  const { evidence, path } = evidenceToServe(project, id);
  const { type, inline } = presentation(evidence);
  const etag = `"${project.identity.id}:${evidence.sha256}"`;
  const headers = {
    'content-type': type,
    'content-disposition': disposition(inline, evidence.filename),
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    'content-security-policy': 'sandbox',
    // The URL names an entry by its number, which another project served later on this host and
    // port reuses for another file. So the browser asks every time, and the tag that lets it keep
    // its copy names this project and the file's content.
    'cache-control': 'private, no-cache',
    etag,
  };
  if (matches(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
  const range = rangeOf(c.req.header('range'), evidence.size);
  if (range === 'unsatisfiable') {
    return c.body(null, 416, { ...headers, 'content-range': `bytes */${evidence.size}` });
  }
  const span = range ?? { start: 0, end: evidence.size - 1 };
  const stream = createReadStream(path, evidence.size === 0 ? {} : span);
  const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  const length = { 'content-length': String(evidence.size === 0 ? 0 : span.end - span.start + 1) };
  if (!range) return c.body(body, 200, { ...headers, ...length });
  const contentRange = `bytes ${span.start}-${span.end}/${evidence.size}`;
  return c.body(body, 206, { ...headers, ...length, 'content-range': contentRange });
}
