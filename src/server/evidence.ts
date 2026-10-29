import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { Context } from 'hono';
import { evidenceToServe } from '../app/evidence.ts';
import type { Project } from '../app/project.ts';
import type { EvidenceRecord } from '../store/queries.ts';

// Evidence is whatever an agent attached, served from the app's own origin, so nothing in it may
// run there. Images and videos (the kinds exclude SVG) are shown inline with their type; diffs and
// logs as plain text; anything else only as a download. nosniff keeps the browser to the declared
// type, and the sandbox policy denies scripts and the origin to a file opened on its own.
function presentation({ kind, contentType }: EvidenceRecord): { type: string; inline: boolean } {
  if (kind === 'image' || kind === 'video') return { type: contentType, inline: true };
  if (kind === 'diff' || kind === 'log') return { type: 'text/plain; charset=utf-8', inline: true };
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

export function serveEvidence(c: Context, project: Project, id: string): Response {
  const { evidence, path } = evidenceToServe(project, id);
  const { type, inline } = presentation(evidence);
  const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  return c.body(body, 200, {
    'content-type': type,
    'content-length': String(evidence.size),
    'content-disposition': disposition(inline, evidence.filename),
    'x-content-type-options': 'nosniff',
    'content-security-policy': 'sandbox',
    // An entry never changes: its file is addressed by content and evidence is append-only.
    'cache-control': 'private, max-age=31536000, immutable',
  });
}
