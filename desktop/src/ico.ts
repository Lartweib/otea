// A Windows .ico holding PNG images, one per size (Vista and later read PNG entries). Windows picks
// the size it needs for the taskbar, the tray and the DPI, so each size keeps its own hinting.
export type IcoImage = { size: number; png: Uint8Array };

const HEADER = 6;
const ENTRY = 16;

export function encodeIco(images: readonly IcoImage[]): Buffer {
  const header = Buffer.alloc(HEADER + ENTRY * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    if (size < 1 || size > 256) throw new RangeError(`An icon entry is 1 to 256px, got ${size}`);
    const at = HEADER + ENTRY * index;
    header.writeUInt8(size === 256 ? 0 : size, at); // 0 means 256
    header.writeUInt8(size === 256 ? 0 : size, at + 1);
    header.writeUInt8(0, at + 2); // no palette
    header.writeUInt8(0, at + 3); // reserved
    header.writeUInt16LE(1, at + 4); // color planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => Buffer.from(png))]);
}
