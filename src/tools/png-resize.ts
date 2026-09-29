import { deflateSync, inflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

interface PngImage {
  bpp: number;
  height: number;
  pixels: Uint8Array;
  width: number;
}

export function decodePng(data: Uint8Array): PngImage {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG file');

  let header: { colorType: number; depth: number; height: number; interlace: number; width: number } | undefined;
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12]
      };
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  if (!header) throw new Error('PNG is missing an IHDR chunk');
  if (header.depth !== 8) throw new Error(`Unsupported PNG bit depth: ${header.depth}`);
  if (header.interlace !== 0) throw new Error('Interlaced PNG files are not supported');
  const bpp = CHANNELS[header.colorType];
  if (!bpp) throw new Error(`Unsupported PNG color type: ${header.colorType}`);

  return {
    bpp,
    height: header.height,
    width: header.width,
    pixels: unfilter(inflateSync(Buffer.concat(idat)), header.width, header.height, bpp)
  };
}

export function encodePng(image: PngImage): Buffer {
  const { bpp, height, pixels, width } = image;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const colorType = bpp === 1 ? 0 : bpp === 2 ? 4 : bpp === 3 ? 2 : 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk(
      'IHDR',
      (() => {
        const header = Buffer.alloc(13);
        header.writeUInt32BE(width, 0);
        header.writeUInt32BE(height, 4);
        header[8] = 8;
        header[9] = colorType;
        return header;
      })()
    ),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

export function resizeNearest(image: PngImage, width: number, height: number): PngImage {
  const { bpp, height: sourceHeight, pixels: source, width: sourceWidth } = image;
  const target = new Uint8Array(width * height * bpp);
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / height));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / width));
      const from = (sourceY * sourceWidth + sourceX) * bpp;
      const to = (y * width + x) * bpp;
      target.set(source.subarray(from, from + bpp), to);
    }
  }
  return { bpp, height, pixels: target, width };
}

export async function resizePngFile(source: string, target: string, size: number): Promise<void> {
  const resized = resizeNearest(decodePng(await readFile(source)), size, size);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, encodePng(resized));
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const payload = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([length, payload, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function unfilter(raw: Buffer, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) throw new Error('PNG image data is truncated');
  const out = new Uint8Array(stride * height);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = Uint8Array.prototype.slice.call(raw, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    if (filter === 1) {
      for (let i = bpp; i < stride; i++) line[i] = (line[i]! + line[i - bpp]!) & 0xff;
    } else if (filter === 2) {
      for (let i = 0; i < stride; i++) line[i] = (line[i]! + previous[i]!) & 0xff;
    } else if (filter === 3) {
      for (let i = 0; i < stride; i++) {
        const left = i >= bpp ? line[i - bpp]! : 0;
        line[i] = (line[i]! + ((left + previous[i]!) >> 1)) & 0xff;
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i++) {
        const left = i >= bpp ? line[i - bpp]! : 0;
        const up = previous[i]!;
        const upLeft = i >= bpp ? previous[i - bpp]! : 0;
        const estimate = left + up - upLeft;
        const pa = Math.abs(estimate - left);
        const pb = Math.abs(estimate - up);
        const pc = Math.abs(estimate - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        line[i] = (line[i]! + predictor) & 0xff;
      }
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter type: ${filter}`);
    }
    out.set(line, y * stride);
    previous = line;
  }
  return out;
}
