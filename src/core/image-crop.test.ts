import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { cropPng, imageSize, pixelRect, zoneOf } from './image-crop.ts';

const crc = (buf: Buffer) => {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
};

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}

// An RGB PNG whose pixel (x, y) is (x, y, 7), each row with a different filter.
function png(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows: Buffer[] = [];
  let prev = Buffer.alloc(width * 3);
  for (let y = 0; y < height; y++) {
    const raw = Buffer.alloc(width * 3);
    for (let x = 0; x < width; x++) raw.set([x, y, 7], x * 3);
    const filter = y % 3; // none, sub, up
    const out = Buffer.alloc(width * 3);
    for (let i = 0; i < raw.length; i++) {
      const left = i >= 3 ? (raw[i - 3] ?? 0) : 0;
      const up = prev[i] ?? 0;
      const v = raw[i] ?? 0;
      out[i] = filter === 0 ? v : filter === 1 ? (v - left) & 255 : (v - up) & 255;
    }
    rows.push(Buffer.from([filter]), out);
    prev = raw;
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function pixels(file: Buffer): {
  width: number;
  height: number;
  at: (x: number, y: number) => number[];
} {
  const width = file.readUInt32BE(16);
  const height = file.readUInt32BE(20);
  const idat = file.indexOf('IDAT', 0, 'latin1');
  const len = file.readUInt32BE(idat - 4);
  const raw = inflateSync(file.subarray(idat + 4, idat + 4 + len));
  const stride = width * 3 + 1;
  return {
    width,
    height,
    at: (x, y) => [...raw.subarray(y * stride + 1 + x * 3, y * stride + 1 + x * 3 + 3)],
  };
}

describe('imageSize', () => {
  it('reads the size of a PNG, a GIF and a JPEG from their headers', () => {
    expect(imageSize(png(40, 20))).toEqual({ width: 40, height: 20, format: 'png' });
    const gif = Buffer.from('GIF89a\x10\x00\x08\x00', 'latin1');
    expect(imageSize(gif)).toEqual({ width: 16, height: 8, format: 'gif' });
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 8, 0x00, 0x30, 0x00, 0x40,
    ]);
    expect(imageSize(jpeg)).toEqual({ width: 64, height: 48, format: 'jpeg' });
    expect(imageSize(Buffer.from('not an image'))).toBeNull();
  });
});

describe('zoneOf and pixelRect', () => {
  it('takes a zone as it is, and a point as a fifth of the image around it, kept inside', () => {
    expect(zoneOf({ x: 20, y: 30, w: 25, h: 30 })).toEqual({ x: 20, y: 30, w: 25, h: 30 });
    expect(zoneOf({ x: 50, y: 50 })).toEqual({ x: 40, y: 40, w: 20, h: 20 });
    expect(zoneOf({ x: 2, y: 99 })).toEqual({ x: 0, y: 80, w: 20, h: 20 });
  });

  it('turns a zone into whole pixels of the image', () => {
    expect(pixelRect({ x: 20, y: 30, w: 25, h: 30 }, { width: 1280, height: 600 })).toEqual({
      left: 256,
      top: 180,
      width: 320,
      height: 180,
    });
  });
});

describe('cropPng', () => {
  it('cuts the pixels of a zone out of a PNG, whatever filter each row used', () => {
    const cut = cropPng(png(40, 20), { left: 10, top: 5, width: 6, height: 4 });
    if (!cut) throw new Error('cut');
    const read = pixels(cut);
    expect([read.width, read.height]).toEqual([6, 4]);
    expect(read.at(0, 0)).toEqual([10, 5, 7]);
    expect(read.at(5, 3)).toEqual([15, 8, 7]);
  });
});
