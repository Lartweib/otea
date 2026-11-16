import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { OteaError } from '../core/errors.ts';
import { cropPng, imageSize, pixelRect, type Zone, zoneOf } from '../core/image-crop.ts';
import { findEvidence } from '../store/queries.ts';
import { evidenceFile } from './evidence.ts';
import { notesView } from './notes.ts';
import type { Project } from './project.ts';

export type CropInput = { id: string; note: number; out?: string };

export type CropResult = {
  id: string;
  note: number;
  filename: string;
  zone: Zone;
  // The zone in the image's pixels, when its size could be read.
  pixels?: { left: number; top: number; width: number; height: number; of: string };
  // Where the cut-out PNG was written, when the image is a PNG.
  file?: string;
  text: string;
};

const pct = (n: number) => `${Math.round(n * 10) / 10}`;

// An agent asks for the zone of an image a note is on, cut out (a point: a fifth of the image
// around it). A PNG is cut into a file of its own, in the system's temp folder unless --out says
// where; any other image gets the zone's box in its pixels and where the file is.
export function cropNote(project: Project, input: CropInput): CropResult {
  const { id, note } = input;
  const found = notesView(project, id).notes.find((n) => n.note === note);
  const anchor = found?.anchor;
  if (!found || !anchor || anchor.x === undefined || anchor.y === undefined)
    throw new OteaError(
      'invalid_fields',
      found
        ? `Note ${note} of ${id} is not on a point or a zone of an image: there is nothing to cut out`
        : `${id} has no note ${note}`,
    );
  const zone = zoneOf({
    x: anchor.x,
    y: anchor.y,
    ...(anchor.w === undefined ? {} : { w: anchor.w }),
    ...(anchor.h === undefined ? {} : { h: anchor.h }),
  });
  const where = `x ${pct(zone.x)}–${pct(zone.x + zone.w)}%, y ${pct(zone.y)}–${pct(zone.y + zone.h)}%`;
  const evidence = findEvidence(project.db, anchor.evidence);
  const source = evidence ? evidenceFile(project.dataDir, evidence.sha256) : undefined;
  const bytes = source && existsSync(source) ? readFileSync(source) : undefined;
  const size = bytes ? imageSize(bytes) : null;
  const base = { id, note, filename: anchor.filename, zone };
  if (!bytes || !size)
    return {
      ...base,
      text: `The zone of note ${note} is ${where} of ${anchor.filename}; Otea cannot read its size.`,
    };
  const rect = pixelRect(zone, size);
  const pixels = { ...rect, of: `${size.width}×${size.height}` };
  const box = `pixels ${rect.left},${rect.top} to ${rect.left + rect.width},${rect.top + rect.height} of ${size.width}×${size.height}`;
  const cut = size.format === 'png' ? cropPng(bytes, rect) : null;
  if (!cut)
    return {
      ...base,
      pixels,
      text: `The zone of note ${note} is ${where} of ${anchor.filename} (${box}); Otea cuts PNG images only. The image: ${source}`,
    };
  const file = resolve(input.out ?? join(tmpdir(), `otea-${id}-note-${note}.png`));
  writeFileSync(file, cut);
  return {
    ...base,
    pixels,
    file,
    text: `Cut the zone of note ${note}, ${where} of ${anchor.filename} (${box}), into ${file}`,
  };
}
