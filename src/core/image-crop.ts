import { deflateSync, inflateSync } from 'node:zlib';

// Cutting out the zone of an image a note is on, for an agent that asks for it (otea crop): the
// zone in percent of the image, its whole pixels, and for a PNG the pixels themselves, with no
// image library (the PNG format is zlib and a filter per row). Other formats get their pixel box.

export type Zone = { x: number; y: number; w: number; h: number };

export type ImageSize = { width: number; height: number; format: 'png' | 'gif' | 'jpeg' | 'webp' };

export type PixelRect = { left: number; top: number; width: number; height: number };

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// The size of a PNG, GIF, JPEG or WebP, read from its header; null for anything else.
export function imageSize(bytes: Buffer): ImageSize | null {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE))
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: 'png' };
  if (bytes.length >= 10 && bytes.toString('latin1', 0, 4) === 'GIF8')
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), format: 'gif' };
  if (bytes.length >= 30 && bytes.toString('latin1', 0, 4) === 'RIFF') {
    const kind = bytes.toString('latin1', 12, 16);
    if (kind === 'VP8X')
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
        format: 'webp',
      };
    if (kind === 'VP8L') {
      const bits = bytes.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), format: 'webp' };
    }
    if (kind === 'VP8 ')
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
        format: 'webp',
      };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 8 < bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1] ?? 0;
      const frame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (frame)
        return {
          height: bytes.readUInt16BE(at + 5),
          width: bytes.readUInt16BE(at + 7),
          format: 'jpeg',
        };
      at += 2 + bytes.readUInt16BE(at + 2);
    }
  }
  return null;
}

// The zone a note's spot asks to be cut: a zone as it is; a point, a fifth of the image around it,
// kept inside the image.
export function zoneOf(spot: { x: number; y: number; w?: number; h?: number }): Zone {
  if (spot.w !== undefined && spot.h !== undefined)
    return { x: spot.x, y: spot.y, w: spot.w, h: spot.h };
  const side = 20;
  const start = (at: number) => Math.min(100 - side, Math.max(0, at - side / 2));
  return { x: start(spot.x), y: start(spot.y), w: side, h: side };
}

// A zone in whole pixels of an image of `size`, at least one pixel, inside the image.
export function pixelRect(zone: Zone, size: { width: number; height: number }): PixelRect {
  const left = Math.min(size.width - 1, Math.max(0, Math.floor((zone.x / 100) * size.width)));
  const top = Math.min(size.height - 1, Math.max(0, Math.floor((zone.y / 100) * size.height)));
  const right = Math.min(size.width, Math.ceil(((zone.x + zone.w) / 100) * size.width));
  const bottom = Math.min(size.height, Math.ceil(((zone.y + zone.h) / 100) * size.height));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, sum]);
}

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// The pixels of `rect` of a PNG as a PNG of their own; null for a PNG this cannot read (interlaced,
// or fewer than 8 bits a sample) or for anything that is not a PNG.
export function cropPng(bytes: Buffer, rect: PixelRect): Buffer | null {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let header: Buffer | undefined;
  const data: Buffer[] = [];
  const kept: Buffer[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') header = body;
    else if (type === 'IDAT') data.push(body);
    else if (type === 'PLTE' || type === 'tRNS') kept.push(chunk(type, body));
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (!header) return null;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8] ?? 0;
  const color = header[9] ?? 0;
  const channels = CHANNELS[color];
  if (header[12] !== 0 || depth < 8 || channels === undefined) return null;
  const bpp = (channels * depth) / 8;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(data));
  const rows: Buffer[] = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start] ?? 0;
    const row = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? (row[i - bpp] ?? 0) : 0;
      const b = prev[i] ?? 0;
      const c = i >= bpp ? (prev[i - bpp] ?? 0) : 0;
      const add =
        filter === 1
          ? a
          : filter === 2
            ? b
            : filter === 3
              ? (a + b) >> 1
              : filter === 4
                ? paeth(a, b, c)
                : 0;
      row[i] = ((row[i] ?? 0) + add) & 0xff;
    }
    rows.push(row);
    prev = row;
  }
  const out: Buffer[] = [];
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    const row = rows[y];
    if (!row) break;
    out.push(Buffer.from([0]), row.subarray(rect.left * bpp, (rect.left + rect.width) * bpp));
  }
  const head = Buffer.from(header);
  head.writeUInt32BE(rect.width, 0);
  head.writeUInt32BE(out.length / 2, 4);
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', head),
    ...kept,
    chunk('IDAT', deflateSync(Buffer.concat(out))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
