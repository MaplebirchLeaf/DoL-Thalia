import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { decodePng, encodePng, resizeNearest, resizePngFile } from '../src/tools/png-resize';

function fixturePng(width: number, height: number): Buffer {
  // Distinct value per pixel so resampling mistakes cannot cancel out.
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      pixels[at] = (x * 7) % 256;
      pixels[at + 1] = (y * 11) % 256;
      pixels[at + 2] = ((x + y) * 3) % 256;
      pixels[at + 3] = 255;
    }
  }
  return encodePng({ bpp: 4, height, pixels, width });
}

test('resized output decodes back to the expected nearest-neighbour pixels', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-png-resize-'));
  try {
    const source = join(root, 'icon.png');
    await writeFile(source, fixturePng(144, 144));
    const decoded = decodePng(await readFile(source));

    const target = join(root, 'nested/mipmap-xxhdpi/ic_launcher.png');
    await resizePngFile(source, target, 192);

    const output = decodePng(await readFile(target));
    expect(output.width).toBe(192);
    expect(output.height).toBe(192);
    expect(output.bpp).toBe(4);

    const expected = resizeNearest(decoded, 192, 192);
    expect(Buffer.from(output.pixels).equals(Buffer.from(expected.pixels))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('every launcher icon size produces a distinct, correctly sized image', async () => {
  // Regression guard: the previous non-Windows path copied the source file unchanged,
  // so all twelve launcher icons ended up at the 144x144 source size.
  const root = await mkdtemp(join(tmpdir(), 'thalia-png-sizes-'));
  try {
    const source = join(root, 'icon.png');
    await writeFile(source, fixturePng(144, 144));
    const sizes = [36, 48, 72, 96, 144, 192, 81, 108, 162, 216, 324, 432];
    const seen = new Map<number, number>();
    for (const size of sizes) {
      const target = join(root, `icon-${size}.png`);
      await resizePngFile(source, target, size);
      const decoded = decodePng(await readFile(target));
      expect(decoded.width).toBe(size);
      expect(decoded.height).toBe(size);
      seen.set(size, (await readFile(target)).length);
    }
    expect(seen.size).toBe(sizes.length);
    expect(seen.get(432)).not.toBe(seen.get(144));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('upscaling above the source resolution enlarges instead of copying', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-png-upscale-'));
  try {
    const source = join(root, 'icon.png');
    await writeFile(source, fixturePng(144, 144));
    const target = join(root, 'large.png');
    await resizePngFile(source, target, 432);
    const decoded = decodePng(await readFile(target));
    expect(decoded.width).toBe(432);
    const expected = resizeNearest(decodePng(await readFile(source)), 432, 432);
    expect(Buffer.from(decoded.pixels).equals(Buffer.from(expected.pixels))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('unsupported PNG variants are rejected instead of silently copied', async () => {
  const root = await mkdtemp(join(tmpdir(), 'thalia-png-reject-'));
  try {
    const notPng = join(root, 'icon.png');
    await writeFile(notPng, Buffer.from('not a png at all'));
    await expect(resizePngFile(notPng, join(root, 'out.png'), 48)).rejects.toThrow('Not a PNG file');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
